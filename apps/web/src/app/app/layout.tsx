import type { Metadata, Viewport } from 'next'
import { AppProviders } from './providers'
import './pwa.css'

export const metadata: Metadata = {
  title: { default: 'CEPCA', template: '%s · CEPCA' },
  description: 'Cultes en direct, annonces de votre paroisse et contributions par Mobile Money, au Cameroun comme dans la diaspora.',
  applicationName: 'CEPCA',
  appleWebApp: { capable: true, title: 'CEPCA', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png', icon: '/icons/icon-192.png' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4efe6',
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pwa">
      <AppProviders>{children}</AppProviders>
    </div>
  )
}
