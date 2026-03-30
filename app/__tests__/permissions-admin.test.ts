import { describe, expect, it } from 'vitest'
import {
  assertCannotDemoteOtherAdmin,
  assertSelfAdminAccessMaintained,
  isSuperuserPermissionsCsv,
  parseAndValidatePermissionsInput,
  PERMISSIONS,
  SUPERUSER_PERMISSION,
} from '@/lib/permissions'

describe('parseAndValidatePermissionsInput', () => {
  it('accepts known permissions and returns sorted CSV', () => {
    const r = parseAndValidatePermissionsInput([
      PERMISSIONS.APP_WEBPC,
      PERMISSIONS.APP_BLOG,
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.csv).toBe(`${PERMISSIONS.APP_BLOG},${PERMISSIONS.APP_WEBPC}`)
  })

  it('rejects unknown permission strings', () => {
    const r = parseAndValidatePermissionsInput([PERMISSIONS.APP_LABS, 'custom.fake'])
    expect(r.ok).toBe(false)
  })

  it('collapses to * when superuser is included', () => {
    const r = parseAndValidatePermissionsInput([PERMISSIONS.APP_LABS, SUPERUSER_PERMISSION])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.csv).toBe(SUPERUSER_PERMISSION)
  })

  it('allows * alone', () => {
    const r = parseAndValidatePermissionsInput([SUPERUSER_PERMISSION])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.csv).toBe(SUPERUSER_PERMISSION)
  })

  it('returns empty string for empty selection', () => {
    const r = parseAndValidatePermissionsInput([])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.csv).toBe('')
  })

  it('deduplicates entries', () => {
    const r = parseAndValidatePermissionsInput([PERMISSIONS.APP_MUSIC, PERMISSIONS.APP_MUSIC])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.csv).toBe(PERMISSIONS.APP_MUSIC)
  })
})

describe('assertSelfAdminAccessMaintained', () => {
  it('allows editing another user to non-admin', () => {
    const r = assertSelfAdminAccessMaintained('u1', 'u2', '')
    expect(r.ok).toBe(true)
  })

  it('blocks self from removing all admin access', () => {
    const r = assertSelfAdminAccessMaintained('same', 'same', '')
    expect(r.ok).toBe(false)
  })

  it('allows self to keep admin.invites.manage', () => {
    const r = assertSelfAdminAccessMaintained(
      'same',
      'same',
      PERMISSIONS.ADMIN_INVITES_MANAGE,
    )
    expect(r.ok).toBe(true)
  })

  it('allows self to use superuser', () => {
    const r = assertSelfAdminAccessMaintained('same', 'same', SUPERUSER_PERMISSION)
    expect(r.ok).toBe(true)
  })
})

describe('assertCannotDemoteOtherAdmin', () => {
  it('allows changing a non-admin user to anything', () => {
    const r = assertCannotDemoteOtherAdmin('u1', 'admin', '', PERMISSIONS.APP_LABS)
    expect(r.ok).toBe(true)
  })

  it('blocks demoting another admin to non-admin', () => {
    const r = assertCannotDemoteOtherAdmin(
      'other-admin',
      'caller',
      PERMISSIONS.ADMIN_INVITES_MANAGE,
      PERMISSIONS.APP_LABS,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('another administrator')
  })

  it('allows reconfiguring another admin while they stay admin', () => {
    const r = assertCannotDemoteOtherAdmin(
      'other-admin',
      'caller',
      PERMISSIONS.ADMIN_INVITES_MANAGE,
      PERMISSIONS.ADMIN_SYSTEM_CLEANUP,
    )
    expect(r.ok).toBe(true)
  })

  it('does not apply to self (handled separately)', () => {
    const r = assertCannotDemoteOtherAdmin('me', 'me', PERMISSIONS.ADMIN_INVITES_MANAGE, '')
    expect(r.ok).toBe(true)
  })
})

describe('isSuperuserPermissionsCsv', () => {
  it('is true for lone star', () => {
    expect(isSuperuserPermissionsCsv('*')).toBe(true)
    expect(isSuperuserPermissionsCsv(' * ')).toBe(true)
  })

  it('is false for comma lists or other tokens', () => {
    expect(isSuperuserPermissionsCsv('')).toBe(false)
    expect(isSuperuserPermissionsCsv(`${SUPERUSER_PERMISSION},${PERMISSIONS.APP_LABS}`)).toBe(false)
    expect(isSuperuserPermissionsCsv(PERMISSIONS.ADMIN_INVITES_MANAGE)).toBe(false)
  })
})
