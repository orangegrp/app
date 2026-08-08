"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  PenSquare,
  Search,
  Trash2,
  MailOpen,
  MailCheck,
  X,
} from "lucide-react"
import {
  listMailMessages,
  setMailReadState,
  bulkMailAction,
  type MailFolder,
  type MailMessageSummary,
} from "@/lib/mail-api"
import { evictStaleMailCache, getCachedMailList, setCachedMailList } from "@/lib/mail-cache"
import { openMailComposer } from "@/lib/mail-composer-store"
import { useAuthStore } from "@/lib/auth-store"
import { getSupabaseClient } from "@/lib/supabase-client"
import { Spinner } from "@/components/ui/spinner"

const PAGE_SIZE = 50
const FILTER_STORAGE_KEY = "mail:list-filter"

type FilterType = "all" | "read" | "unread" | "attachments"

// ── helpers ───────────────────────────────────────────────────────────────────

function avatarColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0
  return `hsl(${Math.abs(hash) % 360}, 40%, 38%)`
}

function senderInitial(address: string): string {
  return ((address.split("@")[0] ?? address)[0] ?? "?").toUpperCase()
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  return isToday
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" })
}

function readStoredFilter(): FilterType {
  try {
    const v = localStorage.getItem(FILTER_STORAGE_KEY)
    if (v === "all" || v === "read" || v === "unread" || v === "attachments") return v
  } catch {}
  return "all"
}

// ── context menu ──────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number
  y: number
  messageId: string
  isRead: boolean
}

interface ContextMenuProps {
  state: ContextMenuState
  onClose: () => void
  onToggleRead: (id: string, isRead: boolean) => void
  onDelete: (id: string) => void
}

function ContextMenu({ state, onClose, onToggleRead, onDelete }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [onClose])

  const itemCls = "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground/90 hover:bg-white/8 transition-colors"

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] rounded-xl border border-white/12 bg-[oklch(0.10_0_0_/_95%)] py-1 shadow-2xl backdrop-blur-xl"
      style={{ top: state.y, left: state.x }}
    >
      <button
        type="button"
        className={itemCls}
        onClick={() => { onToggleRead(state.messageId, state.isRead); onClose() }}
      >
        {state.isRead ? <MailCheck size={14} className="text-muted-foreground" /> : <MailOpen size={14} className="text-muted-foreground" />}
        Mark as {state.isRead ? "unread" : "read"}
      </button>
      <div className="mx-3 my-1 border-t border-white/8" />
      <button
        type="button"
        className={`${itemCls} text-destructive hover:bg-destructive/10`}
        onClick={() => { onDelete(state.messageId); onClose() }}
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export function MailListPanel() {
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  const folder: MailFolder = pathname.startsWith("/mail/sent") ? "sent" : "inbox"

  const [messages, setMessages] = useState<MailMessageSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>("all")
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [actionPending, setActionPending] = useState(false)

  useEffect(() => { setFilter(readStoredFilter()) }, [])
  useEffect(() => { setSelected(new Set()) }, [folder])

  const selectedId = useMemo(() => {
    const sentMatch = pathname.match(/^\/mail\/sent\/([^/]+)$/)
    if (sentMatch) return sentMatch[1]
    const inboxMatch = pathname.match(/^\/mail\/([^/]+)$/)
    if (inboxMatch && inboxMatch[1] !== "sent" && inboxMatch[1] !== "compose") return inboxMatch[1]
    return null
  }, [pathname])

  useEffect(() => { setPage(1) }, [folder, filter, searchQuery])

  // ── data fetching ────────────────────────────────────────────────────────────

  function applyMessages(msgs: MailMessageSummary[]) {
    setMessages(msgs)
    setCachedMailList(folder, msgs)
  }

  useEffect(() => {
    evictStaleMailCache()
    const cached = getCachedMailList(folder)
    if (cached) { setMessages(cached); setLoading(false) }
    void listMailMessages(folder).then(applyMessages).catch(() => {}).finally(() => setLoading(false))
  }, [folder]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user?.id) return
    try {
      const client = getSupabaseClient()
      const channel = client
        .channel(`mail-list-${folder}-${user.id}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "mail_messages", filter: `owner_user_id=eq.${user.id}` },
          () => { void listMailMessages(folder).then(applyMessages).catch(() => {}) })
        .subscribe()
      return () => { void client.removeChannel(channel) }
    } catch { return }
  }, [folder, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── derived lists ────────────────────────────────────────────────────────────

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [messages]
  )

  const filteredMessages = useMemo(() => {
    let result = sortedMessages
    if (filter === "read") result = result.filter((m) => m.isRead)
    else if (filter === "unread") result = result.filter((m) => !m.isRead)
    else if (filter === "attachments") result = result.filter((m) => m.hasAttachments)
    const q = searchQuery.trim().toLowerCase()
    if (q) result = result.filter((m) =>
      [m.subject, m.fromAddress, m.toAddresses.join(" "), m.snippet ?? ""].join(" ").toLowerCase().includes(q)
    )
    return result
  }, [filter, sortedMessages, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / PAGE_SIZE))
  const pageMessages = filteredMessages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const folderLabel = folder === "inbox" ? "Inbox" : "Sent"

  // ── selection ────────────────────────────────────────────────────────────────

  const allPageSelected = pageMessages.length > 0 && pageMessages.every((m) => selected.has(m.id))
  const somePageSelected = pageMessages.some((m) => selected.has(m.id))

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        pageMessages.forEach((m) => next.delete(m.id))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        pageMessages.forEach((m) => next.add(m.id))
        return next
      })
    }
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── actions ──────────────────────────────────────────────────────────────────

  function optimisticUpdate(ids: string[], patch: Partial<MailMessageSummary>) {
    setMessages((prev) => prev.map((m) => ids.includes(m.id) ? { ...m, ...patch } : m))
  }

  async function handleToggleRead(id: string, currentlyRead: boolean) {
    const newIsRead = !currentlyRead
    optimisticUpdate([id], { isRead: newIsRead })
    await setMailReadState(id, newIsRead).catch(() => {
      optimisticUpdate([id], { isRead: currentlyRead })
    })
  }

  async function handleBulkAction(action: "delete" | "mark_read" | "mark_unread") {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setActionPending(true)

    if (action === "delete") {
      optimisticUpdate(ids, {})
      setMessages((prev) => prev.filter((m) => !ids.includes(m.id)))
      setSelected(new Set())
      if (selectedId && ids.includes(selectedId)) {
        router.push(folder === "sent" ? "/mail/sent" : "/mail")
      }
    } else {
      const isRead = action === "mark_read"
      optimisticUpdate(ids, { isRead })
    }

    await bulkMailAction(ids, action).catch(() => {
      void listMailMessages(folder).then(applyMessages)
    })
    setActionPending(false)
  }

  async function handleDeleteOne(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id))
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next })
    if (selectedId === id) router.push(folder === "sent" ? "/mail/sent" : "/mail")
    await bulkMailAction([id], "delete").catch(() => {
      void listMailMessages(folder).then(applyMessages)
    })
  }

  function handleFilterChange(next: FilterType) {
    setFilter(next)
    try { localStorage.setItem(FILTER_STORAGE_KEY, next) } catch {}
  }

  function handleRowClick(msg: MailMessageSummary) {
    router.push(folder === "sent" ? `/mail/sent/${msg.id}` : `/mail/${msg.id}`)
  }

  function handleContextMenu(e: React.MouseEvent, msg: MailMessageSummary) {
    e.preventDefault()
    const vw = window.innerWidth
    const x = Math.min(e.clientX, vw - 200)
    setContextMenu({ x, y: e.clientY, messageId: msg.id, isRead: msg.isRead })
  }

  const pills: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "read", label: "Read" },
    { key: "unread", label: "Unread" },
    { key: "attachments", label: "Has attachments" },
  ]

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex h-full w-full flex-col overflow-hidden">

        {/* Mobile folder switcher */}
        <div className="flex shrink-0 border-b border-white/8 md:hidden">
          <Link href="/mail" className={["flex flex-1 items-center justify-center py-3 text-sm font-medium transition-colors", folder === "inbox" ? "text-foreground border-b-2 border-white/40" : "text-muted-foreground"].join(" ")}>
            Inbox
          </Link>
          <Link href="/mail/sent" className={["flex flex-1 items-center justify-center py-3 text-sm font-medium transition-colors", folder === "sent" ? "text-foreground border-b-2 border-white/40" : "text-muted-foreground"].join(" ")}>
            Sent
          </Link>
          <button type="button" onClick={() => openMailComposer()} className="flex items-center border-l border-white/8 px-4 text-muted-foreground hover:text-foreground">
            <PenSquare size={15} />
          </button>
        </div>

        {/* Header — h-[46px] matches detail panel top bar for border alignment */}
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-white/8 px-3">
          {/* Select-all checkbox */}
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-white/20 bg-white/5 transition-colors hover:border-white/40"
            title={allPageSelected ? "Deselect all" : "Select all"}
          >
            {allPageSelected ? (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="text-foreground">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : somePageSelected ? (
              <span className="block h-px w-2.5 bg-foreground/60" />
            ) : null}
          </button>

          <span className="flex-1 text-sm font-semibold text-foreground">{folderLabel}</span>

          <button
            type="button"
            onClick={() => { setSearchOpen((v) => !v); setSearchQuery("") }}
            className={["rounded p-1 transition-colors", searchOpen ? "text-foreground" : "text-muted-foreground/60 hover:text-foreground"].join(" ")}
          >
            <Search size={14} />
          </button>
          <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded p-0.5 hover:text-foreground disabled:opacity-30">
              <ChevronLeft size={14} />
            </button>
            <span>{page}/{totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded p-0.5 hover:text-foreground disabled:opacity-30">
              <ChevronRight size={14} />
            </button>
          </div>
          <ArrowUpDown size={14} className="text-muted-foreground/50" />
        </div>

        {/* Bulk action bar — shown when items selected */}
        {selected.size > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 border-b border-white/8 bg-white/4 px-3 py-2">
            <span className="mr-0.5 shrink-0 text-xs text-muted-foreground">{selected.size} selected</span>
            <button
              type="button"
              disabled={actionPending}
              onClick={() => void handleBulkAction("mark_read")}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              <MailCheck size={12} />
              Mark read
            </button>
            <button
              type="button"
              disabled={actionPending}
              onClick={() => void handleBulkAction("mark_unread")}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              <MailOpen size={12} />
              Mark unread
            </button>
            <button
              type="button"
              disabled={actionPending}
              onClick={() => void handleBulkAction("delete")}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
            >
              <Trash2 size={12} />
              Delete
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-auto shrink-0 rounded p-1 text-muted-foreground/60 hover:text-foreground"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Search bar */}
        {searchOpen && (
          <div className="flex shrink-0 items-center gap-2 border-b border-white/8 px-4 py-2">
            <Search size={13} className="shrink-0 text-muted-foreground/50" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages…"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} className="shrink-0 text-muted-foreground/50 hover:text-foreground">
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {/* Filter pills */}
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/8 px-4 py-2 scrollbar-none">
          {pills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => handleFilterChange(pill.key)}
              className={["shrink-0 rounded-full px-3 py-1 text-xs transition-colors", filter === pill.key ? "bg-white/12 text-foreground" : "bg-white/5 text-muted-foreground hover:bg-white/8 hover:text-foreground"].join(" ")}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <Spinner size="sm" clockwise />
            </div>
          ) : pageMessages.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {searchQuery ? "No results" : "No messages"}
            </div>
          ) : (
            <ul>
              {pageMessages.map((msg) => {
                const isSelected = selected.has(msg.id)
                const isActive = selectedId === msg.id
                const sender = folder === "inbox" ? msg.fromAddress : (msg.toAddresses[0] ?? msg.fromAddress)
                const senderDisplay = folder === "inbox"
                  ? (msg.fromAddress.split("@")[0] ?? msg.fromAddress)
                  : (msg.toAddresses[0]?.split("@")[0] ?? "Unknown")

                return (
                  <li
                    key={msg.id}
                    className={["group relative", isActive ? "bg-white/10" : isSelected ? "bg-white/6" : ""].join(" ")}
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                  >
                    <div className="flex items-start gap-3 px-3 py-3">
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={(e) => toggleSelect(msg.id, e)}
                        className={[
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all",
                          isSelected
                            ? "bg-white/15 ring-1 ring-white/30"
                            : "group-hover:bg-white/8",
                        ].join(" ")}
                        aria-label={isSelected ? "Deselect" : "Select"}
                      >
                        {isSelected ? (
                          /* Checkmark */
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-foreground">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          /* Avatar — visible at rest, hidden on hover in favour of checkbox affordance */
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white/80 transition-opacity group-hover:opacity-60"
                            style={{ background: avatarColor(sender) }}
                          >
                            {senderInitial(sender)}
                          </div>
                        )}
                      </button>

                      {/* Row content — clickable to open */}
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => handleRowClick(msg)}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={["truncate text-sm", msg.isRead ? "font-normal text-muted-foreground" : "font-semibold text-foreground"].join(" ")}>
                            {senderDisplay}
                          </span>
                          <time className="shrink-0 text-[11px] text-muted-foreground/60">
                            {formatTimestamp(msg.createdAt)}
                          </time>
                        </div>
                        <p className={["truncate text-xs", msg.isRead ? "text-muted-foreground/70" : "text-foreground/80"].join(" ")}>
                          {msg.subject || "(No subject)"}
                        </p>
                        {msg.snippet && (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/50">
                            {msg.snippet}
                          </p>
                        )}
                      </button>

                      {/* Hover action buttons */}
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          title={msg.isRead ? "Mark unread" : "Mark read"}
                          onClick={(e) => { e.stopPropagation(); void handleToggleRead(msg.id, msg.isRead) }}
                          className="rounded p-1 text-muted-foreground/60 hover:bg-white/8 hover:text-foreground"
                        >
                          {msg.isRead ? <MailOpen size={13} /> : <MailCheck size={13} />}
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={(e) => { e.stopPropagation(); void handleDeleteOne(msg.id) }}
                          className="rounded p-1 text-muted-foreground/60 hover:bg-destructive/15 hover:text-destructive"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onToggleRead={(id, isRead) => void handleToggleRead(id, isRead)}
          onDelete={(id) => void handleDeleteOne(id)}
        />
      )}
    </>
  )
}
