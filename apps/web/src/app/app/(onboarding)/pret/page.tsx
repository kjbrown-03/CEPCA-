'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle } from '@phosphor-icons/react'
import { useMe } from '../../_lib/queries'
import { Btn, Txt, color } from '../../_components/ui'

export default function DonePage() {
  return (
    <Suspense>
      <Done />
    </Suspense>
  )
}

function Done() {
  const parish = useSearchParams().get('paroisse') || 'paroisse'
  const me = useMe()
  const first = me.data?.fullName.split(' ')[0] ?? ''
  return (
    <main className="pwa-flow" style={{ alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center', padding: '40px 28px' }}>
      <span style={{ width: 88, height: 88, borderRadius: 44, background: color.primarySoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <CheckCircle size={44} weight="fill" color={color.primary} aria-hidden />
      </span>
      <Txt as="h1" serif size={38} lh={1.05} align="center">
        Bienvenue{first ? `, ${first}` : ''}
      </Txt>
      <Txt size={15} lh={1.55} color={color.textMuted} align="center">
        Votre demande de rattachement à la {parish} a été envoyée au pasteur. Vous pouvez déjà suivre les cultes et les annonces.
      </Txt>
      <Btn label="Découvrir l’application" href="/app" style={{ marginTop: 10, padding: '0 32px' }} />
    </main>
  )
}
