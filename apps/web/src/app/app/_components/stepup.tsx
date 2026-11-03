'use client'

import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeSlash, LockKey, ShieldCheck } from '@phosphor-icons/react'
import { api, ApiError, errorMessage } from '@/lib/api'
import { Btn, FormError, Txt, color } from './ui'

type Challenge = { challengeId: string; sentTo: string; expiresInSec: number }

/**
 * Double authentification avant l'espace responsable (§42) : mot de passe du responsable,
 * puis code à 6 chiffres reçu par e-mail. La session du téléphone devient alors une session « responsable ».
 */
export function StepUp({ roleLabel }: { roleLabel?: string }) {
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [ch, setCh] = useState<Challenge | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noPassword, setNoPassword] = useState(false)

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    if (password.length < 8) return setError('Saisissez votre mot de passe de responsable.')
    setBusy(true)
    setError(null)
    try {
      // Renouvelle d'abord la session du fidèle si elle a expiré (les routes /auth ne le font pas d'elles-mêmes)
      await api.get('/me')
      setCh(await api.post<Challenge>('/auth/staff/request', { password }))
      setCode('')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_PASSWORD') setNoPassword(true)
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    if (!ch || code.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      await api.post('/auth/staff/verify', { challengeId: ch.challengeId, code })
      // La session a changé : toutes les données des responsables sont relues
      await qc.invalidateQueries({ queryKey: ['app', 'staff'] })
    } catch (err) {
      setError(errorMessage(err))
      setCode('')
      setBusy(false)
    }
  }

  return (
    <div className="pwa-card" style={{ padding: 20, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ width: 52, height: 52, borderRadius: 26, background: color.primarySoft, color: color.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {ch ? <ShieldCheck size={26} aria-hidden /> : <LockKey size={26} aria-hidden />}
      </span>
      <div>
        <Txt as="h2" serif size={26} lh={1.1}>
          Confirmez votre identité
        </Txt>
        <Txt size={14} lh={1.5} color={color.textMuted} style={{ marginTop: 6 }}>
          {ch ? (
            <>
              Étape 2 sur 2 : saisissez le code à 6 chiffres envoyé à <strong style={{ color: color.text }}>{ch.sentTo}</strong>.
            </>
          ) : (
            <>
              Étape 1 sur 2 : le mot de passe de votre compte de responsable{roleLabel ? ` (${roleLabel})` : ''}, le même que pour le back-office. Un code vous sera ensuite envoyé par e-mail.
            </>
          )}
        </Txt>
      </div>

      {ch ? (
        <form onSubmit={verify} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            className="pwa-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              if (error) setError(null)
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            placeholder="••••••"
            aria-label="Code à 6 chiffres"
            aria-invalid={!!error}
            style={{ letterSpacing: 10, fontSize: 28, paddingLeft: 10 }}
          />
          <FormError text={error} />
          <Btn type="submit" label="Ouvrir mon espace" height={52} size={15} disabled={code.length !== 6} loading={busy} />
          <button type="button" onClick={() => void sendCode()} disabled={busy} style={{ fontSize: 13, fontWeight: 700, color: color.primary, alignSelf: 'center' }}>
            Renvoyer un code
          </button>
        </form>
      ) : (
        <form onSubmit={sendCode} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="pwa-label">Mot de passe</span>
            <span style={{ position: 'relative', display: 'block' }}>
              <input className="pwa-input" type={shown ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus style={{ paddingRight: 52 }} />
              <button
                type="button"
                onClick={() => setShown((s) => !s)}
                aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                aria-pressed={shown}
                style={{ position: 'absolute', right: 6, top: 6, width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: color.textMuted }}
              >
                {shown ? <EyeSlash size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
              </button>
            </span>
          </label>
          <FormError text={error} />
          {noPassword ? (
            <Txt size={13} lh={1.5} color={color.textMuted}>
              Après votre nomination, définissez votre mot de passe une première fois :{' '}
              <a href="/admin/mot-de-passe" style={{ fontWeight: 700 }}>
                définir mon mot de passe
              </a>
              .
            </Txt>
          ) : null}
          <Btn type="submit" label="Recevoir le code" height={52} size={15} loading={busy} />
          <a href="/admin/mot-de-passe" style={{ fontSize: 13, fontWeight: 700, alignSelf: 'center' }}>
            Mot de passe oublié
          </a>
        </form>
      )}
    </div>
  )
}
