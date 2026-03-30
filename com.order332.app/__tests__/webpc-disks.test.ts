import { describe, expect, it } from 'vitest'
import {
  buildWebpcDiskObjectKey,
  WEBPC_DISK_BASENAMES,
  WEBPC_MACHINE_IDS,
  webpcDiskPublicPath,
} from '@/lib/webpc-disks'

describe('webpc-disks', () => {
  it('has a basename for every machine id', () => {
    for (const id of WEBPC_MACHINE_IDS) {
      expect(WEBPC_DISK_BASENAMES[id]).toMatch(/\.ext2$/)
      expect(webpcDiskPublicPath(id)).toBe(`/webpc-disks/${WEBPC_DISK_BASENAMES[id]}`)
    }
  })

  it('buildWebpcDiskObjectKey joins prefix and basename', () => {
    expect(buildWebpcDiskObjectKey('debianGui', 'webpc-images/')).toBe(
      'webpc-images/debian-gui.ext2',
    )
    expect(buildWebpcDiskObjectKey('debianGui', 'webpc-images')).toBe('webpc-images/debian-gui.ext2')
  })
})
