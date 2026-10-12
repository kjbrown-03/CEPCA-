'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FloppyDisk } from '@phosphor-icons/react'
import { api, errorMessage } from '@/lib/api'
import { useAct } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import type { ContributionTypeDto, SettingsDto, StructureDetail } from '@/lib/types'
import { ErrorBox, Field, Loading, PageHead, Pill, Toggle, useToast } from '@/components/ui'

const TZ = [
  { value: 'Africa/Douala', label: 'Douala (UTC+1)' },
  { value: 'Europe/Paris', label: 'Paris (UTC+1 / +2)' },
]

interface Form {
  name: string
  address: string
  serviceSchedule: string
  timezone: string
  fr: boolean
  en: boolean
  receiptNote: string
}

const typeKey = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)

export default function SettingsPage() {
  const { seat } = useSession()
  const qc = useQueryClient()
  const toast = useToast()
  const settings = useQuery({ queryKey: ['settings', seat.structure.id], queryFn: () => api.get<SettingsDto>('/admin/settings', { structureId: seat.structure.id }) })
  const s = useQuery({ queryKey: ['structure', seat.structure.id], queryFn: () => api.get<StructureDetail>(`/admin/structures/${seat.structure.id}`) })
  const [f, setF] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [newType, setNewType] = useState('')

  useEffect(() => {
    if (settings.data && s.data && !f)
      setF({
        name: s.data.name,
        address: s.data.address ?? '',
        serviceSchedule: s.data.serviceSchedule ?? '',
        timezone: s.data.timezone,
        fr: settings.data.locales.includes('fr'),
        en: settings.data.locales.includes('en'),
        receiptNote: settings.data.receiptNote,
      })
  }, [settings.data, s.data, f])

  const types = settings.data?.contributionTypes ?? null
  const setTypes = (rows: ContributionTypeDto[]) => qc.setQueryData<SettingsDto>(['settings', seat.structure.id], (old) => (old ? { ...old, contributionTypes: rows } : old))
  const toggleType = useAct((t: ContributionTypeDto) => api.patch<ContributionTypeDto[]>(`/admin/settings/contribution-types/${t.id}`, { active: !t.active }), {
    ok: (_, t) => `${t.label} : ${t.active ? 'désactivé' : 'proposé aux fidèles'}`,
    onDone: setTypes,
  })
  const addType = useAct(
    (label: string) => api.post<ContributionTypeDto[]>('/admin/settings/contribution-types', { key: typeKey(label), label, requiresProject: false, active: true }),
    {
      ok: (_, l) => `Type ajouté : ${l}`,
      onDone: (rows) => {
        setTypes(rows)
        setNewType('')
      },
    },
  )

  const editable = !!settings.data?.editable
  const editIdentity = !!s.data?.canEdit

  const save = async () => {
    if (!f || !settings.data || !s.data) return
    setBusy(true)
    try {
      if (editIdentity)
        await api.patch(`/admin/structures/${s.data.id}`, { name: f.name.trim(), address: f.address.trim() || null, serviceSchedule: f.serviceSchedule.trim() || null, timezone: f.timezone })
      if (editable) {
        const locales = [f.fr && 'fr', f.en && 'en'].filter(Boolean)
        await api.put(`/admin/settings?structureId=${encodeURIComponent(seat.structure.id)}`, { locales: locales.length ? locales : ['fr'], receiptNote: f.receiptNote.trim() })
      }
      toast('Paramètres enregistrés')
      await Promise.all([qc.invalidateQueries({ queryKey: ['settings'] }), qc.invalidateQueries({ queryKey: ['structure', s.data.id] }), qc.invalidateQueries({ queryKey: ['structures'] })])
    } catch (e) {
      toast(errorMessage(e), true)
    } finally {
      setBusy(false)
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => (x ? { ...x, [k]: v } : x))
  /** Au moins une langue reste proposée. */
  const toggleLang = (k: 'fr' | 'en') => setF((x) => (x && (!x[k] || x[k === 'fr' ? 'en' : 'fr']) ? { ...x, [k]: !x[k] } : x))
  const inherited = settings.data?.definedAt

  return (
    <>
      <PageHead eyebrow={`${seat.roleLabel} · ${seat.structure.level}`} title="Paramètres" note="Identité de la structure, langues, types de contributions et moyens de paiement.">
        {editable || editIdentity ? (
          <button type="button" className="btn" disabled={busy || !f || f.name.trim().length < 3} onClick={save}>
            <FloppyDisk size={16} weight="bold" />
            Enregistrer
          </button>
        ) : null}
      </PageHead>
      {settings.isError ? <ErrorBox error={settings.error} onRetry={() => settings.refetch()} /> : null}
      {!f ? (
        <Loading rows={6} />
      ) : (
        <div className="split">
          <section className="card" style={{ flex: '1 1 380px' }}>
            <h2>Identité</h2>
            <fieldset disabled={!editIdentity || busy} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              <Field label="Nom affiché">
                <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={160} />
              </Field>
              <Field label="Adresse du siège">
                <input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} maxLength={200} />
              </Field>
              <Field label="Horaire du culte">
                <input className="input" value={f.serviceSchedule} onChange={(e) => set('serviceSchedule', e.target.value)} placeholder="Dimanche 10:00" maxLength={80} />
              </Field>
              <div className="field">
                <span>Fuseau de référence</span>
                <div className="chips" role="radiogroup" aria-label="Fuseau de référence">
                  {TZ.map((t) => (
                    <button key={t.value} type="button" role="radio" aria-checked={f.timezone === t.value} className={`chip${f.timezone === t.value ? ' on' : ''}`} onClick={() => set('timezone', t.value)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </fieldset>
            <fieldset disabled={!editable || busy} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              <div className="field">
                <span>Langues de l’application</span>
                <div className="chips">
                  <button type="button" role="checkbox" aria-checked={f.fr} className={`chip${f.fr ? ' on' : ''}`} onClick={() => toggleLang('fr')}>
                    Français
                  </button>
                  <button type="button" role="checkbox" aria-checked={f.en} className={`chip${f.en ? ' on' : ''}`} onClick={() => toggleLang('en')}>
                    English
                  </button>
                </div>
                {inherited?.locales && inherited.locales !== seat.structure.name ? <span className="field-hint">Valeur héritée de {inherited.locales}.</span> : null}
              </div>
              <Field label="Mention sur les reçus" hint={inherited?.receiptNote && inherited.receiptNote !== seat.structure.name ? `Valeur héritée de ${inherited.receiptNote}.` : undefined}>
                <textarea className="textarea" rows={3} value={f.receiptNote} onChange={(e) => set('receiptNote', e.target.value)} maxLength={300} />
              </Field>
            </fieldset>
            {!editable && !editIdentity ? <span className="foot-note">Lecture seule : ces réglages sont fixés par un niveau supérieur.</span> : null}
          </section>

          <section className="card" style={{ flex: '1 1 380px' }}>
            <h2>Contributions</h2>
            {types ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Types proposés aux fidèles</span>
                {types.map((t) => (
                  <div key={t.id} className="line" style={{ padding: '9px 0', gap: 12, boxShadow: '0 1px 0 var(--c-border-soft)' }}>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
                      {t.label}
                      {t.requiresProject ? <span className="muted" style={{ fontWeight: 500 }}> · choix du projet</span> : null}
                    </span>
                    <Toggle on={t.active} label={t.label} disabled={!settings.data?.contributionTypesEditable || toggleType.isPending} onChange={() => toggleType.mutate(t)} />
                  </div>
                ))}
                {!settings.data?.contributionTypesEditable ? <span className="foot-note" style={{ marginTop: 8 }}>Les types se décident au niveau de la confession.</span> : null}
              </div>
            ) : (
              <span className="muted" style={{ fontSize: 13 }}>Les types de contribution se définissent au niveau de chaque confession.</span>
            )}
            {types && settings.data?.contributionTypesEditable ? (
              <form
                className="row"
                style={{ flexWrap: 'nowrap' }}
                onSubmit={(e) => {
                  e.preventDefault()
                  if (newType.trim().length >= 2) addType.mutate(newType.trim())
                }}
              >
                <input className="input" value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Nouveau type" aria-label="Nouveau type de contribution" maxLength={60} />
                <button type="submit" className="btn-ghost" disabled={newType.trim().length < 2 || addType.isPending}>
                  Ajouter
                </button>
              </form>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Moyens de paiement</span>
              {[
                { l: 'MTN Mobile Money', s: 'Via Fapshi · frais affichés 1,5 %', st: 'Actif' },
                { l: 'Orange Money', s: 'Via Fapshi · frais affichés 1,5 %', st: 'Actif' },
                { l: 'Carte bancaire (diaspora)', s: 'Prestataire à choisir', st: 'Bientôt' },
              ].map((x) => (
                <div key={x.l} className="line" style={{ padding: '9px 0', gap: 12, boxShadow: '0 1px 0 var(--c-border-soft)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{x.l}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {x.s}
                    </div>
                  </div>
                  <Pill small label={x.st} tone={x.st === 'Actif' ? 'ok' : 'neutral'} />
                </div>
              ))}
              <span className="foot-note" style={{ marginTop: 8 }}>Les moyens de paiement sont communs à la plateforme : ils se règlent avec le CEPCA.</span>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
