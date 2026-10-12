'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, WarningCircle } from '@phosphor-icons/react'
import type { AdminLoginOptionsDto, AdminLoginStructureDto } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { rememberSeat } from '@/lib/session'
import { PasswordInput } from '@/components/password'
import { CodeInput } from '../code-input'

type Challenge = { challengeId: string; sentTo: string; expiresInSec: number; assignmentId: string }
type Level = { key: string; name: string }

/** Page demandée avant la connexion ; uniquement un chemin du back-office (pas de redirection ouverte). */
function safeNext(raw: string | null): string {
  return raw && /^\/admin(\/|$|\?)/.test(raw) && !raw.startsWith('//') ? raw : '/admin'
}

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  )
}

function Login() {
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mandate, setMandate] = useState<{ roleId: string; structureId: string | null }>({ roleId: '', structureId: null })
  const [ch, setCh] = useState<Challenge | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const requestCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Saisissez votre adresse e-mail.')
    if (password.length < 8) return setError('Saisissez votre mot de passe.')
    if (!mandate.roleId) return setError('Choisissez votre rôle.')
    if (!mandate.structureId) return setError('Choisissez la structure où vous exercez ce rôle.')
    setBusy(true)
    setError(null)
    try {
      setCh(await api.post<Challenge>('/auth/admin/login', { email: email.trim(), password, roleId: mandate.roleId, structureId: mandate.structureId }))
      setCode('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const start = (e: FormEvent) => {
    e.preventDefault()
    void requestCode()
  }

  const verify = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!ch || code.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      await api.post('/auth/admin/verify', { challengeId: ch.challengeId, code })
      rememberSeat(ch.assignmentId)
      window.location.assign(safeNext(params.get('next')))
    } catch (err) {
      setError(errorMessage(err))
      setCode('')
      setBusy(false)
    }
  }

  if (ch)
    return (
      <form onSubmit={verify} noValidate>
        <button type="button" className="row muted" style={{ fontSize: 13, fontWeight: 600 }} onClick={() => setCh(null)}>
          <ArrowLeft size={16} />
          Modifier la saisie
        </button>
        <span className="eyebrow">Étape 2 sur 2</span>
        <h1>Code de vérification</h1>
        <p className="lead">
          Nous avons envoyé un code à 6 chiffres à <strong>{ch.sentTo}</strong>. Il est valable {Math.round(ch.expiresInSec / 60)} minutes.
        </p>
        <CodeInput
          value={code}
          invalid={!!error}
          onChange={(v) => {
            setCode(v)
            setError(null)
          }}
        />
        {error ? <Err text={error} /> : null}
        <button className="btn" type="submit" disabled={busy || code.length !== 6} style={{ height: 52 }}>
          {busy ? 'Vérification…' : 'Se connecter'}
        </button>
        <div className="auth-links">
          <button type="button" onClick={() => void requestCode()} disabled={busy} style={{ color: 'var(--c-primary)' }}>
            Renvoyer un code
          </button>
        </div>
      </form>
    )

  return (
    <form onSubmit={start} noValidate>
      <span className="eyebrow">Espace responsables</span>
      <h1>Connexion</h1>
      <p className="lead">Saisissez votre adresse e-mail et votre mot de passe, puis le rôle et la structure où vous l’exercez. Un code vous sera ensuite envoyé par e-mail.</p>
      <label className="field">
        Adresse e-mail
        <input className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </label>
      <label className="field">
        Mot de passe
        <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <MandatePicker onChange={setMandate} />
      {error ? <Err text={error} /> : null}
      <button className="btn" type="submit" disabled={busy} style={{ height: 52 }}>
        {busy ? 'Envoi du code…' : 'Continuer'}
      </button>
      <div className="auth-links">
        <Link href="/admin/mot-de-passe">Mot de passe oublié ou première connexion</Link>
        <Link href="/" className="muted">
          Retour au portail
        </Link>
      </div>
    </form>
  )
}

/**
 * Rôle, puis structure en cascade : confession → synode → consistoire → paroisse → chapelle (selon la confession).
 * Les niveaux situés sous celui du rôle sont grisés : un responsable de consistoire s'arrête au consistoire.
 */
function MandatePicker({ onChange }: { onChange: (m: { roleId: string; structureId: string | null }) => void }) {
  const [opts, setOpts] = useState<AdminLoginOptionsDto | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [roleId, setRoleId] = useState('')
  const [confId, setConfId] = useState('')
  // Choix par niveau de la confession (index 0 = premier niveau sous la confession)
  const [picks, setPicks] = useState<string[]>([])
  const [children, setChildren] = useState<Record<string, AdminLoginStructureDto[]>>({})

  useEffect(() => {
    api
      .get<AdminLoginOptionsDto>('/auth/admin/options')
      .then(setOpts)
      .catch((e) => setLoadError(errorMessage(e)))
  }, [])

  const loadChildren = (parentId: string) => {
    if (!parentId || children[parentId]) return
    api
      .get<AdminLoginStructureDto[]>(`/auth/admin/structures?parentId=${encodeURIComponent(parentId)}`)
      .then((rows) => setChildren((c) => ({ ...c, [parentId]: rows })))
      .catch((e) => setLoadError(errorMessage(e)))
  }

  const role = opts?.roles.find((r) => r.id === roleId) ?? null
  const target = role?.levelKey ?? null
  const isCepca = target === 'conseil'
  const conf = opts?.confessions.find((c) => c.id === confId) ?? null
  // Avant le choix de la confession, on montre la hiérarchie la plus complète, grisée
  const preview = useMemo<Level[]>(() => (opts?.confessions ?? []).reduce<Level[]>((best, c) => (c.levels.length > best.length ? c.levels : best), []), [opts])
  const levels = conf?.levels ?? preview
  const targetIndex = target && target !== 'confession' && !isCepca ? levels.findIndex((l) => l.key === target) : -1
  const roleMissing = !!conf && !!target && !isCepca && target !== 'confession' && targetIndex === -1
  const lastEnabled = !role || isCepca || target === 'confession' || roleMissing ? -1 : target === null ? levels.length - 1 : targetIndex
  const confessions = (opts?.confessions ?? []).filter((c) => !role?.confessionId || c.confessionId === role.confessionId)

  // Structure retenue : la racine (CEPCA), la confession, ou le choix au niveau du rôle
  let structureId: string | null = null
  if (role) {
    if (isCepca) structureId = opts?.root?.id ?? null
    else if (target === 'confession') structureId = confId || null
    else if (target === null) structureId = [...picks].reverse().find(Boolean) ?? (confId || null)
    else if (targetIndex >= 0) structureId = picks[targetIndex] || null
  }
  useEffect(() => {
    onChange({ roleId, structureId })
  }, [roleId, structureId, onChange])

  const pickRole = (id: string) => {
    setRoleId(id)
    const r = opts?.roles.find((x) => x.id === id)
    // Le choix fait sous le nouveau niveau du rôle n'a plus de sens
    if (r?.levelKey === 'conseil') {
      setConfId('')
      setPicks([])
    } else if (r?.confessionId && conf && conf.confessionId !== r.confessionId) {
      setConfId('')
      setPicks([])
    } else if (conf && r) {
      const idx = r.levelKey === 'confession' ? -1 : conf.levels.findIndex((l) => l.key === r.levelKey)
      setPicks((p) => (r.levelKey === null ? p : p.slice(0, idx + 1)))
    }
  }
  const pickConfession = (id: string) => {
    setConfId(id)
    setPicks([])
    loadChildren(id)
  }
  const pickLevel = (i: number, id: string) => {
    setPicks((p) => [...p.slice(0, i), id])
    if (id && i < lastEnabled) loadChildren(id)
  }

  if (loadError) return <Err text={loadError} />

  return (
    <>
      <label className="field">
        Rôle
        <select className="select" value={roleId} onChange={(e) => pickRole(e.target.value)} disabled={!opts}>
          <option value="">{opts ? 'Choisissez votre rôle' : 'Chargement…'}</option>
          {opts?.roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="mandate">
        <legend>Structure</legend>
        <div className="mandate-grid">
          <label className="field">
            Confession
            <select className="select" value={confId} onChange={(e) => pickConfession(e.target.value)} disabled={!role || isCepca}>
              <option value="">{role ? 'Choisissez la confession' : '—'}</option>
              {confessions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {levels.map((l, i) => {
            const parentId = i === 0 ? confId : picks[i - 1]
            const enabled = !!conf && i <= lastEnabled && !!parentId
            const rows = (parentId && children[parentId]?.filter((s) => s.levelKey === l.key)) || []
            return (
              <label key={l.key} className="field">
                {l.name}
                <select className="select" value={enabled ? (picks[i] ?? '') : ''} onChange={(e) => pickLevel(i, e.target.value)} disabled={!enabled}>
                  <option value="">{enabled ? `Choisissez : ${l.name.toLowerCase()}` : '—'}</option>
                  {enabled
                    ? rows.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))
                    : null}
                </select>
                {enabled && parentId && children[parentId] && rows.length === 0 ? <span className="field-hint">Aucune structure de ce niveau ici.</span> : null}
              </label>
            )
          })}
          {isCepca ? <p className="field-hint">Ce rôle s’exerce au niveau du CEPCA : aucune structure à choisir.</p> : null}
          {roleMissing ? <p className="field-error">Ce rôle n’existe pas dans la hiérarchie de cette confession.</p> : null}
        </div>
      </fieldset>
    </>
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
