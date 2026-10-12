'use client'

import { Suspense, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { COUNTRY_CODES, toE164 } from '@cepca/shared'
import { api, ApiError, errorMessage } from '@/lib/api'
import { Btn, Chip, ChipRow, FormError, OnboardingHeader, Txt, color } from '../../_components/ui'

const COUNTRIES: Record<(typeof COUNTRY_CODES)[number], string> = { '+237': 'Cameroun', '+33': 'France', '+1': 'Canada' }

export default function AccountPage() {
  return (
    <Suspense>
      <AccountStep />
    </Suspense>
  )
}

/**
 * Étape 1 : nom, e-mail et téléphone (création), ou e-mail seul (connexion).
 * Le code part par e-mail ; le téléphone sert au paiement Mobile Money.
 */
function AccountStep() {
  const router = useRouter()
  const params = useSearchParams()
  const login = params.get('mode') === 'connexion'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [cc, setCc] = useState<(typeof COUNTRY_CODES)[number]>('+237')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mail = email.trim().toLowerCase()
  const e164 = toE164(cc, phone)
  const valid = /^\S+@\S+\.\S+$/.test(mail) && (login || (name.trim().length >= 2 && !!e164))

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    // Les informations d'inscription restent dans l'onglet le temps de saisir le code (jamais dans l'adresse)
    try {
      sessionStorage.setItem('cepca.signup', JSON.stringify({ email: mail, name: login ? '' : name.trim(), phone: login ? '' : e164, mode: login ? 'login' : 'signup' }))
    } catch {
      // navigation privée : le code reste vérifiable, l'inscription demandera le nom à nouveau
    }
    const next = '/app/code'
    try {
      await api.post('/auth/otp/request', { email: mail, purpose: login ? 'LOGIN' : 'SIGNUP' })
      router.push(next)
    } catch (err) {
      // Code déjà envoyé il y a moins de 30 s : on passe quand même à la saisie
      if (err instanceof ApiError && err.code === 'OTP_COOLDOWN') router.push(next)
      else setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="pwa-flow" style={{ gap: 18 }} onSubmit={send} noValidate>
      <OnboardingHeader step={1} />
      <div style={{ paddingTop: 6 }}>
        <Txt as="h1" serif size={34} lh={1.05}>
          {login ? 'Me connecter' : 'Créer mon compte'}
        </Txt>
        <Txt size={14} lh={1.5} color={color.textMuted} style={{ marginTop: 8 }}>
          Un code vous sera envoyé par e-mail pour vérifier votre adresse.
        </Txt>
      </div>

      {login ? null : (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="pwa-label">Nom complet</span>
          <input className="pwa-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Élise Moukoko" autoComplete="name" autoCapitalize="words" />
        </label>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="pwa-label">Adresse e-mail</span>
        <input className="pwa-input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </label>

      {login ? null : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="pwa-label">Pays</span>
            <ChipRow>
              {COUNTRY_CODES.map((c) => (
                <Chip key={c} label={`${COUNTRIES[c]} ${c}`} active={cc === c} onClick={() => setCc(c)} height={38} />
              ))}
            </ChipRow>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="pwa-label">Numéro de téléphone</span>
            <span className="pwa-phone">
              <span>{cc}</span>
              <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6 77 12 34 42" autoComplete="tel-national" />
            </span>
            <Txt size={12} color={color.textMuted} lh={1.5}>
              Utilisé pour vos dons par MTN MoMo ou Orange Money.
            </Txt>
          </label>
        </>
      )}

      <FormError text={error} />
      {login ? (
        <Txt size={12} color={color.textMuted} lh={1.5}>
          Pas encore de compte ?{' '}
          <Link href="/app/compte" replace style={{ fontWeight: 700 }}>
            Créer mon compte
          </Link>
        </Txt>
      ) : (
        <Txt size={12} color={color.textMuted} lh={1.5}>
          Vous avez déjà un compte ?{' '}
          <Link href="/app/compte?mode=connexion" replace style={{ fontWeight: 700 }}>
            Me connecter
          </Link>
        </Txt>
      )}

      <div style={{ flex: 1 }} />
      <Btn type="submit" label="Recevoir le code" disabled={!valid} loading={busy} />
    </form>
  )
}
