/** WebPC VM types — shared by client, server, and session storage. */
export const WEBPC_MACHINE_IDS = [
  "debian",
  "alpine",
  "debianTerminal",
  "debianGui",
  "alpineTerminal",
  "alpineGui",
] as const

export type MachineId = (typeof WEBPC_MACHINE_IDS)[number]

/** Basename of the `.ext2` image in `public/webpc-disks/` and under the R2 key prefix. */
export const WEBPC_DISK_BASENAMES: Record<MachineId, string> = {
  debian: "debian_large_20230522_5044875331_2.ext2",
  alpine: "alpine_20251007.ext2",
  debianTerminal: "debian-terminal.ext2",
  debianGui: "debian-gui.ext2",
  alpineTerminal: "alpine-terminal.ext2",
  alpineGui: "alpine-gui.ext2",
}

const WEBPC_PUBLIC_PREFIX = "/webpc-disks/"

/** Same-origin path served from `public/webpc-disks/` (local / fallback). */
export function webpcDiskPublicPath(machineId: MachineId): string {
  return `${WEBPC_PUBLIC_PREFIX}${WEBPC_DISK_BASENAMES[machineId]}`
}

/** R2 object key: `{prefix}{basename}` — prefix should end with `/` or is normalised. */
export function buildWebpcDiskObjectKey(
  machineId: MachineId,
  keyPrefix: string
): string {
  const prefix = keyPrefix.replace(/\/?$/, "/")
  return `${prefix}${WEBPC_DISK_BASENAMES[machineId]}`
}
