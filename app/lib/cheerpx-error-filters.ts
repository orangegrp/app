/**
 * CheerpX may load a placeholder `fail.wasm` (empty / non-WASM bytes), causing
 * WebAssembly.compile() to throw CompileError with invalid magic. Expected for
 * that path; callers filter it from fatal UI / dev overlay.
 */

const MAGIC_ASM = '00 61 73 6d'

export function isBenignCheerpXWasmPlaceholderError(text: string): boolean {
  const m = text.toLowerCase()
  // Any reference to the placeholder file name
  if (m.includes('fail.wasm')) return true
  // Chrome: "WebAssembly.compile(): expected magic word 00 61 73 6d, found XX @+0"
  // Note: CompileError.message does NOT include the "CompileError:" prefix, so we
  // must not require it here — only check for the WASM magic word signature.
  if (m.includes('magic word') && m.includes(MAGIC_ASM)) return true
  // Firefox: "wasm validation error: at offset 0: failed to match magic number"
  if ((m.includes('wasm') || m.includes('webassembly')) && m.includes('magic number')) return true
  // Safari: "WebAssembly.Module doesn't parse at byte 0: 0x00 0x61 0x73 0x6D is expected"
  if (m.includes('webassembly') && m.includes('parse at byte 0')) return true
  return false
}

export function errorEventToSearchString(e: ErrorEvent): string {
  const parts = [e.message ?? '', e.filename ?? '']
  if (e.error instanceof Error) {
    parts.push(e.error.message, e.error.stack ?? '')
  }
  return parts.join('\n')
}

function rejectionReasonToSearchString(reason: unknown): string {
  if (reason instanceof Error) {
    return [reason.message, reason.stack ?? ''].join('\n')
  }
  return String(reason ?? '')
}

export function isBenignCheerpXWasmPlaceholderRejection(reason: unknown): boolean {
  return isBenignCheerpXWasmPlaceholderError(rejectionReasonToSearchString(reason))
}
