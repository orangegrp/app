'use client'

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { Compartment, EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, history, historyKeymap, selectAll } from '@codemirror/commands'
import { Image as ImageIcon, WrapText } from 'lucide-react'
import { toast } from 'sonner'
import { mergeDomRects, type BlogEditorSelectionMeta } from '@/lib/blog-editor-ai-types'

const BLOG_MD_WORD_WRAP_KEY = 'blog-md-word-wrap'

function readWordWrapPref(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(BLOG_MD_WORD_WRAP_KEY) === '1'
}

export interface MarkdownEditorHandle {
  openImagePicker: () => void
  getSelectionMeta: () => BlogEditorSelectionMeta | null
  /** Bounding box of the full selection (merged line rects). */
  getSelectionRect: () => DOMRect | null
  /** One rect per visual line in the selection (for AI glow). */
  getSelectionRects: () => DOMRect[]
  /** Wrap the current selection with prefix/suffix (empty selection inserts both at cursor). */
  wrapSelection: (before: string, after: string) => void
  /** Set ATX heading on the current line (# or ##), replacing any existing heading prefix. */
  prefixHeadingLine: (level: 1 | 2) => void
  replaceSelection: (text: string) => void
  insertAfterSelection: (markdown: string) => void
  toggleWordWrap: () => void
}

interface Props {
  value: string
  onChange: (md: string) => void
  onImageUpload: (file: File) => Promise<string>
  /** Called when the selection changes (for AI assist toolbar positioning). */
  onSelectionChange?: () => void
}

function selectionInMarkdownCode(state: EditorState, from: number, to: number): boolean {
  const tree = syntaxTree(state)
  const at = (pos: number) => {
    for (let n = tree.resolveInner(pos, -1); n; n = n.parent!) {
      if (n.type.name === 'FencedCode' || n.type.name === 'CodeBlock') return true
    }
    return false
  }
  if (at(from) || at(to)) return true
  if (from < to) return at(Math.floor((from + to) / 2))
  return false
}

/** One client rect per logical line in the selection (matches native highlight strips). */
function rectsFromCmSelection(view: EditorView): DOMRect[] {
  const { from, to } = view.state.selection.main
  if (from === to) return []
  const doc = view.state.doc
  const rects: DOMRect[] = []
  const fromLine = doc.lineAt(from)
  const toLine = doc.lineAt(to)
  for (let n = fromLine.number; n <= toLine.number; n++) {
    const line = doc.line(n)
    const a = Math.max(from, line.from)
    const b = Math.min(to, line.to)
    if (a >= b) continue
    const s = view.coordsAtPos(a)
    const e = view.coordsAtPos(b)
    if (!s || !e) continue
    const left = Math.min(s.left, s.right, e.left, e.right)
    const right = Math.max(s.left, s.right, e.left, e.right)
    const top = Math.min(s.top, s.bottom, e.top, e.bottom)
    const bottom = Math.max(s.top, s.bottom, e.top, e.bottom)
    rects.push(new DOMRect(left, top, right - left, bottom - top))
  }
  return rects
}

function rectFromCmSelection(view: EditorView): DOMRect | null {
  return mergeDomRects(rectsFromCmSelection(view))
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(
  function MarkdownEditor({ value, onChange, onImageUpload, onSelectionChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const wordWrapCompartmentRef = useRef(new Compartment())
    const onChangeRef = useRef(onChange)
    const onImageUploadRef = useRef(onImageUpload)
    const onSelectionChangeRef = useRef(onSelectionChange)
    const isExternalUpdateRef = useRef(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [wordWrap, setWordWrap] = useState(readWordWrapPref)

    onChangeRef.current = onChange
    onImageUploadRef.current = onImageUpload
    onSelectionChangeRef.current = onSelectionChange

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

    const handleToggleWordWrap = useCallback(() => {
      const view = viewRef.current
      if (!view) return
      const next = !view.lineWrapping
      if (typeof window !== 'undefined') {
        localStorage.setItem(BLOG_MD_WORD_WRAP_KEY, next ? '1' : '0')
      }
      setWordWrap(next)
      view.dispatch({
        effects: wordWrapCompartmentRef.current.reconfigure(
          next ? EditorView.lineWrapping : [],
        ),
      })
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        openImagePicker: () => fileInputRef.current?.click(),
        getSelectionMeta: (): BlogEditorSelectionMeta | null => {
          const view = viewRef.current
          if (!view) return null
          const main = view.state.selection.main
          if (main.empty) return null
          const text = view.state.doc.sliceString(main.from, main.to)
          const inCodeBlock = selectionInMarkdownCode(view.state, main.from, main.to)
          return { from: main.from, to: main.to, text, inCodeBlock }
        },
        getSelectionRect: () => {
          const view = viewRef.current
          if (!view) return null
          return rectFromCmSelection(view)
        },
        getSelectionRects: () => {
          const view = viewRef.current
          if (!view) return []
          return rectsFromCmSelection(view)
        },
        wrapSelection: (before: string, after: string) => {
          const view = viewRef.current
          if (!view) return
          const { from, to } = view.state.selection.main
          const text = view.state.doc.sliceString(from, to)
          view.dispatch({ changes: { from, to, insert: before + text + after } })
        },
        prefixHeadingLine: (level: 1 | 2) => {
          const view = viewRef.current
          if (!view) return
          const head = view.state.selection.main.head
          const line = view.state.doc.lineAt(head)
          const prefix = level === 1 ? '# ' : '## '
          const content = line.text.replace(/^#{1,6}\s+/, '')
          view.dispatch({
            changes: { from: line.from, to: line.to, insert: prefix + content },
          })
        },
        replaceSelection: (text: string) => {
          const view = viewRef.current
          if (!view) return
          const { from, to } = view.state.selection.main
          view.dispatch({ changes: { from, to, insert: text } })
        },
        insertAfterSelection: (md: string) => {
          const view = viewRef.current
          if (!view) return
          const pos = view.state.selection.main.to
          view.dispatch({ changes: { from: pos, insert: md } })
        },
        toggleWordWrap: handleToggleWordWrap,
      }),
      [handleToggleWordWrap],
    )

    // Bootstrap CodeMirror on mount
    useEffect(() => {
      if (!containerRef.current) return

      const view = new EditorView({
        state: EditorState.create({
          doc: value,
          extensions: [
            history(),
            lineNumbers(),
            wordWrapCompartmentRef.current.of(readWordWrapPref() ? EditorView.lineWrapping : []),
            markdown(),
            oneDark,
            /* Mod-a before defaultKeymap so we always notify after CodeMirror select-all (AI toolbar). */
            keymap.of([
              {
                key: 'Mod-a',
                run: (view) => {
                  if (!selectAll(view)) return false
                  onSelectionChangeRef.current?.()
                  return true
                },
              },
            ]),
            keymap.of([...defaultKeymap, ...historyKeymap]),
            EditorView.updateListener.of((update) => {
              if (update.docChanged && !isExternalUpdateRef.current) {
                onChangeRef.current(update.state.doc.toString())
              }
              if (update.selectionSet) {
                onSelectionChangeRef.current?.()
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
              // WebKit: base theme uses `background` shorthand on &dark .cm-selectionBackground; use
              // !important + box-shadow (outline is unreliable on absolute selection rects in Safari).
              '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
                {
                  background: '#b8c0ce !important',
                  backgroundColor: '#b8c0ce !important',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.92) !important',
                },
              '.cm-content ::selection': {
                background: '#b8c0ce !important',
                backgroundColor: '#b8c0ce !important',
              },
            },
            { dark: true },
            ),
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
          <button
            type="button"
            onClick={handleToggleWordWrap}
            title={wordWrap ? 'Turn off word wrap' : 'Word wrap'}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
              wordWrap
                ? 'bg-white/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
            }`}
          >
            <WrapText size={13} />
            <span>Wrap</span>
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
  },
)
