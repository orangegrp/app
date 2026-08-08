"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Mail, Send, PencilLine } from "lucide-react"
import { listMailMessages, type MailFolder, type MailMessageSummary } from "@/lib/mail-api"
import { evictStaleMailCache, getCachedMailList, setCachedMailList } from "@/lib/mail-cache"
import { openMailComposer } from "@/lib/mail-composer-store"
import { useAuthStore } from "@/lib/auth-store"
import { getSupabaseClient } from "@/lib/supabase-client"
import { Spinner } from "@/components/ui/spinner"

export function MailboxPage({ folder }: { folder: MailFolder }) {
  const user = useAuthStore((s) => s.user)
  const [messages, setMessages] = useState<MailMessageSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    evictStaleMailCache()
    const cached = getCachedMailList(folder)
    if (cached) {
      setMessages(cached)
      setLoading(false)
    }

    void listMailMessages(folder)
      .then((serverMessages) => {
        setMessages(serverMessages)
        setCachedMailList(folder, serverMessages)
        setError(null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to fetch messages")
      })
      .finally(() => setLoading(false))
  }, [folder])

  useEffect(() => {
    if (!user?.id) return

    try {
      const client = getSupabaseClient()
      const channel = client
        .channel(`mail-${folder}-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "mail_messages",
            filter: `owner_user_id=eq.${user.id}`,
          },
          () => {
            void listMailMessages(folder)
              .then((serverMessages) => {
                setMessages(serverMessages)
                setCachedMailList(folder, serverMessages)
              })
              .catch(() => {
                // Background refresh failures should not break UI.
              })
          }
        )
        .subscribe()

      return () => {
        void client.removeChannel(channel)
      }
    } catch {
      // Some environments block websocket creation (SecurityError).
      // Keep mailbox usable without realtime updates.
      return
    }
  }, [folder, user?.id])

  const title = folder === "inbox" ? "Inbox" : "Sent"
  const icon = folder === "inbox" ? <Mail size={16} /> : <Send size={16} />

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [messages]
  )

  const filteredMessages = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sortedMessages
    return sortedMessages.filter((message) => {
      const haystack = [
        message.subject,
        message.fromAddress,
        message.toAddresses.join(" "),
        message.snippet,
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [query, sortedMessages])

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
        <div className="flex items-center gap-2 text-base font-medium tracking-wide text-foreground">
          {icon}
          <span>{title}</span>
        </div>
        <button
          type="button"
          onClick={() => openMailComposer()}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm tracking-wide text-foreground hover:bg-white/10"
        >
          <PencilLine size={15} />
          Compose
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 md:hidden">
        <Link
          href="/mail"
          className={[
            "rounded-xl border px-3 py-2 text-center text-sm",
            folder === "inbox" ? "border-sky-500/40 bg-sky-500/15 text-foreground" : "border-white/10 bg-white/5 text-muted-foreground",
          ].join(" ")}
        >
          Inbox
        </Link>
        <Link
          href="/mail/sent"
          className={[
            "rounded-xl border px-3 py-2 text-center text-sm",
            folder === "sent" ? "border-sky-500/40 bg-sky-500/15 text-foreground" : "border-white/10 bg-white/5 text-muted-foreground",
          ].join(" ")}
        >
          Sent
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden md:block">
          <div className="glass-card rounded-2xl border border-white/10 p-3">
            <button
              type="button"
              onClick={() => openMailComposer()}
              className="mb-4 inline-flex w-full min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm tracking-wide text-foreground hover:bg-white/15"
            >
              <PencilLine size={15} />
              Compose
            </button>

            <nav className="space-y-1 text-sm">
              <Link
                href="/mail"
                className={[
                  "flex items-center justify-between rounded-lg px-2.5 py-2",
                  folder === "inbox" ? "bg-sky-500/15 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                ].join(" ")}
              >
                <span className="inline-flex items-center gap-2"><Mail size={14} /> Inbox</span>
              </Link>
              <Link
                href="/mail/sent"
                className={[
                  "flex items-center justify-between rounded-lg px-2.5 py-2",
                  folder === "sent" ? "bg-sky-500/15 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                ].join(" ")}
              >
                <span className="inline-flex items-center gap-2"><Send size={14} /> Sent</span>
              </Link>
            </nav>
          </div>
        </aside>

        <section className="glass-card rounded-2xl border border-white/10">
          <div className="border-b border-white/10 p-3 sm:p-4">
            <div className="flex items-center gap-2 text-base font-medium tracking-wide text-foreground">
              {icon}
              <span>{title}</span>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages"
              className="mt-3 w-full min-h-10 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-sky-500/70"
            />
          </div>

          {loading ? (
            <div className="flex min-h-[40vh] items-center justify-center p-4">
              <Spinner size="md" clockwise />
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="p-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-muted-foreground">
                No messages in {title.toLowerCase()}.
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-white/10">
              {filteredMessages.map((message) => (
                <li key={message.id}>
                  <Link
                    href={`/mail/${message.id}`}
                    className={[
                      "block px-3 py-3 transition-colors sm:px-4",
                      message.isRead
                        ? "bg-transparent hover:bg-white/5"
                        : "bg-sky-500/10 hover:bg-sky-500/15",
                    ].join(" ")}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-foreground">
                        {message.subject || "(No subject)"}
                      </p>
                      <time className="shrink-0 text-[11px] text-muted-foreground">
                        {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {folder === "inbox" ? `From: ${message.fromAddress}` : `To: ${message.toAddresses.join(", ")}`}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{message.snippet}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
