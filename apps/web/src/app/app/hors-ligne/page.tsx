import type { Metadata } from 'next'
import { WifiSlash } from '@phosphor-icons/react/dist/ssr'

export const metadata: Metadata = { title: 'Hors connexion' }

/** Page servie par le service worker quand le téléphone n'a pas de réseau. */
export default function Offline() {
  return (
    <main className="pwa-flow" style={{ alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', padding: '40px 28px' }}>
      <span style={{ width: 80, height: 80, borderRadius: 40, background: 'var(--c-primary-soft)', color: 'var(--c-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <WifiSlash size={38} aria-hidden />
      </span>
      <h1 className="serif" style={{ fontSize: 32, lineHeight: 1.1 }}>
        Pas de connexion
      </h1>
      <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--c-text-muted)' }}>
        Vérifiez votre accès à Internet. Les prédications que vous avez téléchargées restent disponibles dans « Prédications ».
      </p>
      <a href="/app" className="pwa-btn primary" style={{ height: 52, fontSize: 15, marginTop: 6 }}>
        Réessayer
      </a>
    </main>
  )
}
