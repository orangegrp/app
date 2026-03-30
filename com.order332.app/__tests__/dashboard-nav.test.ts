import { describe, it, expect } from 'vitest'
import {
  DASHBOARD_NAV_ITEMS,
  filterNavItemsForUser,
  HOME_APP_ITEMS,
} from '../lib/dashboard-nav'
import { PERMISSIONS } from '../lib/permissions'

describe('filterNavItemsForUser (deny-by-default)', () => {
  it('shows only shell /home when permissions are empty', () => {
    const nav = filterNavItemsForUser('', DASHBOARD_NAV_ITEMS)
    expect(nav.map((i) => i.href)).toEqual(['/home'])
  })

  it('shows a mini-app only when that permission is granted', () => {
    const nav = filterNavItemsForUser(PERMISSIONS.APP_WEBPC, DASHBOARD_NAV_ITEMS)
    expect(nav.map((i) => i.href)).toEqual(['/home', '/webpc'])
  })

  it('wildcard grants all nav entries', () => {
    const nav = filterNavItemsForUser('*', DASHBOARD_NAV_ITEMS)
    expect(nav.length).toBe(DASHBOARD_NAV_ITEMS.length)
  })

  it('HOME_APP_ITEMS filtered to empty for no permissions', () => {
    const apps = filterNavItemsForUser('', HOME_APP_ITEMS)
    expect(apps).toHaveLength(0)
  })
})
