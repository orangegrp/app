'use client'

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from 'react'
import { useAuthStore } from '@/lib/auth-store'
import type { Editor } from '@tiptap/core'
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { createLowlight, common } from 'lowlight'
import { Markdown } from 'tiptap-markdown'
import { toast } from 'sonner'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Link as LinkIcon,
  Image as ImageIcon,
  Code2,
  Table as TableIcon,
  AlertCircle,
  Trash2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { mergeDomRects, type BlogEditorSelectionMeta } from '@/lib/blog-editor-ai-types'

const lowlight = createLowlight(common)

// ── Trailing paragraph after code blocks ─────────────────────────────────
const TrailingNode = Extension.create({
  name: 'trailingNode',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('trailingNode'),
        appendTransaction: (transactions, _, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null
          const { doc, tr, schema } = newState
          const lastNode = doc.lastChild
          if (!lastNode || lastNode.type.name !== 'codeBlock') return null
          return tr.insert(doc.content.size, schema.nodes.paragraph!.create())
        },
      }),
    ]
  },
})

const MIN_IMAGE_WIDTH = 120

// 8-handle resize config: dx/dy define direction (-1 = left/up, 0 = axis unused, 1 = right/down)
const RESIZE_HANDLES = [
  { id: 'tl', cls: 'absolute top-0 -translate-y-1/2 -left-1.5 cursor-nw-resize',                    dx: -1 as const, dy: -1 as const },
  { id: 'tm', cls: 'absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2 cursor-n-resize',     dx:  0 as const, dy: -1 as const },
  { id: 'tr', cls: 'absolute top-0 -translate-y-1/2 -right-1.5 cursor-ne-resize',                   dx:  1 as const, dy: -1 as const },
  { id: 'ml', cls: 'absolute top-1/2 -translate-y-1/2 -left-1.5 cursor-w-resize',                   dx: -1 as const, dy:  0 as const },
  { id: 'mr', cls: 'absolute top-1/2 -translate-y-1/2 -right-1.5 cursor-e-resize',                  dx:  1 as const, dy:  0 as const },
  { id: 'bl', cls: 'absolute bottom-0 translate-y-1/2 -left-1.5 cursor-sw-resize',                  dx: -1 as const, dy:  1 as const },
  { id: 'bm', cls: 'absolute bottom-0 translate-y-1/2 left-1/2 -translate-x-1/2 cursor-s-resize',   dx:  0 as const, dy:  1 as const },
  { id: 'br', cls: 'absolute bottom-0 translate-y-1/2 -right-1.5 cursor-se-resize',                 dx:  1 as const, dy:  1 as const },
] as const

// ── Resizable image NodeView ──────────────────────────────────────────────
function ResizableImageView({ node, updateAttributes, selected, deleteNode }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [confirming, setConfirming] = useState(false)

  // Intercept Delete/Backspace when the image node is selected
  useEffect(() => {
    if (!selected || confirming) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setConfirming(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [selected, confirming])

  const startResize = (e: React.MouseEvent, dx: -1 | 0 | 1, dy: -1 | 0 | 1) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = imgRef.current?.offsetWidth ?? (node.attrs.width as number | null) ?? MIN_IMAGE_WIDTH

    const onMouseMove = (ev: MouseEvent) => {
      const delta = dx !== 0
        ? (ev.clientX - startX) * dx
        : (ev.clientY - startY) * dy
      updateAttributes({ width: Math.min(2000, Math.max(MIN_IMAGE_WIDTH, Math.round(startWidth + delta))) })
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleConfirmDelete = async () => {
    const src = node.attrs.src as string
    const { accessToken } = useAuthStore.getState()
    try {
      await fetch('/api/blog/images', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ url: src }),
        credentials: 'include',
      })
    } catch {
      // best-effort; still remove from editor
    }
    deleteNode()
  }

  const imgWidth = (node.attrs.width as number | null) ?? undefined
  const displayWidth = imgWidth && imgWidth < MIN_IMAGE_WIDTH ? MIN_IMAGE_WIDTH : imgWidth

  return (
    // NodeViewWrapper provides block-level spacing; inner div is the exact positioning context
    <NodeViewWrapper style={{ display: 'block', margin: '0.5rem 0', maxWidth: '100%' }}>
      <div className="relative inline-block" style={{ maxWidth: '100%' }}>
        <img
          ref={imgRef}
          src={node.attrs.src as string}
          alt={(node.attrs.alt as string) ?? ''}
          width={displayWidth}
          style={{ display: 'block', maxWidth: '100%', minWidth: `${MIN_IMAGE_WIDTH}px`, borderRadius: '6px' }}
          className={selected ? 'ring-2 ring-white/30' : ''}
        />

        {selected && !confirming && (
          <>
            {/* 8 resize handles */}
            {RESIZE_HANDLES.map((h) => (
              <div
                key={h.id}
                onMouseDown={(e) => startResize(e, h.dx, h.dy)}
                className={`${h.cls} h-3 w-3 rounded-sm bg-white shadow-sm ring-1 ring-black/20`}
              />
            ))}
            {/* Delete button — centered on the image */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setConfirming(true)}
              title="Delete image"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}

        {/* Inline delete confirmation overlay */}
        {selected && confirming && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/65">
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-popover p-4 shadow-xl">
              <p className="text-xs text-foreground">Remove this image?</p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { void handleConfirmDelete() }}
                  className="rounded-md bg-red-500/80 px-3 py-1.5 text-xs text-white hover:bg-red-500 transition-colors text-left"
                >
                  Delete — remove from post &amp; CDN
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => deleteNode()}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground hover:bg-white/10 transition-colors text-left"
                >
                  Keep but remove — remove from post only
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setConfirming(false)}
                  className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

// Serializes as <img> HTML when width is set (markdown can't carry width).
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute('width'),
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
    }
  },
  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void },
          node: { attrs: Record<string, unknown> },
        ) {
          const src = ((node.attrs.src as string) ?? '').replace(/"/g, '&quot;')
          const alt = ((node.attrs.alt as string) ?? '').replace(/"/g, '&quot;')
          if (node.attrs.width) {
            state.write(`<img src="${src}" alt="${alt}" width="${node.attrs.width as number}" />`)
          } else {
            const escapedAlt = alt.replace(/[[\]]/g, '\\$&')
            const title = node.attrs.title
              ? ` "${(node.attrs.title as string).replace(/"/g, '\\"')}"`
              : ''
            state.write(`![${escapedAlt}](${src}${title})`)
          }
        },
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})

// ── Component ─────────────────────────────────────────────────────────────
interface Props {
  value: string
  onChange: (md: string) => void
  onImageUpload: (file: File) => Promise<string>
  onSelectionChange?: () => void
}

export interface VisualEditorHandle {
  toggleBold: () => void
  toggleItalic: () => void
  toggleStrike: () => void
  toggleCode: () => void
  toggleHeading1: () => void
  toggleHeading2: () => void
  toggleHeading3: () => void
  toggleBulletList: () => void
  toggleOrderedList: () => void
  toggleBlockquote: () => void
  toggleCodeBlock: () => void
  setHorizontalRule: () => void
  openLinkDialog: () => void
  openImagePicker: () => void
  openTableDialog: () => void
  getSelectionMeta: () => BlogEditorSelectionMeta | null
  getSelectionRect: () => DOMRect | null
  getSelectionRects: () => DOMRect[]
  replaceSelection: (text: string) => void
  insertAfterSelection: (markdown: string) => void
  insertImage: (url: string, alt?: string) => void
}

function selectionInTipTapCodeBlock(editor: Editor): boolean {
  const { from, to } = editor.state.selection
  let hit = false
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === 'codeBlock') hit = true
  })
  if (hit) return true
  const $from = editor.state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'codeBlock') return true
  }
  return false
}

function rectFromPmEditor(editor: Editor): DOMRect | null {
  return mergeDomRects(rectsFromPmSelection(editor))
}

/**
 * One rect per client box from the native selection, clipped to the ProseMirror root.
 * Matches how the browser paints multi-line selections.
 */
function rectsFromPmSelection(editor: Editor): DOMRect[] {
  const { from, to } = editor.state.selection
  if (from === to) return []
  const pm = editor.view.dom as HTMLElement
  const pmRect = pm.getBoundingClientRect()
  try {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) {
      return rectsFromPmCoordsFallback(editor)
    }
    const range = sel.getRangeAt(0)
    const out: DOMRect[] = []
    const rects = range.getClientRects()
    for (let i = 0; i < rects.length; i++) {
      const r = rects.item(i)
      if (!r || (r.width < 0.5 && r.height < 0.5)) continue
      const interLeft = Math.max(r.left, pmRect.left)
      const interTop = Math.max(r.top, pmRect.top)
      const interRight = Math.min(r.right, pmRect.right)
      const interBottom = Math.min(r.bottom, pmRect.bottom)
      if (interLeft >= interRight || interTop >= interBottom) continue
      out.push(new DOMRect(interLeft, interTop, interRight - interLeft, interBottom - interTop))
    }
    if (out.length > 0) return out
  } catch {
    /* ignore */
  }
  return rectsFromPmCoordsFallback(editor)
}

function rectsFromPmCoordsFallback(editor: Editor): DOMRect[] {
  const { from, to } = editor.state.selection
  if (from === to) return []
  const view = editor.view
  const s = view.coordsAtPos(from)
  const e = view.coordsAtPos(to)
  if (!s || !e) return []
  const left = Math.min(s.left, s.right, e.left, e.right)
  const right = Math.max(s.left, s.right, e.left, e.right)
  const top = Math.min(s.top, s.bottom, e.top, e.bottom)
  const bottom = Math.max(s.top, s.bottom, e.top, e.bottom)
  return [new DOMRect(left, top, right - left, bottom - top)]
}

const hasJsxComponents = (md: string) => /<[A-Z]/.test(md)

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`rounded p-1.5 transition-colors ${
        active
          ? 'bg-white/20 text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}

export const VisualEditor = forwardRef<VisualEditorHandle, Props>(function VisualEditor(
  { value, onChange, onImageUpload, onSelectionChange },
  ref,
) {
  const onChangeRef = useRef(onChange)
  const onImageUploadRef = useRef(onImageUpload)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const isExternalUpdateRef = useRef(false)
  const prevValueRef = useRef(value)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<Editor | null>(null)

  // Link dialog
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [linkHasSelection, setLinkHasSelection] = useState(false)

  // Table dialog
  const [tableOpen, setTableOpen] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)

  useEffect(() => {
    onChangeRef.current = onChange
    onImageUploadRef.current = onImageUpload
    onSelectionChangeRef.current = onSelectionChange
  }, [onChange, onImageUpload, onSelectionChange])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      TrailingNode,
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
      ResizableImage,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'underline' } }),
      Placeholder.configure({ placeholder: 'Start writing your post...' }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    onUpdate: ({ editor: e }) => {
      if (!isExternalUpdateRef.current) {
        const md = e.storage.markdown.getMarkdown() as string
        onChangeRef.current(md)
        prevValueRef.current = md
      }
    },
    onSelectionUpdate: () => {
      onSelectionChangeRef.current?.()
    },
    editorProps: {
      attributes: { class: 'tiptap-editor focus:outline-none h-full' },
    },
  })

  useEffect(() => {
    editorRef.current = editor ?? null
  }, [editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (value !== prevValueRef.current) {
      isExternalUpdateRef.current = true
      editor.commands.setContent(value)
      isExternalUpdateRef.current = false
      prevValueRef.current = value
    }
  }, [editor, value])

  const handleImageUpload = async (file: File) => {
    const ed = editorRef.current
    if (!ed) return
    try {
      const url = await onImageUploadRef.current(file)
      ed.chain().focus().setImage({ src: url, alt: file.name }).run()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image upload failed')
    }
  }

  const openLinkDialog = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const { from, to } = ed.state.selection
    const sel = from !== to
    const selectedText = sel ? ed.state.doc.textBetween(from, to, ' ') : ''
    const currentHref = ed.getAttributes('link').href as string | undefined
    setLinkHasSelection(sel)
    setLinkText(sel ? selectedText : '')
    setLinkUrl(currentHref ?? 'https://')
    setLinkOpen(true)
  }, [])

  const confirmLink = () => {
    const ed = editorRef.current
    if (!ed) return
    if (!linkUrl || linkUrl === 'https://') {
      ed.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      // Validate URL scheme — reject javascript:, data:, etc.
      let parsedUrl: URL
      try {
        parsedUrl = new URL(linkUrl)
      } catch {
        return
      }
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return
      }
      const safeUrl = parsedUrl.href
      if (linkHasSelection) {
        ed.chain().focus().extendMarkRange('link').setLink({ href: safeUrl }).run()
      } else {
        const text = linkText.trim() || safeUrl
        ed
          .chain()
          .focus()
          .insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href: safeUrl } }] })
          .run()
      }
    }
    setLinkOpen(false)
  }

  const openTableDialog = useCallback(() => {
    setTableRows(3)
    setTableCols(3)
    setTableOpen(true)
  }, [])

  const confirmTable = () => {
    const ed = editorRef.current
    if (!ed) return
    ed
      .chain()
      .focus()
      .insertTable({ rows: tableRows, cols: tableCols, withHeaderRow: true })
      .run()
    setTableOpen(false)
  }

  useImperativeHandle(
    ref,
    () => ({
      toggleBold: () => editorRef.current?.chain().focus().toggleBold().run(),
      toggleItalic: () => editorRef.current?.chain().focus().toggleItalic().run(),
      toggleStrike: () => editorRef.current?.chain().focus().toggleStrike().run(),
      toggleCode: () => editorRef.current?.chain().focus().toggleCode().run(),
      toggleHeading1: () => editorRef.current?.chain().focus().toggleHeading({ level: 1 }).run(),
      toggleHeading2: () => editorRef.current?.chain().focus().toggleHeading({ level: 2 }).run(),
      toggleHeading3: () => editorRef.current?.chain().focus().toggleHeading({ level: 3 }).run(),
      toggleBulletList: () => editorRef.current?.chain().focus().toggleBulletList().run(),
      toggleOrderedList: () => editorRef.current?.chain().focus().toggleOrderedList().run(),
      toggleBlockquote: () => editorRef.current?.chain().focus().toggleBlockquote().run(),
      toggleCodeBlock: () => editorRef.current?.chain().focus().toggleCodeBlock().run(),
      setHorizontalRule: () => editorRef.current?.chain().focus().setHorizontalRule().run(),
      openLinkDialog,
      openImagePicker: () => fileInputRef.current?.click(),
      openTableDialog,
      insertImage: (url: string, alt = '') => {
        editorRef.current?.chain().focus().setImage({ src: url, alt }).run()
      },
      getSelectionMeta: (): BlogEditorSelectionMeta | null => {
        const ed = editorRef.current
        if (!ed) return null
        const { from, to } = ed.state.selection
        if (from === to) return null
        const text = ed.state.doc.textBetween(from, to, '\n')
        const inCodeBlock = selectionInTipTapCodeBlock(ed)
        return { from, to, text, inCodeBlock }
      },
      getSelectionRect: () => {
        const ed = editorRef.current
        if (!ed) return null
        return rectFromPmEditor(ed)
      },
      getSelectionRects: () => {
        const ed = editorRef.current
        if (!ed) return []
        return rectsFromPmSelection(ed)
      },
      replaceSelection: (text: string) => {
        const ed = editorRef.current
        if (!ed) return
        const { from, to } = ed.state.selection
        ed.chain().focus().insertContentAt({ from, to }, text).run()
      },
      insertAfterSelection: (markdown: string) => {
        const ed = editorRef.current
        if (!ed) return
        const pos = ed.state.selection.to
        ed.chain().focus().insertContentAt(pos, markdown).run()
      },
    }),
    [openLinkDialog, openTableDialog],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-white/10 px-2 py-1.5 shrink-0">
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive('bold')}
          title="Bold"
        >
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive('italic')}
          title="Italic"
        >
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          active={editor?.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleCode().run()}
          active={editor?.isActive('code')}
          title="Inline code"
        >
          <Code size={14} />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-white/10" />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor?.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor?.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor?.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading3 size={14} />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-white/10" />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive('bulletList')}
          title="Bullet list"
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive('orderedList')}
          title="Ordered list"
        >
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          active={editor?.isActive('blockquote')}
          title="Blockquote"
        >
          <Quote size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          active={editor?.isActive('codeBlock')}
          title="Code block"
        >
          <Code2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
        >
          <Minus size={14} />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-white/10" />

        <ToolbarButton onClick={openLinkDialog} active={editor?.isActive('link')} title="Link">
          <LinkIcon size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => fileInputRef.current?.click()} title="Upload image">
          <ImageIcon size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={openTableDialog} active={editor?.isActive('table')} title="Insert table">
          <TableIcon size={14} />
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImageUpload(file)
            e.target.value = ''
          }}
        />
      </div>

      {/* MDX JSX warning */}
      {hasJsxComponents(value) && (
        <div className="flex items-center gap-2 border-b border-yellow-500/20 bg-yellow-500/10 px-4 py-2 text-xs text-yellow-300/80 shrink-0">
          <AlertCircle size={12} />
          Visual mode may strip custom MDX JSX components. Switch to Raw mode to use JSX.
        </div>
      )}

      {/* Editor content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* ── Link dialog ── */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Insert Link</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground tracking-wide">URL</label>
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !linkHasSelection && (e.preventDefault(), setLinkUrl(linkUrl))}
                placeholder="https://"
                autoFocus
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>
            {linkHasSelection ? (
              <p className="text-xs text-muted-foreground">
                Linking selected text:{' '}
                <span className="text-foreground font-medium">{`"${linkText}"`}</span>
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground tracking-wide">
                  Link text <span className="text-muted-foreground/60">(defaults to URL if empty)</span>
                </label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), confirmLink())}
                  placeholder="Display text"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmLink}
              className="rounded-lg bg-white/90 px-4 py-2 text-xs font-medium tracking-wide text-black hover:bg-white transition-colors"
            >
              {!linkUrl || linkUrl === 'https://' ? 'Remove Link' : 'Set Link'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Table dialog ── */}
      <Dialog open={tableOpen} onOpenChange={setTableOpen}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Insert Table</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="text-xs text-muted-foreground tracking-wide">Rows</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={tableRows}
                  onChange={(e) => setTableRows(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="text-xs text-muted-foreground tracking-wide">Columns</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={tableCols}
                  onChange={(e) => setTableCols(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
              Table dimensions cannot be changed in the visual editor after creation. Use the raw editor to add or remove rows and columns.
            </p>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setTableOpen(false)}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmTable}
              className="rounded-lg bg-white/90 px-4 py-2 text-xs font-medium tracking-wide text-black hover:bg-white transition-colors"
            >
              Insert Table
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
})
