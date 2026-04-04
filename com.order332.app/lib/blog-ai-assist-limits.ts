/** Hard caps (UTF-16 code units) for user-supplied text per blog AI feature — short-snippet scope. */
export const BLOG_AI_MAX_INPUT_CHARS = {
  proofread: 6_000,
  rephrase: 2_000,
  expand: 2_000,
  condense: 2_000,
  translate: 2_000,
  quickDraft: 2_000,
  createImage: 1_00,
} as const

export type BlogAiAssistActionName = keyof typeof BLOG_AI_MAX_INPUT_CHARS

/** Absolute maximum request body `text` field length (before per-action trim check). */
export const BLOG_AI_MAX_REQUEST_TEXT_CHARS = Math.max(
  ...Object.values(BLOG_AI_MAX_INPUT_CHARS),
)
