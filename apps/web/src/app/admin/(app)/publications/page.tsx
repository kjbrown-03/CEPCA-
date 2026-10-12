'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowBendUpRight, Newspaper, PaperPlaneTilt, Plus, WarningCircle } from '@phosphor-icons/react'
import { fmtInt } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { useSeatSubtree, useSession } from '@/lib/session'
import type { Audiences, PublicationDto } from '@/lib/types'
import { dayShort } from '@/lib/format'
import { Chips, ErrorBox, Field, Loading, PageHead, Pill, ToggleRow, useToast } from '@/components/ui'
import { StructureSelect } from '@/components/structure-select'

type Filter = 'ALL' | 'PUBLISHED' | 'SUBMITTED' | 'DRAFT' | 'RETURNED'
type List = { items: PublicationDto[]; nextCursor: string | null; counts: Partial<Record<PublicationDto['status'], number>> }
type Kind = PublicationDto['kind']
const KINDS: Array<{ value: Kind; label: string }> = [
  { value: 'ANNONCE', label: 'Annonce' },
  { value: 'ACTUALITE', label: 'Actualité' },
  { value: 'COMMUNIQUE', label: 'Communiqué' },
  { value: 'ALERTE', label: 'Alerte' },
]

interface Draft {
  id: string | null
  title: string
  kind: Kind
  body: string
  targetStructureId: string
  groupId: string | null
  notify: boolean
  isPublic: boolean
}

const fromDto = (p: PublicationDto): Draft => ({ id: p.id, title: p.title, kind: p.kind, body: p.body, targetStructureId: p.target.id, groupId: p.group?.id ?? null, notify: p.notify, isPublic: p.isPublic })

export default function PublicationsPage() {
  return (
    <Suspense>
      <Publications />
    </Suspense>
  )
}

function Publications() {
  const params = useSearchParams()
  const { seat } = useSession()
  const [filter, setFilter] = useState<Filter>('ALL')
  const [selId, setSelId] = useState<string | null>(params.get('id'))
  const [creating, setCreating] = useState(params.get('nouveau') === '1')

  const list = useInfiniteQuery({
    queryKey: ['publications', seat.structure.id, filter],
    queryFn: ({ pageParam }) => api.get<List>('/admin/publications', { structureId: seat.structure.id, status: filter === 'ALL' ? undefined : filter, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const c = list.data?.pages[0]?.counts ?? {}
  const total = (c.DRAFT ?? 0) + (c.SUBMITTED ?? 0) + (c.RETURNED ?? 0) + (c.PUBLISHED ?? 0)
  const chips: Array<{ value: Filter; label: string }> = [
    { value: 'ALL', label: `Toutes · ${total}` },
    { value: 'PUBLISHED', label: `Publiées · ${c.PUBLISHED ?? 0}` },
    { value: 'SUBMITTED', label: `À valider · ${c.SUBMITTED ?? 0}` },
    { value: 'DRAFT', label: `Brouillons · ${c.DRAFT ?? 0}` },
    ...(c.RETURNED ? [{ value: 'RETURNED' as Filter, label: `Renvoyées · ${c.RETURNED}` }] : []),
  ]
  const grid = '2.4fr 1.2fr .8fr .8fr 110px'

  return (
    <>
      <PageHead
        eyebrow={`${seat.roleLabel} · ${seat.structure.level}`}
        title="Publications"
        note="Annonces, actualités et communiqués de votre structure. Rédigez, ciblez une audience, faites valider puis publiez."
      >
        {seat.permissions.NEWS?.write ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setCreating(true)
              setSelId(null)
            }}
          >
            <Plus size={16} weight="bold" />
            Nouvelle publication
          </button>
        ) : null}
      </PageHead>

      <div className="split">
        <section className="card main">
          <Chips options={chips} value={filter} onChange={setFilter} label="Statut" />
          {list.isError ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : null}
          <div className="table-wrap tbl-pad">
            <div style={{ minWidth: 620 }}>
              <div className="tbl-head" style={{ gridTemplateColumns: grid }}>
                <span>Titre</span>
                <span>Audience</span>
                <span>Date</span>
                <span>Lectures</span>
                <span>Statut</span>
              </div>
              {list.isPending ? <Loading rows={5} /> : null}
              {rows.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className="tbl-row big"
                  style={{ gridTemplateColumns: grid, padding: '13px 12px' }}
                  aria-pressed={x.id === selId && !creating}
                  onClick={() => {
                    setSelId(x.id)
                    setCreating(false)
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span className="strong ellipsis" style={{ display: 'block' }}>
                      {x.title}
                    </span>
                    <span className="sub">
                      {x.kindLabel}
                      {x.target.id !== seat.structure.id ? ` · ${x.target.name}` : ''}
                    </span>
                  </span>
                  <span style={{ color: 'var(--c-text-muted-2)' }}>{x.audience}</span>
                  <span className="muted">{x.publishedAt ? dayShort(x.publishedAt) : '—'}</span>
                  <span className="tabular">{x.readCount ? fmtInt(x.readCount) : '—'}</span>
                  <span>
                    <Pill label={x.statusLabel} />
                  </span>
                </button>
              ))}
              {!list.isPending && rows.length === 0 ? <div className="empty-line" style={{ padding: '24px 12px' }}>Aucune publication dans cette catégorie.</div> : null}
            </div>
          </div>
          {list.hasNextPage ? (
            <button type="button" className="btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
              Afficher plus
            </button>
          ) : null}
        </section>

        <section className="card side">
          {creating ? (
            <Editor
              key="new"
              initial={{ id: null, title: '', kind: 'ANNONCE', body: '', targetStructureId: seat.structure.id, groupId: null, notify: true, isPublic: true }}
              onSaved={(id) => {
                setCreating(false)
                setSelId(id)
              }}
            />
          ) : selId ? (
            <Loaded id={selId} onGone={() => setSelId(null)} />
          ) : (
            <div className="empty">
              <Newspaper size={40} />
              Sélectionnez une publication ou créez-en une nouvelle.
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function Loaded({ id, onGone }: { id: string; onGone: () => void }) {
  const p = useQuery({ queryKey: ['publication', id], queryFn: () => api.get<PublicationDto>(`/admin/publications/${id}`) })
  if (p.isPending) return <Loading rows={6} />
  if (p.isError) return <ErrorBox error={p.error} onRetry={() => p.refetch()} />
  return <Editor key={`${p.data.id}-${p.data.updatedAt}`} initial={fromDto(p.data)} pub={p.data} onSaved={() => undefined} onGone={onGone} />
}

function Editor({ initial, pub, onSaved, onGone }: { initial: Draft; pub?: PublicationDto; onSaved: (id: string) => void; onGone?: () => void }) {
  const { seat, can } = useSession()
  const { nodes } = useSeatSubtree()
  const qc = useQueryClient()
  const toast = useToast()
  const [d, setD] = useState<Draft>(initial)
  const [busy, setBusy] = useState(false)
  const [returning, setReturning] = useState(false)
  const [note, setNote] = useState('')
  const aud = useQuery({ queryKey: ['audiences', d.targetStructureId], queryFn: () => api.get<Audiences>('/admin/campaigns/audiences', { structureId: d.targetStructureId }), staleTime: 60_000 })

  // Droits : ceux que l'API a calculés pour cette publication, à défaut ceux du mandat
  const canValidate = pub ? pub.can.publish || pub.can.return || (pub.status === 'PUBLISHED' && pub.can.edit) : can('NEWS', 'validate')
  const editable = pub ? pub.can.edit : can('NEWS', 'write')
  const status = pub?.status ?? 'DRAFT'
  const recipients = d.groupId ? (aud.data?.groups.find((g) => g.id === d.groupId)?.recipients ?? 0) : (aud.data?.all ?? 0)
  const valid = d.title.trim().length >= 3

  const refresh = async (id: string) => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['publications'] }), qc.invalidateQueries({ queryKey: ['publication', id] }), qc.invalidateQueries({ queryKey: ['dashboard'] })])
  }

  /** Enregistre le brouillon (création ou modification) et renvoie son identifiant. */
  const persist = async (): Promise<string> => {
    const body = { title: d.title.trim(), kind: d.kind, body: d.body, targetStructureId: d.targetStructureId, groupId: d.groupId, notify: d.notify, isPublic: d.isPublic }
    if (d.id) {
      await api.patch(`/admin/publications/${d.id}`, body)
      return d.id
    }
    const created = await api.post<PublicationDto>('/admin/publications', body)
    setD((x) => ({ ...x, id: created.id }))
    return created.id
  }

  const run = async (what: 'draft' | 'submit' | 'publish' | 'return' | 'archive' | 'delete') => {
    if (what !== 'return' && what !== 'archive' && what !== 'delete' && !valid) return toast('Ajoutez un titre (3 caractères au moins)', true)
    setBusy(true)
    try {
      if (what === 'delete') {
        if (!window.confirm('Supprimer définitivement ce brouillon ?')) return
        await api.del(`/admin/publications/${d.id}`)
        toast('Brouillon supprimé')
        await refresh(d.id!)
        onGone?.()
        return
      }
      if (what === 'archive') {
        if (!window.confirm('Retirer cette publication de l’application ? Elle restera dans l’historique.')) return
        await api.post(`/admin/publications/${d.id}/archive`)
        toast('Publication archivée')
        await refresh(d.id!)
        onGone?.()
        return
      }
      if (what === 'return') {
        await api.post(`/admin/publications/${d.id}/return`, { note: note.trim() })
        toast("Renvoyé à l'auteur avec vos remarques")
        setReturning(false)
        await refresh(d.id!)
        return
      }
      const id = await persist()
      if (what === 'submit') {
        await api.post(`/admin/publications/${id}/submit`)
        toast('Soumis au pasteur pour validation')
      } else if (what === 'publish' && status !== 'PUBLISHED') {
        const r = await api.post<PublicationDto>(`/admin/publications/${id}/publish`)
        toast(`Publié${r.notified ? ` · notification envoyée à ${fmtInt(r.notified)} personne${r.notified > 1 ? 's' : ''}` : ''}`)
      } else {
        toast(status === 'PUBLISHED' ? 'Publication mise à jour' : 'Brouillon enregistré')
      }
      await refresh(id)
      if (!initial.id) onSaved(id)
    } catch (e) {
      toast(errorMessage(e), true)
    } finally {
      setBusy(false)
    }
  }

  const primary = canValidate
    ? { label: status === 'SUBMITTED' ? 'Valider et publier' : status === 'PUBLISHED' ? 'Mettre à jour' : 'Publier', icon: PaperPlaneTilt, what: 'publish' as const }
    : { label: 'Soumettre au pasteur', icon: ArrowBendUpRight, what: 'submit' as const }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card-head" style={{ alignItems: 'center' }}>
        <h2>{d.id ? 'Publication' : 'Nouvelle publication'}</h2>
        <Pill label={pub?.statusLabel ?? 'Brouillon'} />
      </div>
      {pub?.status === 'RETURNED' && pub.returnNote ? (
        <div className="alert warn">
          <WarningCircle size={18} />
          <div>
            <strong>À revoir :</strong> {pub.returnNote}
          </div>
        </div>
      ) : null}
      {pub && pub.author.id && pub.status !== 'DRAFT' ? (
        <span className="muted" style={{ fontSize: 12, marginTop: -6 }}>
          Rédigée par {pub.author.fullName}
          {pub.validatedBy ? ` · validée par ${pub.validatedBy}` : ''}
        </span>
      ) : null}
      <fieldset disabled={!editable || busy} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <Field label="Titre">
          <input className="input" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex. Culte d'union du 18 octobre" maxLength={200} />
        </Field>
        <div className="field">
          <span>Type</span>
          <Chips options={KINDS} value={d.kind} onChange={(v) => set('kind', v)} label="Type" />
        </div>
        {nodes.length > 1 ? (
          <div className="field">
            <span>Diffusée à</span>
            <StructureSelect value={d.targetStructureId} onChange={(v) => setD((x) => ({ ...x, targetStructureId: v, groupId: null }))} label="Structure ciblée" />
          </div>
        ) : null}
        <div className="field">
          <span>Audience</span>
          <Chips
            label="Audience"
            options={[{ value: '', label: 'Tous les fidèles' }, ...(aud.data?.groups ?? []).map((g) => ({ value: g.id, label: g.name }))]}
            value={d.groupId ?? ''}
            onChange={(v) => set('groupId', v || null)}
          />
        </div>
        <Field label="Texte">
          <textarea className="textarea" rows={6} value={d.body} onChange={(e) => set('body', e.target.value)} placeholder="Rédigez votre annonce…" />
        </Field>
        <ToggleRow title="Notifier les fidèles" sub={`Notification push à la publication · ${fmtInt(recipients)} destinataire${recipients > 1 ? 's' : ''}`} on={d.notify} onChange={(v) => set('notify', v)} />
        <ToggleRow title="Visible sur le portail public" sub="Sinon, réservée aux fidèles connectés" on={d.isPublic} onChange={(v) => set('isPublic', v)} />
      </fieldset>

      {returning ? (
        <div className="soft-box on-soft">
          <Field label="Ce qui doit être revu">
            <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </Field>
          <div className="row">
            <button type="button" className="btn" disabled={note.trim().length < 3 || busy} onClick={() => run('return')}>
              Renvoyer
            </button>
            <button type="button" className="btn-ghost" onClick={() => setReturning(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {editable ? (
        <div className="row">
          <button type="button" className="btn" disabled={busy || !valid} onClick={() => run(primary.what)}>
            <primary.icon size={16} weight="bold" />
            {primary.label}
          </button>
          {status !== 'PUBLISHED' ? (
            <button type="button" className="btn-ghost" disabled={busy || !valid} onClick={() => run('draft')}>
              Enregistrer le brouillon
            </button>
          ) : null}
          {pub?.can.return && !returning ? (
            <button type="button" className="btn-ghost btn-danger" disabled={busy} onClick={() => setReturning(true)}>
              Renvoyer à l’auteur
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted" style={{ fontSize: 12, lineHeight: 1.5, flex: 1 }}>
          {!editable
            ? status === 'PUBLISHED'
              ? 'Publication en ligne : seul un responsable qui valide peut la modifier.'
              : 'Lecture seule.'
            : canValidate
              ? 'Vous pouvez publier directement. Les publications rédigées par la communication arrivent ici avec le statut « À valider ».'
              : "Votre publication sera vérifiée par le pasteur avant d'être diffusée aux fidèles."}
        </span>
        {pub?.can.archive ? (
          <button type="button" className="link-danger" disabled={busy} onClick={() => run('archive')}>
            Archiver
          </button>
        ) : pub && (pub.status === 'DRAFT' || pub.status === 'RETURNED') && editable ? (
          <button type="button" className="link-danger" disabled={busy} onClick={() => run('delete')}>
            Supprimer
          </button>
        ) : null}
      </div>
      {seat.structure.id !== d.targetStructureId && aud.data ? <span className="foot-note">Diffusion : {aud.data.structure.name} et ses sous-structures.</span> : null}
    </div>
  )
}
