import type { CSSProperties } from "react"
import Link from "next/link"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { Download, File, Lock, Shield, ShieldAlert, ShieldCheck } from "lucide-react"
import { VideoPlayerAdaptive } from "@/components/ui/VideoPlayerAdaptive"
import { db } from "@/server/db"
import { supabase } from "@/server/db/supabase/client"
import { sha256 } from "@/server/lib/crypto"
import { CONTENT_LIBRARY_BUCKET } from "@/server/lib/content-upload"
import { buildSignedMuxHlsUrl } from "@/server/lib/mux-playback"
import { verifyRefreshToken } from "@/server/lib/jwt"
import { signUrl } from "@/server/lib/signed-url"

interface Props {
  params: Promise<{ token: string }>
}

type ShareItemType = "image" | "audio" | "pdf" | "download" | "video"
type VtStatus =
  | "not_required"
  | "pending"
  | "scanning"
  | "clean"
  | "flagged"
  | "error"

function statusLabel(status: VtStatus): string {
  switch (status) {
    case "clean":
      return "Clean"
    case "flagged":
      return "Flagged"
    case "error":
      return "Scan failed"
    case "pending":
    case "scanning":
      return "Scanning"
    default:
      return "Not scanned"
  }
}

function vtChip(status: VtStatus) {
  if (status === "clean") {
    return {
      icon: <ShieldCheck className="h-3 w-3" />,
      className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
    }
  }
  if (status === "flagged") {
    return {
      icon: <ShieldAlert className="h-3 w-3" />,
      className: "border-red-500/40 bg-red-500/10 text-red-300",
    }
  }
  return {
    icon: <Shield className="h-3 w-3" />,
    className: "border-white/20 bg-white/8 text-white/75",
  }
}

function widgetFrameStyle(height = 176): CSSProperties {
  return {
    width: "100%",
    minHeight: `${height}px`,
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.15)",
    background:
      "radial-gradient(120% 120% at 12% 0%, rgba(255,255,255,0.08), rgba(255,255,255,0.02) 55%), rgba(3,7,18,0.84)",
  }
}

async function isInternalViewerAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get("refresh_token")?.value
  if (!refreshToken) return false

  try {
    const payload = await verifyRefreshToken(refreshToken)
    const session = await db.getSessionByTokenHash(sha256(refreshToken))
    if (!session || session.expiresAt < new Date()) return false
    return session.userId === payload.sub
  } catch {
    return false
  }
}

export default async function ContentEmbedPage({ params }: Props) {
  const { token } = await params
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound()

  const link = await db.getContentShareLinkByToken(token)
  if (!link) notFound()

  const { data: row, error } = await supabase
    .from("content_items")
    .select(
      "id, item_type, title, file_size, width, height, vt_scan_status, vt_scan_url, mux_playback_id, video_status, storage_key"
    )
    .eq("id", link.contentItemId)
    .single()

  if (error || !row) notFound()

  const itemType = row.item_type as ShareItemType
  const vtStatus = ((row.vt_scan_status as VtStatus | null) ??
    "not_required") as VtStatus
  const vtScanUrl = (row.vt_scan_url as string | null) ?? null
  const isInternal = link.mode === "internal"
  const shareHref = `/share/${token}`
  const loginHref = `/login?redirect=${encodeURIComponent(shareHref)}`
  const isAuthenticated = isInternal
    ? await isInternalViewerAuthenticated()
    : false
  const chip = vtChip(vtStatus)

  if (isInternal && !isAuthenticated) {
    return (
      <div className="w-full p-1.5 text-white">
        <div style={widgetFrameStyle(140)} className="flex items-center gap-3 p-3">
          <div className="rounded-lg border border-white/15 bg-white/8 p-2.5">
            <Lock className="h-5 w-5 text-white/80" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              Protected content
            </p>
            <p className="mt-0.5 text-xs text-white/60">
              Sign in to view this internal share
            </p>
          </div>
          <Link
            href={loginHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white/90 hover:bg-white/16"
          >
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  if (isInternal && itemType !== "video") {
    const storageKey = (row.storage_key as string | null) ?? null
    const downloadUrl = storageKey
      ? await signUrl(CONTENT_LIBRARY_BUCKET, storageKey, 3600)
      : ""

    return (
      <div className="w-full p-1.5 text-white">
        <div style={widgetFrameStyle(152)} className="flex items-center gap-3 p-3">
          <File className="h-7 w-7 shrink-0 text-white/75" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{row.title as string}</p>
            <p className="mt-0.5 text-xs text-white/60">Internal file share</p>
          </div>

          <div className="flex items-center gap-2">
            {vtStatus !== "not_required" && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${chip.className}`}
              >
                {chip.icon}
                {statusLabel(vtStatus)}
              </span>
            )}

            <a
              href={downloadUrl || shareHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white/90 hover:bg-white/16"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (itemType === "video") {
    let videoUrl: string | null = null
    const playbackId = (row.mux_playback_id as string | null) ?? null
    if ((row.video_status as string | null) === "ready" && playbackId) {
      const signed = await buildSignedMuxHlsUrl(playbackId)
      videoUrl = signed.url
    }

    return (
      <div className="w-full text-white">
        <div
          style={{
            width: "100%",
            minHeight: "188px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "transparent",
            aspectRatio:
              row.width && row.height && row.width > 0 && row.height > 0
                ? `${row.width} / ${row.height}`
                : "16 / 9",
          }}
          className="overflow-hidden"
        >
          {videoUrl ? (
            <VideoPlayerAdaptive
              src={videoUrl}
              title={row.title as string}
              className="h-full w-full rounded-none"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-black text-sm text-white/70">
              Video preview unavailable
            </div>
          )}
        </div>
      </div>
    )
  }

  if (itemType === "image") {
    return (
      <div className="w-full p-1.5 text-white">
        <Link href={shareHref} target="_blank" rel="noopener noreferrer">
          <div
            style={{
              ...widgetFrameStyle(186),
              aspectRatio:
                row.width && row.height && row.width > 0 && row.height > 0
                  ? `${row.width} / ${row.height}`
                  : "16 / 9",
            }}
            className="group relative overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/share/${token}/embed/image`}
              alt={row.title as string}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
          </div>
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full p-1.5 text-white">
      <div style={widgetFrameStyle(152)} className="flex items-center gap-3 p-3">
        <File className="h-8 w-8 shrink-0 text-white/75" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {row.title as string}
          </p>
          <p className="mt-0.5 text-xs text-white/60">
            {(itemType === "pdf" ? "PDF" : "File") +
              ` · ${Math.max(1, Math.round((Number(row.file_size) || 0) / 1024))} KB`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {vtStatus !== "not_required" &&
            (vtScanUrl ? (
              <a
                href={vtScanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${chip.className}`}
              >
                {chip.icon}
                {statusLabel(vtStatus)}
              </a>
            ) : (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${chip.className}`}
              >
                {chip.icon}
                {statusLabel(vtStatus)}
              </span>
            ))}

          <a
            href={shareHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white/90 hover:bg-white/16"
          >
            <Download className="h-3.5 w-3.5" />
            Open
          </a>
        </div>
      </div>
    </div>
  )
}
