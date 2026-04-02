'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
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

  onChangeRef.current = onChange
  onImageUploadRef.current = onImageUpload

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: { languageClassPrefix: 'language-' } }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
      Image,
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
      attributes: {
        class: 'tiptap-editor focus:outline-none h-full',
      },
    },
  })

  // Sync external value changes into TipTap
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
    } catch {
      // Upload failed silently; user can retry
    }
  }

  const setLink = () => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Enter link URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
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

        <ToolbarButton
          onClick={setLink}
          active={editor?.isActive('link')}
          title="Link"
        >
          <LinkIcon size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => fileInputRef.current?.click()}
          title="Upload image"
        >
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
    </div>
  )
}
