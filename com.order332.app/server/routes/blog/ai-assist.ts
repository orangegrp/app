import 'server-only'
import { z } from 'zod'
import { Hono } from 'hono'
import { generateText, streamText } from 'ai'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { PERMISSIONS } from '@/lib/permissions'
import { uploadBlogImageBuffer } from '@/server/lib/blog-image-upload'
import type { HonoEnv } from '@/server/lib/types'

const MAX_SNIPPET_LENGTH = 20_000

const aiAssistActionSchema = z.enum([
  'proofread',
  'rephrase',
  'expand',
  'condense',
  'translate',
  'quickDraft',
  'createImage',
])

const bodySchema = z
  .object({
    action: aiAssistActionSchema,
    text: z.string().max(MAX_SNIPPET_LENGTH),
    targetLanguage: z.string().max(80).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === 'translate') {
      if (!data.targetLanguage?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'targetLanguage is required for translate',
          path: ['targetLanguage'],
        })
      }
    } else if (data.targetLanguage != null && data.targetLanguage.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'targetLanguage is only allowed for translate',
        path: ['targetLanguage'],
      })
    }
  })

/** Shared rules merged into each text system prompt (plan canonical copy). */
const SHARED_TEXT_RULES = `Output only the transformed text: no markdown fences, no surrounding quotes, no preamble or postscript. Preserve the language of the input (e.g. English in → English out).`

const SYSTEM_PROOFREAD = `${SHARED_TEXT_RULES} You are a careful copy editor. Fix spelling, grammar, and punctuation. Keep meaning, tone, and register the same. Do not add or remove ideas. Do not change wording except when required for correctness. Output only the corrected text.`

const SYSTEM_REPHRASE = `${SHARED_TEXT_RULES} You improve how text reads. Rewrite for clearer, more natural phrasing while preserving meaning, facts, and intent. Do not add new claims or examples. Keep similar length unless small edits are needed for flow. Output only the rewritten passage.`

const SYSTEM_EXPAND = `${SHARED_TEXT_RULES} You elaborate on a short passage. Add depth with explanation, context, or nuance where it fits naturally. Do not invent facts, statistics, names, or citations. Stay faithful to the original idea. Write in a natural, readable voice. Output only the expanded text.`

const SYSTEM_CONDENSE = `${SHARED_TEXT_RULES} You tighten prose without losing substance. Preserve every distinct idea, constraint, and detail; do not omit important qualifications. Prefer shorter sentences and fewer words, not vague summaries. Output only the condensed text.`

const SYSTEM_QUICK_DRAFT = `Output only the draft body: no markdown fences around the entire answer, no surrounding quotes, no preamble or postscript. The user will send rough notes or a braindump. Turn it into coherent, readable prose suitable for a blog post. Use light markdown where it helps (headings, lists, emphasis) but do not invent facts, numbers, or quotes. If the input is vague, organize and clarify without adding new claims. Output only the draft.`

const SYSTEM_ALT = `Write one concise image alt string for accessibility: describe what matters visually in at most 125 characters. Do not wrap in quotes. Do not start with "image of". Output only the alt text.`

function systemTranslate(targetLanguage: string): string {
  const lang = targetLanguage.trim()
  return `Output only the translated text: no markdown fences around the whole answer, no surrounding quotes, no preamble or postscript. Translate the following into ${lang}. Preserve markdown structure (headings ATX/SETEXT, bullet/numbered lists, links, inline code, fenced code blocks). Preserve meaning, tone, and register. Do not translate code identifiers inside code spans or fences unless the user text clearly requires it. Output only the translated text.`
}

const MODEL_TEXT_NANO = 'openai/gpt-5.4-nano' as const
const MODEL_PROOFREAD = MODEL_TEXT_NANO
const MODEL_REPHRASE = 'anthropic/claude-haiku-4.5' as const
const MODEL_EXPAND = 'anthropic/claude-haiku-4.5' as const
const MODEL_CONDENSE = MODEL_TEXT_NANO
const MODEL_IMAGE = 'google/gemini-2.5-flash-image' as const
const MODEL_ALT = MODEL_TEXT_NANO

function imagePromptFromSnippet(snippet: string): string {
  return `Create a high-quality illustration for a blog post based on this theme:\n\n${snippet}\n\nStyle: clear, professional; no overlaid text unless the theme explicitly requires legible words. No watermarks.`
}

function assertGatewayConfigured(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.AI_GATEWAY_API_KEY?.trim()) {
    throw new Error('AI gateway is not configured')
  }
}

export const blogAiAssistRoutes = new Hono<HonoEnv>()

blogAiAssistRoutes.use('*', requireAuth)
blogAiAssistRoutes.use('*', requirePermission(PERMISSIONS.APP_BLOG))
blogAiAssistRoutes.use('*', requirePermission(PERMISSIONS.APP_BLOG_AI))

blogAiAssistRoutes.post('/', async (c) => {
  let json: unknown
  try {
    json = await c.req.json()
  } catch {
    return c.json({ error: 'Expected JSON body' }, 400)
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return c.json({ error: 'Invalid request' }, 400)
  }

  const { action, text, targetLanguage } = parsed.data
  const trimmed = text.trim()
  if (!trimmed) {
    return c.json({ error: 'Text is empty' }, 400)
  }

  try {
    assertGatewayConfigured()
  } catch {
    return c.json({ error: 'AI is not configured' }, 503)
  }

  if (action === 'createImage') {
    try {
      const imageGen = await generateText({
        model: MODEL_IMAGE,
        prompt: imagePromptFromSnippet(trimmed),
      })

      const file = imageGen.files.find((f) => f.mediaType?.startsWith('image/'))
      if (!file) {
        return c.json({ error: 'No image generated' }, 502)
      }

      const u8 = file.uint8Array
      const buffer = u8.buffer.slice(
        u8.byteOffset,
        u8.byteOffset + u8.byteLength,
      ) as ArrayBuffer

      const { text: altRaw } = await generateText({
        model: MODEL_ALT,
        system: SYSTEM_ALT,
        prompt: trimmed,
      })

      const alt = altRaw.trim().slice(0, 125)

      const user = c.get('user')
      const { publicUrl } = await uploadBlogImageBuffer({
        userId: user.id,
        buffer,
        contentType: file.mediaType,
        filenameHint: 'ai-blog-image',
      })

      return c.json({ url: publicUrl, alt: alt || 'Blog illustration' }, 201)
    } catch (err) {
      console.error('[blog/ai-assist] createImage error:', err)
      const msg = err instanceof Error ? err.message : 'Image generation failed'
      return c.json({ error: msg }, 502)
    }
  }

  if (action === 'translate' || action === 'quickDraft') {
    const system = action === 'translate' ? systemTranslate(targetLanguage!) : SYSTEM_QUICK_DRAFT
    const model = MODEL_TEXT_NANO
    try {
      const result = streamText({
        model,
        system,
        prompt: trimmed,
      })
      return result.toTextStreamResponse()
    } catch (err) {
      console.error('[blog/ai-assist] streamText error:', err)
      return c.json({ error: 'Generation failed' }, 502)
    }
  }

  const system =
    action === 'proofread'
      ? SYSTEM_PROOFREAD
      : action === 'rephrase'
        ? SYSTEM_REPHRASE
        : action === 'expand'
          ? SYSTEM_EXPAND
          : SYSTEM_CONDENSE

  const model =
    action === 'proofread'
      ? MODEL_PROOFREAD
      : action === 'rephrase'
        ? MODEL_REPHRASE
        : action === 'expand'
          ? MODEL_EXPAND
          : MODEL_CONDENSE

  try {
    const result = streamText({
      model,
      system,
      prompt: trimmed,
    })
    return result.toTextStreamResponse()
  } catch (err) {
    console.error('[blog/ai-assist] streamText error:', err)
    return c.json({ error: 'Generation failed' }, 502)
  }
})
