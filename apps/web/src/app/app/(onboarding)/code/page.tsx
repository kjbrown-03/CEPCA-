'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import type { MeDto } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { qk } from '../../_lib/queries'
import { Btn, FormError, Loading, OnboardingHeader, Txt, color } from '../../_components/ui'

const RESEND_AFTER = 30 // délai imposé par l'API entre deux codes

type Pending = { email: string; name: string; phone: string; mode: 'login' | 'signup' }

/** Étape 2 : code à 4 chiffres reçu par e-mail. Crée le compte à la première vérification. */
export default function CodeStep() {
  const router = useRouter()
  const qc = useQueryClient()
  const [p, setP] = useState<Pending | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(RESEND_AFTER)
  const [resent, setResent] = useState(false)

  useEffect(() => {
    let saved: Pending | null = null
    try {
      saved = JSON.parse(sessionStorage.getItem('cepca.signup') ?? 'null')
    } catch {
      saved = null
    }
    if (saved?.email) setP(saved)
    else router.replace('/app/compte')
  }, [router])

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function verify(e?: FormEvent) {
    e?.preventDefault()
    if (!p || code.length !== 4) return
    setBusy(true)
    setError(null)
    try {
      await api.post('/auth/otp/verify', { email: p.email, code, ...(p.name ? { fullName: p.name } : {}), ...(p.phone ? { phone: p.phone } : {}), cookie: true })
      try {
        sessionStorage.removeItem('cepca.signup')
      } catch {
        // rien à nettoyer
      }
      qc.clear()
      const me = await api.get<MeDto>('/me')
      qc.setQueryData(qk.me, me)
      // Pas encore d'Église : étape 3 ; sinon directement l'accueil
      router.replace(me.membership ? '/app' : '/app/eglise')
    } catch (err) {
      setError(errorMessage(err))
      setCode('')
      setBusy(false)
    }
  }

  async function resend() {
    if (!p) return
    setError(null)
    try {
      await api.post('/auth/otp/request', { email: p.email, purpose: p.mode === 'login' ? 'LOGIN' : 'SIGNUP' })
      setResent(true)
      setWait(RESEND_AFTER)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (!p) return <Loading minHeight={400} />

  const mm = `${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`
  return (
    <form className="pwa-flow" style={{ gap: 20 }} onSubmit={verify} noValidate>
      <OnboardingHeader step={2} fallback="/app/compte" />
      <div style={{ paddingTop: 6 }}>
        <Txt as="h1" serif size={34} lh={1.05}>
          Code de vérification
        </Txt>
        <Txt size={14} lh={1.5} color={color.textMuted} style={{ marginTop: 8 }}>
          Saisissez le code à 4 chiffres envoyé à <strong style={{ color: color.text }}>{p.email}</strong>. Pensez à regarder dans les courriers indésirables.
        </Txt>
      </div>
      <input
        className="pwa-code"
        value={code}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, '').slice(0, 4))
          if (error) setError(null)
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={4}
        autoFocus
        placeholder="••••"
        aria-label="Code de vérification"
        aria-invalid={!!error}
      />
      <FormError text={error} />
      <Txt size={13} color={color.textMuted}>
        {resent && wait > 0 ? 'Nouveau code envoyé. ' : 'Vous n’avez rien reçu ? '}
        {wait > 0 ? (
          <span style={{ fontWeight: 700, color: color.textFaint }}>Renvoyer le code ({mm})</span>
        ) : (
          <button type="button" onClick={resend} style={{ fontWeight: 700, color: color.primary }}>
            Renvoyer le code
          </button>
        )}
      </Txt>
      <div style={{ flex: 1 }} />
      <Btn type="submit" label="Vérifier" disabled={code.length !== 4} loading={busy} />
    </form>
  )
}
