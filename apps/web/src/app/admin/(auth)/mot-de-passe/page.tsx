'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { adminPassword } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { PasswordInput } from '@/components/password'
import { CodeInput } from '../code-input'

type Challenge = { challengeId: string; sentTo: string; expiresInSec: number }

export default function PasswordPage() {
  const [email, setEmail] = useState('')
  const [ch, setCh] = useState<Challenge | null>(null)
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const requestCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Saisissez votre adresse e-mail.')
    setBusy(true)
    setError(null)
    try {
      setCh(await api.post<Challenge>('/auth/admin/password/request', { email: email.trim() }))
      setCode('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const pwCheck = adminPassword.safeParse(pw)
  const pwError = pw && !pwCheck.success ? pwCheck.error.issues[0]?.message : null
  const mismatch = pw2.length > 0 && pw !== pw2

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!ch || code.length !== 6 || !pwCheck.success || pw !== pw2) return
    setBusy(true)
    setError(null)
    try {
      await api.post('/auth/admin/password/reset', { challengeId: ch.challengeId, code, password: pw })
      setDone(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (done)
    return (
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <span className="tile lg">
          <CheckCircle size={22} weight="fill" />
        </span>
        <h1 style={{ font: '400 40px/1.05 var(--font-serif), serif' }}>Mot de passe enregistré</h1>
        <p className="lead" style={{ margin: 0, color: 'var(--c-text-muted)' }}>
          Vos autres sessions ont été fermées. Connectez-vous avec votre adresse e-mail et ce nouveau mot de passe.
        </p>
        <Link href="/admin/connexion" className="btn" style={{ height: 52 }}>
          Se connecter
        </Link>
      </div>
    )

  if (ch)
    return (
      <form onSubmit={save} noValidate>
        <button type="button" className="row muted" style={{ fontSize: 13, fontWeight: 600 }} onClick={() => setCh(null)}>
          <ArrowLeft size={16} />
          Changer d’adresse
        </button>
        <span className="eyebrow">Étape 2 sur 2</span>
        <h1>Nouveau mot de passe</h1>
        <p className="lead">
          Si cette adresse correspond à un compte de responsable, un code à 6 chiffres vient d’être envoyé à <strong>{ch.sentTo}</strong>. Pensez à regarder dans les courriers indésirables.
        </p>
        <div className="field">
          <span>Code reçu par e-mail</span>
          <CodeInput value={code} onChange={setCode} />
        </div>
        <label className="field">
          Mot de passe
          <PasswordInput autoComplete="new-password" value={pw} aria-invalid={!!pwError || undefined} onChange={(e) => setPw(e.target.value)} />
          {pwError ? <span className="field-error">{pwError}</span> : <span className="field-hint">10 caractères au moins, avec une lettre et un chiffre.</span>}
        </label>
        <label className="field">
          Confirmation
          <PasswordInput autoComplete="new-password" value={pw2} aria-invalid={mismatch || undefined} onChange={(e) => setPw2(e.target.value)} />
          {mismatch ? <span className="field-error">Les deux saisies diffèrent.</span> : null}
        </label>
        {error ? <Err text={error} /> : null}
        <button className="btn" type="submit" disabled={busy || code.length !== 6 || !pwCheck.success || pw !== pw2} style={{ height: 52 }}>
          {busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
        </button>
      </form>
    )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void requestCode()
      }}
      noValidate
    >
      <span className="eyebrow">Espace responsables</span>
      <h1>Définir mon mot de passe</h1>
      <p className="lead">Après une nomination, ou si vous l’avez oublié : nous envoyons un code à l’adresse e-mail de votre compte. Personne d’autre ne fixe votre mot de passe.</p>
      <label className="field">
        Adresse e-mail
        <input className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </label>
      {error ? <Err text={error} /> : null}
      <button className="btn" type="submit" disabled={busy} style={{ height: 52 }}>
        {busy ? 'Envoi du code…' : 'Recevoir un code'}
      </button>
      <div className="auth-links">
        <Link href="/admin/connexion">J’ai déjà un mot de passe</Link>
      </div>
    </form>
  )
}

function Err({ text }: { text: string }) {
  return (
    <div className="alert err" role="alert">
      <WarningCircle size={18} />
      {text}
    </div>
  )
}
