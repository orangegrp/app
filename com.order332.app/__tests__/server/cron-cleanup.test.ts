import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockCleanupExpiredRecords = vi.fn()
const mockValidateAndMigrateSchema = vi.fn()

vi.mock("@/server/db", () => ({
  db: {
    validateAndMigrateSchema: (...args: unknown[]) =>
      mockValidateAndMigrateSchema(...args),
    cleanupExpiredRecords: (...args: unknown[]) =>
      mockCleanupExpiredRecords(...args),
  },
}))

describe("GET /api/cron/cleanup", () => {
  const cronSecret = "test-cron-secret-16chars-min"
  const env = process.env as Record<string, string | undefined>
  let prevNodeEnv: string | undefined
  let prevCronSecret: string | undefined

  beforeEach(() => {
    env.JWT_SECRET = "test-secret-that-is-long-enough-for-testing-purposes"
    env.JWT_REFRESH_SECRET = "test-refresh-secret-that-is-long-enough-testing"
    env.DISCORD_LINK_SECRET =
      "test-discord-link-secret-long-enough-for-testing-ok"
    env.SUPABASE_URL = "https://test-project.supabase.co"
    env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-for-vitest-only"
    env.CRON_SECRET = cronSecret
    env.NODE_ENV = "test"
    mockCleanupExpiredRecords.mockReset().mockResolvedValue(undefined)
    mockValidateAndMigrateSchema.mockReset().mockResolvedValue(undefined)
    vi.resetModules()
  })

  afterEach(() => {
    if (prevNodeEnv !== undefined) env.NODE_ENV = prevNodeEnv
    else delete env.NODE_ENV
    if (prevCronSecret !== undefined) env.CRON_SECRET = prevCronSecret
    else delete env.CRON_SECRET
    prevNodeEnv = undefined
    prevCronSecret = undefined
  })

  async function loadApp() {
    const { app } = await import("../../server/index")
    return app
  }

  it("returns 200 and runs cleanup when Authorization bearer matches CRON_SECRET", async () => {
    const app = await loadApp()
    const res = await app.request("http://test.local/api/cron/cleanup", {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok?: boolean }
    expect(body.ok).toBe(true)
    expect(mockCleanupExpiredRecords).toHaveBeenCalledTimes(1)
  })

  it("returns 401 when Authorization is missing", async () => {
    const app = await loadApp()
    const res = await app.request("http://test.local/api/cron/cleanup", {
      method: "GET",
    })
    expect(res.status).toBe(401)
    expect(mockCleanupExpiredRecords).not.toHaveBeenCalled()
  })

  it("returns 401 when bearer does not match CRON_SECRET", async () => {
    const app = await loadApp()
    const res = await app.request("http://test.local/api/cron/cleanup", {
      method: "GET",
      headers: { Authorization: "Bearer wrong-secret-that-does-not-match-ok" },
    })
    expect(res.status).toBe(401)
    expect(mockCleanupExpiredRecords).not.toHaveBeenCalled()
  })

  it("returns 500 in production when CRON_SECRET is not set", async () => {
    prevNodeEnv = env.NODE_ENV
    prevCronSecret = env.CRON_SECRET
    env.NODE_ENV = "production"
    delete env.CRON_SECRET
    vi.resetModules()
    const { app } = await import("../../server/index")
    const res = await app.request("http://test.local/api/cron/cleanup", {
      method: "GET",
      headers: { Authorization: "Bearer ignored" },
    })
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe("misconfigured")
    expect(mockCleanupExpiredRecords).not.toHaveBeenCalled()
  })
})
