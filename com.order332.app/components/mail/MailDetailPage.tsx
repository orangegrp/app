"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { Download, Reply } from "lucide-react"
import { cacheSmallAttachment, getCachedMailDetail, setCachedMailDetail } from "@/lib/mail-cache"
import { getMailMessage, setMailReadState, type MailMessageDetail } from "@/lib/mail-api"
import { openMailComposer } from "@/lib/mail-composer-store"
import { Spinner } from "@/components/ui/spinner"

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function MailDetailPage({ messageId }: { messageId: string }) {
  const [message, setMessage] = useState<MailMessageDetail | null>(
    () => getCachedMailDetail(messageId)
  )
  const [loading, setLoading] = useState(!message)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getMailMessage(messageId)
      .then(async (msg) => {
        setMessage(msg)
        setCachedMailDetail(messageId, msg)
        setError(null)

        if (!msg.isRead && msg.folder === "inbox") {
          await setMailReadState(messageId, true).catch(() => {})
        }

        for (const attachment of msg.attachments) {
          void cacheSmallAttachment({
            id: attachment.id,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            signedDownloadUrl: attachment.signedDownloadUrl,
          })
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load message")
      })
      .finally(() => setLoading(false))
  }, [messageId])

  const dateLabel = useMemo(() => {
    if (!message) return ""
    return new Date(message.createdAt).toLocaleString()
  }, [message])

  const iframeDocument = useMemo(() => {
    if (!message) return ""
    const content = message.bodyHtml
      ? message.bodyHtml
      : message.bodyText
        ? `<pre>${escapeHtml(message.bodyText)}</pre>`
        : `<p>No message body</p>`

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: blob: https:; style-src 'unsafe-inline'; font-src data:; media-src 'self' data: blob: https:; connect-src 'none'; script-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'" />
    <style>
      :root { color-scheme: dark; }
      html, body {
        margin: 0;
        padding: 0;
        background: #090a10;
        color: #e8e8ef;
        font: 14px/1.6 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      }
      body { padding: 16px; }
      img, video, table { max-width: 100%; }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        margin: 0;
        font: inherit;
      }
      a { color: #8ab4ff; text-decoration: underline; }
    </style>
  </head>
  <body>${content}</body>
</html>`
  }, [message])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="md" clockwise />
      </div>
    )
  }

  if (error || !message) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? "Message not found"}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Message header */}
      <div className="border-b border-white/8 px-4 py-4 sm:px-6">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h1 className="text-base font-semibold leading-snug text-foreground">
            {message.subject || "(No subject)"}
          </h1>
          <button
            type="button"
            onClick={() =>
              openMailComposer({
                to: [message.fromAddress],
                subject: message.subject.startsWith("Re:")
                  ? message.subject
                  : `Re: ${message.subject}`,
              })
            }
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium tracking-wide text-foreground transition-colors hover:bg-white/10"
          >
            <Reply size={13} />
            Reply
          </button>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            <span className="text-muted-foreground/60">From</span>{" "}
            <span className="text-foreground/80">{message.fromAddress}</span>
          </p>
          <p>
            <span className="text-muted-foreground/60">To</span>{" "}
            <span className="text-foreground/80">{message.toAddresses.join(", ")}</span>
          </p>
          <p className="text-muted-foreground/50">{dateLabel}</p>
        </div>
      </div>

      {/* Body */}
      <iframe
        title="Email content"
        srcDoc={iframeDocument}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="w-full border-0"
        style={{ height: "max(400px, calc(100vh - 320px))" }}
      />

      {/* Attachments */}
      {message.attachments.length > 0 && (
        <div className="border-t border-white/8 px-4 py-4 sm:px-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
            Attachments ({message.attachments.length})
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {message.attachments.map((attachment) => (
              <li key={attachment.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="truncate text-sm text-foreground">{attachment.fileName}</p>
                <p className="text-xs text-muted-foreground">{attachment.mimeType}</p>
                <p className="text-xs text-muted-foreground">{Math.ceil(attachment.sizeBytes / 1024)} KB</p>

                {attachment.imageProxyUrl && (
                  <div className="relative mt-2 h-32 overflow-hidden rounded-lg border border-white/10">
                    <Image
                      src={attachment.imageProxyUrl}
                      alt={attachment.fileName}
                      fill
                      sizes="(max-width: 768px) 100vw, 240px"
                      className="object-cover"
                    />
                  </div>
                )}

                <a
                  href={attachment.signedDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Download size={12} />
                  Download
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
