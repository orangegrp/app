import "server-only"
import { Hono } from "hono"
import { z } from "zod"
import { db } from "@/server/db"
import { supabase } from "@/server/db/supabase/client"
import { requireAuth } from "@/server/middleware/auth"
import { requirePermission } from "@/server/middleware/rbac"
import { PERMISSIONS } from "@/lib/permissions"
import { isMailSetupCompletedForUser } from "@/lib/mail-setup"
import { derivePrimaryEmail, deriveDefaultAlias, normalizeToLocalPart } from "@/lib/mail-address"
import type { HonoEnv } from "@/server/lib/types"

/** Maximum aliases allowed for a user-facing mailbox. */
const USER_ALIAS_MAX = 2

/** Domain must be configured via env or setup is blocked. */
function getMailDomain(): string | null {
  return process.env.NEXT_PUBLIC_MAIL_DEFAULT_DOMAIN?.trim() || null
}

export const mailSetupRoutes = new Hono<HonoEnv>()
mailSetupRoutes.use("*", requireAuth, requirePermission(PERMISSIONS.APP_MAIL))

// ── GET /mail/setup ──────────────────────────────────────────────────────────
// Returns current mailbox + alias state and setup metadata.
mailSetupRoutes.get("/", async (c) => {
  const authUser = c.get("user")
  const user = await db.getUserById(authUser.id)
  if (!user) return c.json({ error: "Not found" }, 404)

  const domain = getMailDomain()
  const primaryEmail = domain ? derivePrimaryEmail(user.id, domain) : null
  const defaultAlias = domain
    ? deriveDefaultAlias(user.displayName, user.id, domain)
    : null

  const { data: mailbox, error: mailboxErr } = await supabase
    .from("mailboxes")
    .select("id, primary_email, display_name, is_active, created_at")
    .eq("owner_user_id", user.id)
    .maybeSingle()

  if (mailboxErr) return c.json({ error: "Failed to fetch mailbox" }, 500)

  let aliases: { id: string; aliasEmail: string; createdAt: string }[] = []
  if (mailbox) {
    const { data: aliasRows, error: aliasErr } = await supabase
      .from("mail_aliases")
      .select("id, alias_email, created_at")
      .eq("mailbox_id", mailbox.id)
      .order("alias_email", { ascending: true })

    if (aliasErr) return c.json({ error: "Failed to fetch aliases" }, 500)
    aliases = (aliasRows ?? []).map((a: { id: string; alias_email: string; created_at: string }) => ({
      id: a.id,
      aliasEmail: a.alias_email,
      createdAt: a.created_at,
    }))
  }

  return c.json({
    setupCompleted: isMailSetupCompletedForUser(user),
    primaryEmail,
    defaultAlias,
    domainConfigured: Boolean(domain),
    demoMode: process.env.MAIL_DEMO_MODE === "true",
    aliasMax: USER_ALIAS_MAX,
    aliasCount: aliases.length,
    aliases,
    mailbox: mailbox
      ? {
          id: mailbox.id,
          primaryEmail: mailbox.primary_email,
          displayName: mailbox.display_name,
          isActive: mailbox.is_active,
          createdAt: mailbox.created_at,
        }
      : null,
  })
})

// ── POST /mail/setup/complete ────────────────────────────────────────────────
// Creates/updates mailbox with forced primary-from-userid + optional one alias.
// Marks mail_setup_completed_at on the user record.
const completeSetupSchema = z.object({
  alias: z.string().email().max(320).optional().nullable(),
})

mailSetupRoutes.post("/complete", async (c) => {
  const authUser = c.get("user")
  const user = await db.getUserById(authUser.id)
  if (!user) return c.json({ error: "Not found" }, 404)
  if (!user.isActive) return c.json({ error: "Forbidden" }, 403)

  const domain = getMailDomain()
  if (!domain) {
    return c.json(
      {
        error:
          "Mail domain is not configured. Set NEXT_PUBLIC_MAIL_DEFAULT_DOMAIN and redeploy.",
      },
      503
    )
  }

  const body = await c.req.json().catch(() => null)
  const parsed = completeSetupSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid request" }, 400)

  const primaryEmail = derivePrimaryEmail(user.id, domain)
  const aliasTrimmed = parsed.data.alias?.trim().toLowerCase() ?? null

  if (aliasTrimmed && aliasTrimmed === primaryEmail) {
    return c.json({ error: "Alias cannot match primary address" }, 409)
  }

  const nowIso = new Date().toISOString()

  // Upsert mailbox
  const { data: existing, error: fetchErr } = await supabase
    .from("mailboxes")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle()
  if (fetchErr) return c.json({ error: "Failed to resolve mailbox" }, 500)

  let mailboxId: string
  if (existing?.id) {
    mailboxId = existing.id
    // Primary email is always set to the derived formula on completion.
    const { error: updateErr } = await supabase
      .from("mailboxes")
      .update({ primary_email: primaryEmail, is_active: true, updated_at: nowIso })
      .eq("id", mailboxId)
    if (updateErr) return c.json({ error: "Failed to update mailbox" }, 500)
  } else {
    const { data: created, error: createErr } = await supabase
      .from("mailboxes")
      .insert({
        owner_user_id: user.id,
        primary_email: primaryEmail,
        display_name: user.displayName ?? null,
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id")
      .single()
    if (createErr || !created) {
      if (createErr?.code === "23505")
        return c.json({ error: "Primary email already in use" }, 409)
      return c.json({ error: "Failed to create mailbox" }, 500)
    }
    mailboxId = (created as { id: string }).id
  }

  // Optionally add one alias (onboarding allows max 1)
  if (aliasTrimmed) {
    const { data: existingAliases } = await supabase
      .from("mail_aliases")
      .select("id, alias_email")
      .eq("mailbox_id", mailboxId)

    const currentCount = (existingAliases ?? []).length
    const alreadyHas = (existingAliases ?? []).some(
      (r: { alias_email: string }) => r.alias_email.toLowerCase() === aliasTrimmed
    )

    if (!alreadyHas && currentCount < USER_ALIAS_MAX) {
      const { error: aliasErr } = await supabase.from("mail_aliases").insert({
        mailbox_id: mailboxId,
        owner_user_id: user.id,
        alias_email: aliasTrimmed,
        created_at: nowIso,
      })
      if (aliasErr) {
        if (aliasErr.code === "23505")
          return c.json({ error: "Alias is already in use" }, 409)
        return c.json({ error: "Failed to add alias" }, 500)
      }
    }
  }

  // Mark setup complete
  await db.updateUser(user.id, { mailSetupCompletedAt: new Date() })

  return c.json({
    ok: true,
    mailSetupCompleted: true,
    primaryEmail,
  })
})

// ── PUT /mail/setup/aliases ──────────────────────────────────────────────────
// Replaces alias set for the authenticated user. Max 2 total.
const updateAliasesSchema = z.object({
  aliases: z.array(z.string().email().max(320)).max(USER_ALIAS_MAX),
})

mailSetupRoutes.put("/aliases", async (c) => {
  const authUser = c.get("user")
  const user = await db.getUserById(authUser.id)
  if (!user) return c.json({ error: "Not found" }, 404)
  if (!user.isActive) return c.json({ error: "Forbidden" }, 403)

  const { data: mailbox, error: mailboxErr } = await supabase
    .from("mailboxes")
    .select("id, primary_email")
    .eq("owner_user_id", user.id)
    .maybeSingle()
  if (mailboxErr) return c.json({ error: "Failed to resolve mailbox" }, 500)
  if (!mailbox) return c.json({ error: "No mailbox configured. Complete setup first." }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = updateAliasesSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid request — max 2 aliases allowed" }, 400)

  const desiredAliases = [
    ...new Set(parsed.data.aliases.map((a) => a.trim().toLowerCase())),
  ].filter(Boolean)

  // Must not overlap with primary
  if (desiredAliases.includes(mailbox.primary_email.toLowerCase())) {
    return c.json({ error: "Alias cannot match primary address" }, 409)
  }

  const { data: existing, error: existingErr } = await supabase
    .from("mail_aliases")
    .select("id, alias_email")
    .eq("mailbox_id", mailbox.id)
  if (existingErr) return c.json({ error: "Failed to load aliases" }, 500)

  const existingRows = (existing ?? []) as { id: string; alias_email: string }[]
  const existingSet = new Set(existingRows.map((r) => r.alias_email.toLowerCase()))
  const desiredSet = new Set(desiredAliases)

  // Delete removed aliases
  const toDelete = existingRows.filter((r) => !desiredSet.has(r.alias_email.toLowerCase()))
  if (toDelete.length > 0) {
    const { error: deleteErr } = await supabase
      .from("mail_aliases")
      .delete()
      .in("id", toDelete.map((r) => r.id))
    if (deleteErr) return c.json({ error: "Failed to remove aliases" }, 500)
  }

  // Insert new aliases
  const toInsert = desiredAliases.filter((a) => !existingSet.has(a))
  if (toInsert.length > 0) {
    const nowIso = new Date().toISOString()
    const { error: insertErr } = await supabase.from("mail_aliases").insert(
      toInsert.map((aliasEmail) => ({
        mailbox_id: mailbox.id,
        owner_user_id: user.id,
        alias_email: aliasEmail,
        created_at: nowIso,
      }))
    )
    if (insertErr) {
      if (insertErr.code === "23505")
        return c.json({ error: "One or more aliases are already in use" }, 409)
      return c.json({ error: "Failed to add aliases" }, 500)
    }
  }

  // Return updated state
  const { data: updated } = await supabase
    .from("mail_aliases")
    .select("id, alias_email, created_at")
    .eq("mailbox_id", mailbox.id)
    .order("alias_email", { ascending: true })

  return c.json({
    ok: true,
    aliases: (updated ?? []).map((a: { id: string; alias_email: string; created_at: string }) => ({
      id: a.id,
      aliasEmail: a.alias_email,
      createdAt: a.created_at,
    })),
  })
})
