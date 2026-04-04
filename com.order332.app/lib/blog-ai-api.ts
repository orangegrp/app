import { useAuthStore } from '@/lib/auth-store'

export type BlogAiAssistAction =
  | 'proofread'
  | 'rephrase'
  | 'expand'
  | 'condense'
  | 'translate'
  | 'quickDraft'
  | 'createImage'

export type BlogAiAssistRequestOptions = RequestInit & {
  /** Required when `action` is `translate` (e.g. "Japanese", "Spanish"). */
  targetLanguage?: string
}

/**
 * POST /api/blog/ai-assist — text actions return `text/plain` stream; `createImage` returns JSON `{ url, alt }`.
 */
export async function blogAiAssistRequest(
  action: BlogAiAssistAction,
  text: string,
  init?: BlogAiAssistRequestOptions,
): Promise<Response> {
  const { accessToken } = useAuthStore.getState()
  const { targetLanguage, ...fetchInit } = init ?? {}
  const body: Record<string, unknown> = { action, text }
  if (targetLanguage !== undefined && targetLanguage !== '') {
    body.targetLanguage = targetLanguage
  }
  return fetch('/api/blog/ai-assist', {
    ...fetchInit,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(fetchInit.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
    credentials: fetchInit.credentials ?? 'include',
  })
}

/** Reads a plain-text streamed body (from `streamText().toTextStreamResponse()`). */
export async function consumeBlogAiTextStream(
  response: Response,
  onDelta: (accumulated: string) => void,
): Promise<string> {
  if (!response.ok) {
    const err = (await response.json().catch(() => ({ error: 'Request failed' }))) as { error?: string }
    throw new Error(err.error ?? 'Request failed')
  }

  const ct = response.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    const err = (await response.json().catch(() => ({ error: 'Request failed' }))) as { error?: string }
    throw new Error(err.error ?? 'Request failed')
  }

  const MAX_STREAM_CHARS = 32_000

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    full += decoder.decode(value, { stream: true })
    if (full.length > MAX_STREAM_CHARS) {
      reader.cancel().catch(() => {})
      throw new Error('AI response exceeded size limit')
    }
    onDelta(full)
  }
  const tail = decoder.decode()
  if (tail) {
    full += tail
    onDelta(full)
  }
  return full
}

export async function blogAiAssistCreateImage(
  prompt: string,
  needsText: boolean,
  signal?: AbortSignal,
): Promise<{ url: string; alt: string }> {
  const { accessToken } = useAuthStore.getState()
  const res = await fetch('/api/blog/ai-assist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ action: 'createImage', text: prompt, needsText }),
    credentials: 'include',
    signal,
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'Image generation failed' }))) as { error?: string }
    throw new Error(err.error ?? 'Image generation failed')
  }
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) {
    return { url: '', alt: '' }
  }
  const data = (await res.json().catch(() => null)) as { url?: string; alt?: string } | null
  if (!data || typeof data !== 'object') {
    return { url: '', alt: '' }
  }
  return {
    url: typeof data.url === 'string' ? data.url : '',
    alt: typeof data.alt === 'string' ? data.alt : '',
  }
}
