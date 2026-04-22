"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, RefreshCw } from "lucide-react"
import { PageBackground } from "@/components/layout/PageBackground"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { usePermission } from "@/hooks/usePermission"
import { PERMISSIONS } from "@/lib/permissions"
import { apiGet } from "@/lib/api-client"
import { cn } from "@/lib/utils"

const ACTION_LABELS: Record<string, string> = {
  proofread: "Proofread",
  rephrase: "Rephrase",
  expand: "Expand",
  condense: "Condense",
  translate: "Translate",
  quickDraft: "Quick draft",
  createImage: "Create image",
  lyricsTranscription: "Lyrics transcription",
}

const DAYS_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "All time", value: 0 },
]

const ACTION_OPTIONS = [
  { label: "All actions", value: "" },
  ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
]

type LogRow = {
  id: string
  createdAt: string
  userId: string
  userName: string
  action: string
  inputChars: number
}

type Stats = {
  totalCount: number
  totalInputChars: number
  byAction: Record<string, number>
}

type ApiResponse = {
  logs: LogRow[]
  total: number
  page: number
  pageSize: number
  stats: Stats
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatNum(n: number): string {
  return n.toLocaleString()
}

export default function AdminAiUsagePage() {
  const router = useRouter()
  const canAccess = usePermission(PERMISSIONS.ADMIN_PERMISSIONS_MANAGE)

  const [days, setDays] = useState(30)
  const [actionFilter, setActionFilter] = useState("")
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canAccess) router.replace("/home")
  }, [canAccess, router])

  const load = useCallback(async (p: number, d: number, a: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
        days: String(d),
      })
      if (a) params.set("action", a)
      const res = await apiGet<ApiResponse>(`/admin/ai-usage?${params}`)
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canAccess) void load(page, days, actionFilter)
  }, [canAccess, load, page, days, actionFilter])

  const handleDays = (d: number) => {
    setDays(d)
    setPage(1)
  }
  const handleAction = (a: string) => {
    setActionFilter(a)
    setPage(1)
  }
  const handleRefresh = () => void load(page, days, actionFilter)

  if (!canAccess) {
    return (
      <div className="page-root relative flex min-h-screen items-center justify-center">
        <PageBackground />
        <Spinner size="md" />
      </div>
    )
  }

  const stats = data?.stats
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="page-root relative min-h-screen px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-5xl">
        <Link
          href="/admin"
          className="mb-8 inline-flex items-center gap-2 text-xs tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Admin
        </Link>

        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="section-label">Administration</p>
            <h2 className="text-3xl tracking-widest text-foreground">
              AI usage<span className="blink-cursor">_</span>
            </h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="mt-2"
          >
            {loading ? (
              <Spinner size="xs" className="text-muted-foreground" />
            ) : (
              <RefreshCw size={13} />
            )}
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
            {DAYS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleDays(opt.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  days === opt.value
                    ? "bg-white/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
            {ACTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleAction(opt.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  actionFilter === opt.value
                    ? "bg-white/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mb-6 text-xs tracking-wider text-destructive">
            {error}
          </p>
        )}

        {/* Stats */}
        {stats && (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              className="glass-card rounded-xl p-4"
              style={{ background: "oklch(1 0 0 / 5%)" }}
            >
              <p className="mb-1 text-xs tracking-wider text-muted-foreground">
                Total requests
              </p>
              <p className="text-2xl font-light tracking-widest text-foreground">
                {formatNum(stats.totalCount)}
              </p>
            </div>
            <div
              className="glass-card rounded-xl p-4"
              style={{ background: "oklch(1 0 0 / 5%)" }}
            >
              <p className="mb-1 text-xs tracking-wider text-muted-foreground">
                Chars processed
              </p>
              <p className="text-2xl font-light tracking-widest text-foreground">
                {formatNum(stats.totalInputChars)}
              </p>
            </div>
            {/* Top two actions */}
            {Object.entries(stats.byAction)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 2)
              .map(([act, cnt]) => (
                <div
                  key={act}
                  className="glass-card rounded-xl p-4"
                  style={{ background: "oklch(1 0 0 / 5%)" }}
                >
                  <p className="mb-1 text-xs tracking-wider text-muted-foreground">
                    {ACTION_LABELS[act] ?? act}
                  </p>
                  <p className="text-2xl font-light tracking-widest text-foreground">
                    {formatNum(cnt)}
                  </p>
                </div>
              ))}
          </div>
        )}

        {/* Action breakdown bar */}
        {stats && Object.keys(stats.byAction).length > 0 && (
          <div
            className="glass-card mb-6 rounded-xl p-4"
            style={{ background: "oklch(1 0 0 / 5%)" }}
          >
            <p className="mb-3 text-xs tracking-wider text-muted-foreground">
              Breakdown by action
            </p>
            <div className="space-y-2">
              {Object.entries(stats.byAction)
                .sort((a, b) => b[1] - a[1])
                .map(([act, cnt]) => {
                  const pct =
                    stats.totalCount > 0 ? (cnt / stats.totalCount) * 100 : 0
                  return (
                    <div key={act} className="flex items-center gap-3 text-xs">
                      <span className="w-24 shrink-0 text-muted-foreground">
                        {ACTION_LABELS[act] ?? act}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-white/40 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 text-right text-muted-foreground tabular-nums">
                        {formatNum(cnt)}{" "}
                        <span className="opacity-50">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Log table */}
        <div
          className="glass-card overflow-hidden rounded-xl"
          style={{ background: "oklch(1 0 0 / 5%)" }}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-xs tracking-wider text-muted-foreground">
              {data ? `${formatNum(data.total)} requests` : "—"}
            </p>
            {data && totalPages > 1 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ←
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                >
                  →
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner size="sm" />
            </div>
          ) : (data?.logs.length ?? 0) === 0 ? (
            <p className="py-16 text-center text-xs tracking-wider text-muted-foreground">
              No data for this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-2.5 text-left font-normal tracking-wider whitespace-nowrap text-muted-foreground">
                      Time
                    </th>
                    <th className="px-4 py-2.5 text-left font-normal tracking-wider whitespace-nowrap text-muted-foreground">
                      User
                    </th>
                    <th className="px-4 py-2.5 text-left font-normal tracking-wider whitespace-nowrap text-muted-foreground">
                      Action
                    </th>
                    <th className="px-4 py-2.5 text-right font-normal tracking-wider whitespace-nowrap text-muted-foreground">
                      Input chars
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data!.logs.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-2.5 text-foreground">
                        {row.userName}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-foreground">
                        {ACTION_LABELS[row.action] ?? row.action}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatNum(row.inputChars)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bottom pagination */}
        {data && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-muted-foreground">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            >
              ← Previous
            </button>
            <span>
              {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
