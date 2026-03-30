// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '../lib/auth-store'

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      user: null,
      isLoading: true,
    })
  })

  it('starts with null auth state and isLoading=true', () => {
    const { accessToken, user, isLoading } = useAuthStore.getState()
    expect(accessToken).toBeNull()
    expect(user).toBeNull()
    expect(isLoading).toBe(true)
  })

  it('setAuth stores token and user, sets isLoading=false', () => {
    useAuthStore.getState().setAuth('my-token', {
      id: 'user-1',
      permissions: 'home.view',
      isPwa: false,
      discordUsername: 'alice',
    })
    const { accessToken, user, isLoading } = useAuthStore.getState()
    expect(accessToken).toBe('my-token')
    expect(user?.id).toBe('user-1')
    expect(user?.permissions).toBe('home.view')
    expect(user?.isPwa).toBe(false)
    expect(user?.discordUsername).toBe('alice')
    expect(isLoading).toBe(false)
  })

  it('clearAuth resets token and user, sets isLoading=false', () => {
    useAuthStore.getState().setAuth('my-token', {
      id: 'user-1',
      permissions: 'home.view',
      isPwa: false,
    })
    useAuthStore.getState().clearAuth()
    const { accessToken, user, isLoading } = useAuthStore.getState()
    expect(accessToken).toBeNull()
    expect(user).toBeNull()
    expect(isLoading).toBe(false)
  })

  it('setLoading updates isLoading flag', () => {
    useAuthStore.getState().setLoading(false)
    expect(useAuthStore.getState().isLoading).toBe(false)
    useAuthStore.getState().setLoading(true)
    expect(useAuthStore.getState().isLoading).toBe(true)
  })

  it('permissions stored as CSV string', () => {
    useAuthStore.getState().setAuth('token', {
      id: 'user-1',
      permissions: 'app.webpc,app.labs',
      isPwa: false,
    })
    expect(useAuthStore.getState().user?.permissions).toBe('app.webpc,app.labs')
  })

  it('mergeAuthUser patches Discord fields without replacing token', () => {
    useAuthStore.getState().setAuth('my-token', {
      id: 'user-1',
      permissions: 'app.webpc',
      isPwa: false,
    })
    useAuthStore.getState().mergeAuthUser({
      discordUsername: 'bob',
      discordAvatar: 'https://cdn.discordapp.com/avatars/x/y.png',
    })
    const { accessToken, user } = useAuthStore.getState()
    expect(accessToken).toBe('my-token')
    expect(user?.discordUsername).toBe('bob')
    expect(user?.discordAvatar).toContain('https://')
  })

  it('access token is NOT persisted (no persist middleware)', () => {
    useAuthStore.getState().setAuth('secret-token', { id: 'u', permissions: '*', isPwa: false })
    // The store uses create() without persist — localStorage should have no auth entry
    const keys = Object.keys(localStorage)
    const hasAuthKey = keys.some((k) => k.includes('auth'))
    expect(hasAuthKey).toBe(false)
  })
})
