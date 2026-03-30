// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAuthStore } from '../lib/auth-store'
import { usePermission, useAnyPermission } from '../hooks/usePermission'

const setUser = (permissions: string) =>
  useAuthStore.setState({
    accessToken: 'test-token',
    user: { id: 'user-1', permissions, isPwa: false },
    isLoading: false,
  })

describe('usePermission', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, isLoading: false })
  })

  it('returns false when user is not authenticated', () => {
    const { result } = renderHook(() => usePermission('home.view'))
    expect(result.current).toBe(false)
  })

  it('returns true when user has the exact permission', () => {
    setUser('home.view')
    const { result } = renderHook(() => usePermission('home.view'))
    expect(result.current).toBe(true)
  })

  it('returns false when user lacks the permission', () => {
    setUser('home.view')
    const { result } = renderHook(() => usePermission('admin.users.manage'))
    expect(result.current).toBe(false)
  })

  it('returns true for wildcard permissions (*)', () => {
    setUser('*')
    const { result } = renderHook(() => usePermission('admin.users.manage'))
    expect(result.current).toBe(true)
  })

  it('returns true for CSV permission string', () => {
    setUser('home.view,app.labs,admin.settings')
    const { result: r1 } = renderHook(() => usePermission('app.labs'))
    const { result: r2 } = renderHook(() => usePermission('admin.settings'))
    expect(r1.current).toBe(true)
    expect(r2.current).toBe(true)
  })

  it('returns false for partial/substring match', () => {
    setUser('home.view')
    const { result } = renderHook(() => usePermission('home'))
    expect(result.current).toBe(false)
  })

  it('handles permissions with spaces after commas', () => {
    setUser('home.view, app.labs')
    const { result } = renderHook(() => usePermission('app.labs'))
    expect(result.current).toBe(true)
  })
})

describe('useAnyPermission', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, isLoading: false })
  })

  it('returns false when user is not authenticated', () => {
    const { result } = renderHook(() => useAnyPermission(['home.view', 'app.labs']))
    expect(result.current).toBe(false)
  })

  it('returns true if user has at least one of the permissions', () => {
    setUser('home.view')
    const { result } = renderHook(() => useAnyPermission(['admin.settings', 'home.view']))
    expect(result.current).toBe(true)
  })

  it('returns false if user has none of the permissions', () => {
    setUser('home.view')
    const { result } = renderHook(() => useAnyPermission(['admin.settings', 'app.labs']))
    expect(result.current).toBe(false)
  })

  it('returns true for wildcard when any permission is checked', () => {
    setUser('*')
    const { result } = renderHook(() => useAnyPermission(['admin.settings', 'some.other']))
    expect(result.current).toBe(true)
  })
})
