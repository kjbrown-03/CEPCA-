import type { Metadata, Viewport } from 'next'
import { Instrument_Serif, Manrope } from 'next/font/google'
import '@cepca/tokens/tokens.css'
import './globals.css'

const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' })
const sans = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-sans', display: 'swap' })

// Hébergement de démonstration : les paiements y sont simulés, il ne faut pas qu'on le prenne pour le vrai service.
const ESSAI = process.env.DEPLOIEMENT === 'essai'

export const metadata: Metadata = {
  title: {
    default: `CEPCA — Conseil des Églises Protestantes du Cameroun${ESSAI ? ' (essai)' : ''}`,
    template: `%s · CEPCA${ESSAI ? ' (essai)' : ''}`,
  },
  description: 'Des Églises diverses, une même maison. Plateforme commune des Églises protestantes du Cameroun.',
}

export const viewport: Viewport = { themeColor: '#1f5a36' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${serif.variable} ${sans.variable}`}>
      <body>
        {children}
        {ESSAI && (
          <div
            aria-label="Version d'essai : paiements simulés"
            style={{ position: 'fixed', top: 0, right: 0, zIndex: 9999, pointerEvents: 'none', background: '#b45309', color: '#fff', font: '600 10px/1.6 system-ui, sans-serif', padding: '1px 8px', borderBottomLeftRadius: 6, opacity: 0.9 }}
          >
            Version d’essai · paiements simulés
          </div>
        )}
      </body>
    </html>
  )
}
