import { useAuthStore } from './auth-store'
import { fetchAndMergeUserProfile } from './fetch-user-profile'
import { isPWAContext } from './pwa'

type FetchOptions = RequestInit & { skipAuth?: boolean }

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPwa: isPWAContext() }),
      credentials: 'include',
    })
    if (!res.ok) return null
    const data = await res.json() as { accessToken: string }
    return data.accessToken
  } catch {
    return null
  }
}

export async function apiFetch(path: string, options: FetchOptions = {}): Promise<Response> {
  const { skipAuth = false, ...fetchOptions } = options
  const store = useAuthStore.getState()

  const headers = new Headers(fetchOptions.headers)
  if (!headers.has('Content-Type') && fetchOptions.body) {
    headers.set('Content-Type', 'application/json')
  }

  if (!skipAuth && store.accessToken) {
    headers.set('Authorization', `Bearer ${store.accessToken}`)
  }

  let res = await fetch(`/api${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  })

  // Auto-refresh on 401
  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      // Decode token to get user info
      const [, payloadB64] = newToken.split('.')
      try {
        const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as {
          sub: string
          permissions: string
          isPwa: boolean
        }
        store.setAuth(newToken, {
          id: payload.sub,
          permissions: payload.permissions,
          isPwa: payload.isPwa,
        })
        void fetchAndMergeUserProfile(newToken)
      } catch {
        store.clearAuth()
        return res
      }

      headers.set('Authorization', `Bearer ${newToken}`)
      res = await fetch(`/api${path}`, { ...fetchOptions, headers, credentials: 'include' })
    } else {
      store.clearAuth()
    }
  }

  return res
}

export async function apiGet<T>(path: string, options?: FetchOptions): Promise<T> {
  const res = await apiFetch(path, { ...options, method: 'GET' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' })) as { error: string }
    throw new Error(err.error)
  }
  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body?: unknown, options?: FetchOptions): Promise<T> {
  const res = await apiFetch(path, {
    ...options,
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' })) as { error: string }
    throw new Error(err.error)
  }
  return res.json() as Promise<T>
}

export async function apiPatch<T>(path: string, body?: unknown, options?: FetchOptions): Promise<T> {
  const res = await apiFetch(path, {
    ...options,
    method: 'PATCH',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' })) as { error: string }
    throw new Error(err.error)
  }
  return res.json() as Promise<T>
}

export async function apiDelete<T>(path: string, body?: unknown, options?: FetchOptions): Promise<T> {
  const res = await apiFetch(path, {
    ...options,
    method: 'DELETE',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' })) as { error: string }
    throw new Error(err.error)
  }
  return res.json() as Promise<T>
}
