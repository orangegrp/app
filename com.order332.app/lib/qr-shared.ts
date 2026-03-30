/**
 * QR rolling HMAC token — shared between [`app/server/lib/totp.ts`](../server/lib/totp.ts) and the desktop [`QRLoginPanel`](../components/auth/QRLoginPanel.tsx).
 * Keep step and tolerance in sync with the server implementation.
 */

/** New token every N ms (1s). */
export const QR_ROLLING_STEP_MS = 1000

/**
 * Verify window (each side): accept counters from current±N steps (1s steps).
 */
export const QR_ROLLING_COUNTER_TOLERANCE = 7

/**
 * Desktop polls `/api/auth/qr/code` this often to refresh the QR before the next 1s rotation.
 */
export const QR_CODE_POLL_MS = 500

/**
 * QR symbol version for login QR images: version V has **(4V + 17)** modules per side (ISO/IEC 18004).
 * **V = 10 → 57×57 modules.** Use with `qrcode.react` `minVersion` so the bitmap is always this grid;
 * pair with error correction **H** so spare capacity goes to ECC.
 */
export const QR_LOGIN_SYMBOL_VERSION = 10
