/**
 * Full document navigation (not Next.js client-side routing).
 * Use for OAuth entry points and anything that must load as a new document
 * (e.g. cookies, redirects to external IdPs).
 */
export function hardNavigateTo(url: string): void {
  if (typeof window === 'undefined') return
  const absolute =
    url.startsWith('http://') || url.startsWith('https://')
      ? url
      : `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`
  setTimeout(() => {
    window.location.assign(absolute)
  }, 0)
}
