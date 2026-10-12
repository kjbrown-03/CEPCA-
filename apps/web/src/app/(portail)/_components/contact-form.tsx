'use client'

import { useState, type FormEvent } from 'react'
import { CheckCircle, PaperPlaneRight } from '@phosphor-icons/react'

const SUBJECTS = ['Demande d’information', 'Adhésion d’une Église', 'Presse', 'Autre']

export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState(SUBJECTS[0])
  const [message, setMessage] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const errs = {
    name: name.trim().length < 2 ? 'Indiquez votre nom' : null,
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Adresse e-mail invalide' : null,
    message: message.trim().length < 5 ? 'Votre message est trop court' : null,
  }
  const valid = !errs.name && !errs.email && !errs.message

  const send = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), subject, message: message.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? 'L’envoi a échoué. Réessayez dans un instant.')
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'Connexion impossible. Vérifiez votre réseau.')
    } finally {
      setBusy(false)
    }
  }

  if (sent)
    return (
      <div className="form-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start', padding: '24px 0' }} role="status">
          <CheckCircle size={44} weight="fill" color="var(--ocre-ink)" />
          <span style={{ font: '400 34px/1.1 var(--font-serif), serif' }}>Merci, {name.trim()}.</span>
          <span style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.6 }}>Votre message a bien été transmis au secrétariat. Une réponse vous sera envoyée à {email.trim()}.</span>
          <button
            type="button"
            style={{ fontSize: 14, fontWeight: 600, boxShadow: '0 1px 0 currentColor' }}
            onClick={() => {
              setSent(false)
              setMessage('')
              setTouched(false)
            }}
          >
            Écrire un autre message
          </button>
        </div>
      </div>
    )

  const show = (k: keyof typeof errs) => (touched ? errs[k] : null)
  return (
    <form className="form-card" onSubmit={send} noValidate>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <label className="p-field">
            Nom
            <input className="p-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} aria-invalid={!!show('name') || undefined} />
            {show('name') ? <span className="p-err">{show('name')}</span> : null}
          </label>
          <label className="p-field">
            E-mail
            <input className="p-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} aria-invalid={!!show('email') || undefined} />
            {show('email') ? <span className="p-err">{show('email')}</span> : null}
          </label>
        </div>
        <label className="p-field">
          Objet
          <select className="p-input" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {SUBJECTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="p-field">
          Message
          <textarea className="p-input" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} aria-invalid={!!show('message') || undefined} />
          {show('message') ? <span className="p-err">{show('message')}</span> : null}
        </label>
        {error ? (
          <span className="p-err" role="alert">
            {error}
          </span>
        ) : null}
        <button type="submit" className="p-send" disabled={busy || (touched && !valid)}>
          {busy ? 'Envoi…' : 'Envoyer'}
          <PaperPlaneRight size={16} weight="bold" />
        </button>
      </div>
    </form>
  )
}
