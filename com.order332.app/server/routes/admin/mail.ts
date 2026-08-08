import "server-only"
import { Hono } from "hono"
import { z } from "zod"
import { db } from "@/server/db"
import { supabase } from "@/server/db/supabase/client"
import { requireAuth } from "@/server/middleware/auth"
import { requirePermission } from "@/server/middleware/rbac"
import { PERMISSIONS } from "@/lib/permissions"
import type { HonoEnv } from "@/server/lib/types"

export const adminMailRoutes = new Hono<HonoEnv>()
adminMailRoutes.use("*", requireAuth, requirePermission(PERMISSIONS.ADMIN_MAIL_MANAGE))

const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
})

adminMailRoutes.get("/users", async (c) => {
  const parsed = listUsersSchema.safeParse({
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
    search: c.req.query("search"),
  })
  if (!parsed.success) return c.json({ error: "Invalid query" }, 400)

  const { page, pageSize, search } = parsed.data
  const offset = (page - 1) * pageSize
  const { users, total } = await db.listUsersForAdmin({
    limit: pageSize,
    offset,
    search,
  })

  return c.json({
    users: users.map((u) => ({
      id: u.id,
      displayName: u.displayName ?? null,
      discordUsername: u.discordUsername ?? null,
      discordAvatar: u.discordAvatar ?? null,
      isActive: u.isActive,
      permissions: u.permissions,
      createdAt: u.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  })
})

adminMailRoutes.get("/setup/:userId", async (c) => {
  const userId = c.req.param("userId")
  const user = await db.getUserById(userId)
  if (!user) return c.json({ error: "User not found" }, 404)

  const { data: mailbox, error: mailboxErr } = await supabase
    .from("mailboxes")
    .select("id, owner_user_id, primary_email, display_name, is_active, created_at, updated_at")
    .eq("owner_user_id", userId)
    .maybeSingle()

  if (mailboxErr) return c.json({ error: "Failed to fetch mailbox" }, 500)

  if (!mailbox) {
    return c.json({ mailbox: null, aliases: [] })
  }

  const { data: aliases, error: aliasErr } = await supabase
    .from("mail_aliases")
    .select("id, alias_email, created_at")
    .eq("mailbox_id", mailbox.id)
    .order("alias_email", { ascending: true })

  if (aliasErr) return c.json({ error: "Failed to fetch aliases" }, 500)

  return c.json({
    mailbox: {
      id: mailbox.id,
      ownerUserId: mailbox.owner_user_id,
      primaryEmail: mailbox.primary_email,
      displayName: mailbox.display_name,
      isActive: mailbox.is_active,
      createdAt: mailbox.created_at,
      updatedAt: mailbox.updated_at,
    },
    aliases: (aliases ?? []).map((a) => ({
      id: a.id,
      aliasEmail: a.alias_email,
      createdAt: a.created_at,
    })),
  })
})

const updateSetupSchema = z.object({
  primaryEmail: z.email().max(320),
  displayName: z.string().max(120).nullable().optional(),
  isActive: z.boolean().default(true),
  aliases: z.array(z.email().max(320)).max(50).default([]),
})

adminMailRoutes.put("/setup/:userId", async (c) => {
  const userId = c.req.param("userId")
  const user = await db.getUserById(userId)
  if (!user) return c.json({ error: "User not found" }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = updateSetupSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid request" }, 400)

  const primaryEmail = parsed.data.primaryEmail.trim().toLowerCase()
  const displayName = parsed.data.displayName?.trim() || null
  const aliases = [...new Set(parsed.data.aliases.map((a) => a.trim().toLowerCase()))].filter(Boolean)

  const { data: existing, error: existingErr } = await supabase
    .from("mailboxes")
    .select("id")
    .eq("owner_user_id", userId)
    .maybeSingle()
  if (existingErr) return c.json({ error: "Failed to resolve mailbox" }, 500)

  const nowIso = new Date().toISOString()
  const mailboxId = existing?.id

  if (mailboxId) {
    const { error: updateErr } = await supabase
      .from("mailboxes")
      .update({
        primary_email: primaryEmail,
        display_name: displayName,
        is_active: parsed.data.isActive,
        updated_at: nowIso,
      })
      .eq("id", mailboxId)

    if (updateErr) {
      if (updateErr.code === "23505") return c.json({ error: "Primary email already exists" }, 409)
      return c.json({ error: "Failed to update mailbox" }, 500)
    }
  } else {
    const { data: created, error: createErr } = await supabase
      .from("mailboxes")
      .insert({
        owner_user_id: userId,
        primary_email: primaryEmail,
        display_name: displayName,
        is_active: parsed.data.isActive,
      })
      .select("id")
      .single()

    if (createErr || !created) {
      if (createErr?.code === "23505") return c.json({ error: "Primary email already exists" }, 409)
      return c.json({ error: "Failed to create mailbox" }, 500)
    }
  }

  const { data: refreshed, error: refreshErr } = await supabase
    .from("mailboxes")
    .select("id")
    .eq("owner_user_id", userId)
    .single()

  if (refreshErr || !refreshed) return c.json({ error: "Failed to load mailbox" }, 500)

  const finalMailboxId = refreshed.id as string

  const keepSet = new Set<string>(aliases)
  const { data: existingAliases, error: aliasReadErr } = await supabase
    .from("mail_aliases")
    .select("id, alias_email")
    .eq("mailbox_id", finalMailboxId)

  if (aliasReadErr) return c.json({ error: "Failed to load aliases" }, 500)

  const existingAliasRows = (existingAliases ?? []) as Array<{ id: string; alias_email: string }>
  const existingAliasSet = new Set(existingAliasRows.map((r) => r.alias_email.toLowerCase()))

  const toDelete = existingAliasRows.filter((row) => !keepSet.has(row.alias_email.toLowerCase()))
  if (toDelete.length > 0) {
    const { error: deleteErr } = await supabase
      .from("mail_aliases")
      .delete()
      .in("id", toDelete.map((row) => row.id))
    if (deleteErr) return c.json({ error: "Failed to remove old aliases" }, 500)
  }

  const toInsert = aliases.filter((alias) => !existingAliasSet.has(alias))
  if (toInsert.length > 0) {
    const { error: insertAliasErr } = await supabase
      .from("mail_aliases")
      .insert(
        toInsert.map((aliasEmail) => ({
          mailbox_id: finalMailboxId,
          owner_user_id: userId,
          alias_email: aliasEmail,
        }))
      )
    if (insertAliasErr) {
      if (insertAliasErr.code === "23505") return c.json({ error: "One or more aliases already exist" }, 409)
      return c.json({ error: "Failed to add aliases" }, 500)
    }
  }

  return c.json({ ok: true })
})
