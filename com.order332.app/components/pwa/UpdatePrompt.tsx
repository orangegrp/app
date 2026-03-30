'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { useVersionCheck } from '@/hooks/useVersionCheck'
import { UpdateApplyOverlay } from '@/components/pwa/UpdateApplyOverlay'

const DESKTOP_MQ = '(min-width: 640px)'

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_MQ)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function getDesktopSnapshot() {
  return window.matchMedia(DESKTOP_MQ).matches
}

function getServerSnapshot() {
  return false
}

const UPDATE_PROMPT_TITLE = 'App update available'
const UPDATE_PROMPT_BODY =
  'The 332 app has been updated. Please click update below to update the app.'

export function UpdatePrompt() {
  const { hasUpdate, confirmUpdate } = useVersionCheck()
  const [swUpdate, setSwUpdate] = useState(false)
  const [invitationDismissed, setInvitationDismissed] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const toastIdRef = useRef<string | number | null>(null)

  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getServerSnapshot)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handleControllerChange = () => setSwUpdate(true)
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
  }, [])

  const showUpdate = hasUpdate || swUpdate
  const showInvitation = showUpdate && !invitationDismissed && !isApplying

  const startApply = useCallback(() => {
    if (toastIdRef.current !== null) {
      toast.dismiss(toastIdRef.current)
      toastIdRef.current = null
    }
    setInvitationDismissed(true)
    setIsApplying(true)
  }, [])

  useEffect(() => {
    if (!showInvitation || !isDesktop) {
      return
    }
    if (toastIdRef.current !== null) {
      return
    }

    const id = toast(UPDATE_PROMPT_TITLE, {
      description: UPDATE_PROMPT_BODY,
      duration: 60_000,
      action: {
        label: 'Update',
        onClick: () => {
          startApply()
        },
      },
      onDismiss: () => {
        setInvitationDismissed(true)
        toastIdRef.current = null
      },
      onAutoClose: () => {
        setInvitationDismissed(true)
        toastIdRef.current = null
      },
    })
    toastIdRef.current = id

    return () => {
      if (toastIdRef.current !== null) {
        toast.dismiss(toastIdRef.current)
        toastIdRef.current = null
      }
    }
  }, [showInvitation, isDesktop, startApply])

  const handleComplete = useCallback(() => {
    void confirmUpdate()
  }, [confirmUpdate])

  if (!showUpdate && !isApplying) {
    return null
  }

  return (
    <>
      {showInvitation && !isDesktop ? (
        <div
          className="fixed inset-0 z-[210] flex items-end justify-center px-4 pb-6"
          style={{ background: 'oklch(0 0 0 / 60%)', backdropFilter: 'blur(4px)' }}
          onClick={() => setInvitationDismissed(true)}
          role="presentation"
        >
          <div
            className="glass-card w-full max-w-sm flex flex-col gap-5 rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-prompt-title"
          >
            <div className="flex flex-col gap-1">
              <p className="section-label">Update</p>
              <h2 id="update-prompt-title" className="text-2xl tracking-widest text-foreground">
                {UPDATE_PROMPT_TITLE}
                <span className="blink-cursor">_</span>
              </h2>
              <p className="mt-1 text-sm tracking-wider text-muted-foreground">{UPDATE_PROMPT_BODY}</p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={startApply}
                className="glass-button glass-button-glass w-full rounded-xl px-4 py-3 text-sm tracking-widest"
                style={{ minHeight: '44px' }}
              >
                Update
              </button>
              <button
                type="button"
                onClick={() => setInvitationDismissed(true)}
                className="glass-button glass-button-ghost w-full rounded-xl px-4 py-3 text-sm tracking-widest text-muted-foreground"
                style={{ minHeight: '44px' }}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isApplying ? <UpdateApplyOverlay onComplete={handleComplete} /> : null}
    </>
  )
}
