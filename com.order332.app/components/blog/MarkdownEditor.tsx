'use client'

import { useEffect, useRef, useCallback } from 'react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  value: string
  onChange: (md: string) => void
  onImageUpload: (file: File) => Promise<string>
}

export function MarkdownEditor({ value, onChange, onImageUpload }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onImageUploadRef = useRef(onImageUpload)
  const isExternalUpdateRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  onChangeRef.current = onChange
  onImageUploadRef.current = onImageUpload

  const insertImageAtCursor = useCallback(async (file: File) => {
    const view = viewRef.current
    if (!view) return

    const pos = view.state.selection.main.head
    const placeholder = `![Uploading ${file.name}...]()`
    view.dispatch({ changes: { from: pos, insert: placeholder } })

    try {
      const url = await onImageUploadRef.current(file)
      const doc = view.state.doc.toString()
      const idx = doc.indexOf(placeholder)
      if (idx >= 0) {
        view.dispatch({
          changes: { from: idx, to: idx + placeholder.length, insert: `![image](${url})` },
        })
      }
    } catch (err) {
      const doc = view.state.doc.toString()
      const idx = doc.indexOf(placeholder)
      if (idx >= 0) {
        view.dispatch({ changes: { from: idx, to: idx + placeholder.length, insert: '' } })
      }
      toast.error(err instanceof Error ? err.message : 'Image upload failed')
    }
  }, [])

  // Bootstrap CodeMirror on mount
  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          lineNumbers(),
          markdown(),
          oneDark,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isExternalUpdateRef.current) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
          EditorView.domEventHandlers({
            paste(event) {
              const items = event.clipboardData?.items ?? []
              for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                  event.preventDefault()
                  const file = item.getAsFile()
                  if (file) void insertImageAtCursor(file)
                  return true
                }
              }
              return false
            },
            drop(event) {
              const files = event.dataTransfer?.files
              if (!files?.length) return false
              const imageFile = Array.from(files).find((f) => f.type.startsWith('image/'))
              if (!imageFile) return false
              event.preventDefault()
              void insertImageAtCursor(imageFile)
              return true
            },
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '13px', background: '#000 !important' },
            '&.cm-focused': { outline: 'none' },
            '.cm-scroller': { overflow: 'auto', fontFamily: 'monospace' },
            '.cm-content': { padding: '12px 8px' },
            '.cm-gutters': { background: '#000 !important', borderRight: '1px solid rgba(255,255,255,0.06)' },
            '.cm-gutter': { background: '#000 !important' },
            '.cm-activeLineGutter': { background: 'rgba(255,255,255,0.04) !important' },
            '.cm-activeLine': { background: 'rgba(255,255,255,0.03) !important' },
          }),
        ],
      }),
      parent: containerRef.current,
    })

    viewRef.current = view
    return () => view.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes into CodeMirror without stomping cursor
  const prevValueRef = useRef(value)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (value !== prevValueRef.current && value !== currentDoc) {
      isExternalUpdateRef.current = true
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      })
      isExternalUpdateRef.current = false
    }
    prevValueRef.current = value
  }, [value])

  const handleInsertImageClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void insertImageAtCursor(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 border-b border-white/10 px-3 py-1.5 shrink-0">
        <button
          type="button"
          onClick={handleInsertImageClick}
          title="Insert image"
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
        >
          <ImageIcon size={13} />
          <span>Image</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInputChange}
        />
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  )
}
