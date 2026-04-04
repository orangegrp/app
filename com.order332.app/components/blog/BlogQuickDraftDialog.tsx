'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { BLOG_AI_MAX_INPUT_CHARS } from '@/lib/blog-ai-assist-limits'
import { blogAiAssistRequest, consumeBlogAiTextStream } from '@/lib/blog-ai-api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with generated markdown to insert at the editor caret. */
  onInsert: (markdown: string) => void
}

export function BlogQuickDraftDialog({ open, onOpenChange, onInsert }: Props) {
  const [braindump, setBraindump] = useState('')
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    if (!open) {
      setBraindump('')
      setLoading(false)
    }
  }, [open])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && loading) {
        abortRef.current?.abort()
      }
      onOpenChange(next)
    },
    [loading, onOpenChange],
  )

  const handleGenerate = useCallback(async () => {
    const trimmed = braindump.trim()
    if (!trimmed) {
      toast.error('Describe your idea first')
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)

    try {
      const res = await blogAiAssistRequest('quickDraft', trimmed, { signal: ac.signal })
      const text = await consumeBlogAiTextStream(res, () => {
        /* streaming progress optional */
      })
      if (!text.trim()) {
        return
      }
      const block = `\n\n${text.trim()}\n`
      onInsert(block)
      onOpenChange(false)
      toast.success('Draft inserted')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error(err instanceof Error ? err.message : 'AI request failed')
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [braindump, onInsert, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent overlayClassName="z-[110]" className="z-[110] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick draft</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="blog-quick-draft-braindump">What&apos;s your idea?</Label>
            <Textarea
              id="blog-quick-draft-braindump"
              value={braindump}
              onChange={(e) => setBraindump(e.target.value)}
              placeholder="Braindump notes, bullets, half-formed thoughts…"
              disabled={loading}
              maxLength={BLOG_AI_MAX_INPUT_CHARS.quickDraft}
              className="min-h-[12rem] resize-y"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={loading || !braindump.trim()}
              onClick={() => void handleGenerate()}
            >
              {loading ? 'Generating…' : 'Generate draft'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
