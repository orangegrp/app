/** Session key written by `/auth/qr` when the user must sign in before approving desktop login. */
const QR_REDIRECT_KEY = 'qr_redirect'

/**
 * Returns the path to open after a successful sign-in, or `/home` if there was no pending QR handoff.
 * Clears the stored value so it is only used once.
 */
export function consumePostLoginRedirect(): string {
  if (typeof window === 'undefined') return '/home'
  const path = sessionStorage.getItem(QR_REDIRECT_KEY)
  if (path) {
    sessionStorage.removeItem(QR_REDIRECT_KEY)
    return path
  }
  return '/home'
}
