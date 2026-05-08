'use client'
import { useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'

interface Props {
  onApprove: () => void
  disabled?: boolean
  cooldownSec?: number
}

const THUMB_SIZE = 52
const TRACK_H = 60

export function SlideToApprove({ onApprove, disabled, cooldownSec }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [completed, setCompleted] = useState(false)

  const getMaxX = () =>
    trackRef.current ? trackRef.current.offsetWidth - THUMB_SIZE - 8 : 0

  // All pointer handlers live on the thumb so pointer capture works correctly.
  // With setPointerCapture, events keep firing on the thumb even when the
  // pointer moves outside the track — no need for onPointerLeave cleanup.
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || completed) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const relX = e.clientX - rect.left - THUMB_SIZE / 2
    const maxX = getMaxX()
    setDragX(Math.max(0, Math.min(relX, maxX)))
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    setIsDragging(false)
    const maxX = getMaxX()
    if (dragX >= maxX * 0.88) {
      setCompleted(true)
      setDragX(maxX)
      onApprove()
    } else {
      setDragX(0)
    }
  }

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    setIsDragging(false)
    setDragX(0)
  }

  const progress = getMaxX() > 0 ? dragX / getMaxX() : 0
  const labelOpacity = Math.max(0, 1 - progress * 2.5)

  return (
    <div
      ref={trackRef}
      className="relative w-full rounded-full select-none"
      style={{
        height: TRACK_H,
        background: 'oklch(1 0 0 / 5%)',
        border: '1px solid oklch(1 0 0 / 8%)',
        backdropFilter: 'blur(12px)',
        touchAction: 'none',
        overflow: 'hidden',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {/* Track label */}
      <div
        className="absolute inset-0 flex items-center justify-center text-xs tracking-widest pointer-events-none"
        style={{ opacity: labelOpacity, color: 'var(--muted-foreground)' }}
      >
        {disabled && cooldownSec ? `Available in ${cooldownSec}s` : 'Slide to approve →'}
      </div>

      {/* Thumb — slightly larger hit area via padding, visually same size */}
      <div
        className="absolute top-0 left-0 flex items-center justify-center rounded-full"
        style={{
          // Pad the hit area so the edge of the thumb is easier to grab
          padding: 4,
          margin: -4,
          marginTop: (TRACK_H - THUMB_SIZE) / 2 - 4,
          marginLeft: 4,
          width: THUMB_SIZE + 8,
          height: THUMB_SIZE + 8,
          transform: `translateX(${dragX}px)`,
          transition: isDragging ? 'none' : 'transform 0.25s ease-out',
          cursor: disabled ? 'default' : completed ? 'default' : 'grab',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* Visual thumb */}
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            background: 'oklch(1 0 0 / 14%)',
            border: '1px solid oklch(1 0 0 / 22%)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 2px 12px oklch(0 0 0 / 18%), inset 0 1px 0 oklch(1 0 0 / 12%)',
            opacity: disabled ? 0.35 : 1,
          }}
        >
          <ChevronRight className="size-5 text-white/70" />
        </div>
      </div>
    </div>
  )
}
