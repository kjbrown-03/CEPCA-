import type { Metadata, Viewport } from 'next'
import { Instrument_Serif, Manrope } from 'next/font/google'
import '@cepca/tokens/tokens.css'
import './globals.css'

const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' })
const sans = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'CEPCA — Conseil des Églises Protestantes du Cameroun', template: '%s · CEPCA' },
  description: 'Des Églises diverses, une même maison. Plateforme commune des Églises protestantes du Cameroun.',
}

export const viewport: Viewport = { themeColor: '#1f5a36' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  )
}
