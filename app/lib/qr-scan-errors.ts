/** User-facing copy when the URL has no session/token (broken deep link or stripped query). */
export const QR_LINK_INCOMPLETE_MSG =
  'This link is incomplete. Open it from the QR code on your desktop login screen.'

/**
 * Maps API `error` codes from `POST /api/auth/qr/scan` to user-facing text.
 */
export function mapQrScanError(error: string | undefined): string {
  switch (error) {
    case 'qr_token_invalid':
      return 'This QR link does not match the login request. Show a fresh QR on the desktop and scan again.'
    case 'qr_session_invalid':
      return 'This login request expired or was already used. Start a new QR login on the desktop.'
    case 'Invalid or expired QR session':
      return 'This login request expired or was already used. Start a new QR login on the desktop.'
    default:
      return error ?? 'Unable to verify this QR code. Try again.'
  }
}
