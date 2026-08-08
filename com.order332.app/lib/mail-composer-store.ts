export type MailComposerPrefill = {
  to?: string[]
  subject?: string
  body?: string
}

const MAIL_COMPOSER_OPEN_EVENT = "mail-compose:open"

export function openMailComposer(prefill?: MailComposerPrefill): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(MAIL_COMPOSER_OPEN_EVENT, {
      detail: prefill ?? {},
    })
  )
}

export function onMailComposerOpen(
  handler: (prefill: MailComposerPrefill) => void
): () => void {
  if (typeof window === "undefined") return () => {}
  const listener = (event: Event) => {
    const custom = event as CustomEvent<MailComposerPrefill>
    handler(custom.detail ?? {})
  }
  window.addEventListener(MAIL_COMPOSER_OPEN_EVENT, listener)
  return () => window.removeEventListener(MAIL_COMPOSER_OPEN_EVENT, listener)
}
