import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { ThemeColor } from '@/components/pwa/ThemeColor'
import { InstatusBanner } from '@/components/status/InstatusBanner'
import './globals.css'

export const metadata: Metadata = {
  title: '332 App',
  description: '332 members-only app',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/polygon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black',
    title: '332',
  },
}

export const viewport: Viewport = {
  // Default; overridden at runtime by ThemeColor component (black everywhere except iOS)
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-sans antialiased">
        <ThemeColor />
        <div className="flex min-h-screen flex-col">
          <InstatusBanner />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
        <Toaster
          className="toaster"
          position="bottom-right"
          theme="dark"
          toastOptions={{
            classNames: {
              actionButton: 'glass-button glass-button-glass rounded-lg px-3 py-1 text-xs tracking-widest',
              cancelButton: 'glass-button glass-button-ghost rounded-lg px-3 py-1 text-xs tracking-widest',
            },
          }}
        />
      </body>
    </html>
  )
}
