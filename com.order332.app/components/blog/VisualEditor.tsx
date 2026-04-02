'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
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
  AlertCircle,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

const lowlight = createLowlight(common)

// ── Ensures there's always a paragraph after the last code block ──────────
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

// ── Resizable image NodeView ───────────────────────────────────────────────
function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = imgRef.current?.offsetWidth ?? (node.attrs.width as number | null) ?? 400

    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(40, Math.round(startWidth + ev.clientX - startX))
      updateAttributes({ width: newWidth })
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <NodeViewWrapper className="relative inline-block" style={{ maxWidth: '100%' }}>
      <img
        ref={imgRef}
        src={node.attrs.src as string}
        alt={(node.attrs.alt as string) ?? ''}
        width={(node.attrs.width as number | null) ?? undefined}
        style={{ display: 'block', maxWidth: '100%', borderRadius: '6px', margin: '0.5rem 0' }}
        className={selected ? 'ring-2 ring-blue-400/60' : ''}
      />
      {selected && (
        <div
          onMouseDown={startResize}
          className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm border border-blue-300/60 bg-blue-500/80"
          title="Drag to resize"
        />
      )}
    </NodeViewWrapper>
  )
}

// When a width is set, serialize as <img> HTML so the size is preserved in MDX.
// Plain markdown images (![alt](src)) cannot carry a width attribute.
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
        serialize(state: any, node: any) {
          const src = (node.attrs.src as string) ?? ''
          const alt = ((node.attrs.alt as string) ?? '').replace(/"/g, '&quot;')
          if (node.attrs.width) {
            state.write(`<img src="${src}" alt="${alt}" width="${node.attrs.width as number}" />`)
          } else {
            // Standard markdown image
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

// ── Component ──────────────────────────────────────────────────────────────
interface Props {
  value: string
  onChange: (md: string) => void
  onImageUpload: (file: File) => Promise<string>
}

const hasJsxComponents = (md: string) => /<[A-Z]/.test(md)

export function VisualEditor({ value, onChange, onImageUpload }: Props) {
  const onChangeRef = useRef(onChange)
  const onImageUploadRef = useRef(onImageUpload)
  const isExternalUpdateRef = useRef(false)
  const prevValueRef = useRef(value)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Link dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkInputValue, setLinkInputValue] = useState('')

  onChangeRef.current = onChange
  onImageUploadRef.current = onImageUpload

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      TrailingNode,
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
      ResizableImage,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'underline' } }),
      Placeholder.configure({ placeholder: 'Start writing your post...' }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => {
      if (!isExternalUpdateRef.current) {
        const md = e.storage.markdown.getMarkdown() as string
        onChangeRef.current(md)
        prevValueRef.current = md
      }
    },
    editorProps: {
      attributes: { class: 'tiptap-editor focus:outline-none h-full' },
    },
  })

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
    if (!editor) return
    try {
      const url = await onImageUploadRef.current(file)
      editor.chain().focus().setImage({ src: url, alt: file.name }).run()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image upload failed')
    }
  }

  const openLinkDialog = () => {
    const current = editor?.getAttributes('link').href as string | undefined
    setLinkInputValue(current ?? 'https://')
    setLinkDialogOpen(true)
  }

  const confirmLink = () => {
    if (!editor) return
    if (linkInputValue === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkInputValue }).run()
    }
    setLinkDialogOpen(false)
  }

  const ToolbarButton = ({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void
    active?: boolean
    title: string
    children: React.ReactNode
  }) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
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

      {/* Link dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Insert Link</DialogTitle>
          </DialogHeader>
          <input
            type="url"
            value={linkInputValue}
            onChange={(e) => setLinkInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                confirmLink()
              }
            }}
            placeholder="https://"
            autoFocus
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setLinkDialogOpen(false)}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmLink}
              className="rounded-lg bg-white/90 px-4 py-2 text-xs font-medium tracking-wide text-black hover:bg-white transition-colors"
            >
              {linkInputValue ? 'Set Link' : 'Remove Link'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
