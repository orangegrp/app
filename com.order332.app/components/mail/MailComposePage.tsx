"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { sendMail } from "@/lib/mail-api"

export function MailComposePage() {
  const router = useRouter()
  const [to, setTo] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSending(true)
    setError(null)

    const recipients = to
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)

    try {
      await sendMail({
        to: recipients,
        subject,
        text: body,
        html: null,
      })
      router.replace("/mail/sent")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email")
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-wide text-foreground">Compose</h1>
        <Link href="/mail" className="text-sm text-muted-foreground hover:text-foreground">
          Back to Inbox
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <label className="block text-sm text-muted-foreground">
          To (comma-separated)
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground outline-none focus:border-sky-500/70"
            required
          />
        </label>

        <label className="block text-sm text-muted-foreground">
          Subject
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground outline-none focus:border-sky-500/70"
            required
          />
        </label>

        <label className="block text-sm text-muted-foreground">
          Message
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground outline-none focus:border-sky-500/70"
            required
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={sending}
          className="rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm text-foreground disabled:opacity-60"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  )
}
