"use client"

import { ShieldAlert } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { VtScanStats } from "@/lib/content-api"

interface VTWarningDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  vtScanStats: VtScanStats | null
  vtScanUrl: string | null
}

export function VTWarningDialog({ open, onClose, onConfirm, vtScanStats, vtScanUrl }: VTWarningDialogProps) {
  const malicious = vtScanStats?.malicious ?? 0
  const suspicious = vtScanStats?.suspicious ?? 0

  const parts: string[] = []
  if (malicious > 0) parts.push(`${malicious} engine${malicious !== 1 ? "s" : ""} flagged it as malicious`)
  if (suspicious > 0) parts.push(`${suspicious} flagged it as suspicious`)
  const summary = parts.length > 0 ? parts.join(", ") + "." : "Some security engines flagged this file."

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            This file may be unsafe
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">{summary}</span>
            {vtScanUrl && (
              <a
                href={vtScanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs underline underline-offset-2 hover:text-foreground transition-colors"
              >
                View full VirusTotal report
              </a>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Download anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
