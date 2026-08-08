"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { openMailComposer } from "@/lib/mail-composer-store"

export default function MailComposeRoutePage() {
  const router = useRouter()

  useEffect(() => {
    openMailComposer()
    router.replace("/mail")
  }, [router])

  return null
}
