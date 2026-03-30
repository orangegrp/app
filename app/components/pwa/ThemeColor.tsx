'use client'
import { useEffect } from 'react'

export function ThemeColor() {
  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const color = isIOS ? '#1a1a1a' : '#000000'
    let tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!tag) {
      tag = document.createElement('meta')
      tag.name = 'theme-color'
      document.head.appendChild(tag)
    }
    tag.content = color
  }, [])

  return null
}
