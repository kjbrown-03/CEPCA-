import type { Metadata } from 'next'
import Link from 'next/link'
import { Cross } from '@phosphor-icons/react/dist/ssr'

export const metadata: Metadata = { title: 'Bienvenue' }

// Photo d'illustration (Unsplash, Danique Godwin) en attendant les photos du CEPCA
const PHOTO = 'https://images.unsplash.com/photo-1604072366376-63d46248927e?auto=format&fit=crop&w=900&q=80'

export default function Welcome() {
  return (
    <main style={{ position: 'relative', minHeight: '100dvh', background: 'var(--c-deep)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- photo d'ambiance, plein écran */}
      <img src={PHOTO} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(16,42,28,.97) 34%, rgba(16,42,28,.25) 72%, transparent)' }} />
      <div style={{ position: 'relative', padding: '0 26px calc(env(safe-area-inset-bottom, 0px) + 40px)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--c-primary)', color: 'var(--c-on-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Cross size={18} aria-hidden />
          </span>
          <span className="serif" style={{ fontSize: 26, color: 'var(--c-on-primary)' }}>
            CEPCA
          </span>
        </div>
        <h1 className="serif" style={{ fontSize: 44, lineHeight: 1.05, color: 'var(--c-on-primary)' }}>
          Votre Église, <em style={{ color: 'var(--c-accent-light)' }}>où que vous soyez.</em>
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--c-on-primary-muted-2)' }}>
          Cultes en direct, annonces de votre paroisse et contributions par Mobile Money, au Cameroun comme dans la diaspora.
        </p>
        <Link href="/app/compte" className="pwa-btn ochre" style={{ height: 56, fontSize: 16 }}>
          Créer mon compte
        </Link>
        <Link href="/app/compte?mode=connexion" className="pwa-btn light" style={{ height: 56, fontSize: 16 }}>
          J’ai déjà un compte
        </Link>
      </div>
    </main>
  )
}
