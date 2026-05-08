import "server-only"
import { Hono } from "hono"
import { UAParser } from "ua-parser-js"
import { db } from "@/server/db"
import { requireAuth } from "@/server/middleware/auth"
import { rateLimit } from "@/server/middleware/rate-limit"
import type { HonoEnv } from "@/server/lib/types"

export const sessionRoutes = new Hono<HonoEnv>()

function parseUserAgent(ua: string | undefined): {
  device: "desktop" | "mobile" | "tablet"
  browser: string
  os: string
} {
  if (!ua) return { device: "desktop", browser: "Unknown browser", os: "Unknown OS" }

  const parser = new UAParser(ua)
  const result = parser.getResult()

  const deviceType = result.device.type
  let device: "desktop" | "mobile" | "tablet" = "desktop"
  if (deviceType === "mobile") device = "mobile"
  else if (deviceType === "tablet") device = "tablet"

  const browserName = result.browser.name ?? "Unknown browser"
  const browserMajor = result.browser.major
  const browser = browserMajor ? `${browserName} ${browserMajor}` : browserName

  const osName = result.os.name ?? "Unknown OS"
  const osVersion = result.os.version
  const os = osVersion ? `${osName} ${osVersion}` : osName

  return { device, browser, os }
}

sessionRoutes.get(
  "/sessions",
  rateLimit(30, 60_000),
  requireAuth,
  async (c) => {
    const user = c.var.user
    const sessions = await db.getUserSessions(user.id)

    const result = sessions.map((s) => {
      const { device, browser, os } = parseUserAgent(s.userAgent)
      return {
        id: s.id,
        device,
        browser,
        os,
        location: s.location ?? null,
        isPwa: s.isPwa,
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
      }
    })

    return c.json({ sessions: result, currentSessionId: user.sessionId })
  }
)

sessionRoutes.delete(
  "/sessions/others",
  rateLimit(10, 60_000),
  requireAuth,
  async (c) => {
    const user = c.var.user
    await db.deleteOtherUserSessions(user.id, user.sessionId)
    return c.json({ ok: true })
  }
)

sessionRoutes.delete(
  "/sessions/:id",
  rateLimit(20, 60_000),
  requireAuth,
  async (c) => {
    const user = c.var.user
    const id = c.req.param("id")

    if (id === user.sessionId) {
      return c.json({ error: "Cannot revoke current session — use sign out instead" }, 400)
    }

    const session = await db.getSessionById(id)
    if (!session || session.userId !== user.id) {
      return c.json({ error: "Not found" }, 404)
    }

    await db.deleteSession(id)
    return c.json({ ok: true })
  }
)
