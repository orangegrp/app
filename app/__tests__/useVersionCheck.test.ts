// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVersionCheck } from '../hooks/useVersionCheck'
import { useSettingsStore } from '../lib/settings-store'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

async function flushPromises() {
  // Flush macrotasks (setTimeout(0)) and then microtasks twice to ensure
  // async work inside deferred callbacks also completes.
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe('useVersionCheck', () => {
  beforeEach(() => {
    useSettingsStore.setState({ knownAppVersion: null })
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('does not set hasUpdate on first load — records version instead', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: 'abc123' }),
    })

    const { result } = renderHook(() => useVersionCheck())

    await act(async () => {
      await flushPromises()
    })

    expect(result.current.hasUpdate).toBe(false)
    expect(useSettingsStore.getState().knownAppVersion).toBe('abc123')
  })

  it('sets hasUpdate when server version differs from known version', async () => {
    useSettingsStore.setState({ knownAppVersion: 'old-version' })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: 'new-version' }),
    })

    const { result } = renderHook(() => useVersionCheck())

    await act(async () => {
      await flushPromises()
    })

    expect(result.current.hasUpdate).toBe(true)
  })

  it('does not set hasUpdate when version matches', async () => {
    useSettingsStore.setState({ knownAppVersion: 'same-version' })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: 'same-version' }),
    })

    const { result } = renderHook(() => useVersionCheck())

    await act(async () => {
      await flushPromises()
    })

    expect(result.current.hasUpdate).toBe(false)
  })

  it('gracefully handles fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useVersionCheck())

    await act(async () => {
      await flushPromises()
    })

    expect(result.current.hasUpdate).toBe(false)
  })
})
