'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Buildings, Check, Megaphone, Plus, SealCheck } from '@phosphor-icons/react'
import { fmtMillions, fmtPct } from '@cepca/shared'
import { api } from '@/lib/api'
import { useAct } from '@/lib/hooks'
import { useSeatSubtree, useSession } from '@/lib/session'
import type { Page, ProjectDto } from '@/lib/types'
import { dayShort, parseAmount } from '@/lib/format'
import { ErrorBox, Field, Loading, PageHead, Pill, ToggleRow } from '@/components/ui'
import { StructureSelect } from '@/components/structure-select'

const endOf = (p: ProjectDto) => p.endLabel ?? (p.endsAt ? new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric', timeZone: 'Africa/Douala' }).format(new Date(p.endsAt)) : 'À définir')

export default function ProjectsPage() {
  return (
    <Suspense>
      <Projects />
    </Suspense>
  )
}

function Projects() {
  const params = useSearchParams()
  const { seat, can } = useSession()
  const [selId, setSelId] = useState<string | null>(params.get('id'))
  const [creating, setCreating] = useState(params.get('nouveau') === '1')
  const list = useInfiniteQuery({
    queryKey: ['projects', seat.structure.id],
    queryFn: ({ pageParam }) => api.get<Page<ProjectDto>>('/admin/projects', { structureId: seat.structure.id, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const current = selId ?? (creating ? null : rows[0]?.id ?? null)

  return (
    <>
      <PageHead eyebrow={`${seat.roleLabel} · ${seat.structure.level}`} title="Projets" note="Suivez la mobilisation, les étapes et les nouvelles de chaque projet.">
        {can('PROJECTS', 'write') ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setCreating(true)
              setSelId(null)
            }}
          >
            <Plus size={16} weight="bold" />
            Nouveau projet
          </button>
        ) : null}
      </PageHead>

      <div className="split">
        <section className="card main" style={{ flexBasis: 440, gap: 10 }}>
          <h2 style={{ marginBottom: 6 }}>Projets et campagnes</h2>
          {list.isError ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : null}
          {list.isPending ? <Loading rows={3} /> : null}
          {!list.isPending && rows.length === 0 ? (
            <div className="empty">
              <Buildings size={40} />
              Aucun projet dans votre périmètre.
            </div>
          ) : null}
          {rows.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={x.id === current}
              onClick={() => {
                setSelId(x.id)
                setCreating(false)
              }}
              style={{
                padding: '14px 16px',
                borderRadius: 16,
                background: x.id === current ? 'var(--c-primary-soft)' : 'var(--c-surface)',
                boxShadow: 'inset 0 0 0 1px var(--c-border-card)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div className="row" style={{ justifyContent: 'space-between', width: '100%', flexWrap: 'nowrap' }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{x.title}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-primary)' }}>{x.goalAmount ? fmtPct(x.progressPct) : x.statusLabel}</span>
              </div>
              <div className="progress thin" style={{ width: '100%' }}>
                <div style={{ width: `${x.progressPct}%` }} />
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                {fmtMillions(x.raisedAmount)}
                {x.goalAmount ? ` / ${fmtMillions(x.goalAmount)}` : ''} FCFA · {x.responsible?.fullName ?? '—'} · {x.collectOpen ? 'Collecte ouverte' : 'Collecte fermée'}
              </span>
            </button>
          ))}
          {list.hasNextPage ? (
            <button type="button" className="btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
              Afficher plus
            </button>
          ) : null}
        </section>

        <section className="card side" style={{ flexBasis: 420 }}>
          {creating ? (
            <NewProject
              onClose={() => setCreating(false)}
              onCreated={(id) => {
                setCreating(false)
                setSelId(id)
              }}
            />
          ) : current ? (
            <ProjectSheet key={current} id={current} />
          ) : (
            <div className="empty">
              <Buildings size={40} />
              Sélectionnez un projet.
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function ProjectSheet({ id }: { id: string }) {
  const p = useQuery({ queryKey: ['project', id], queryFn: () => api.get<ProjectDto>(`/admin/projects/${id}`) })
  const inv = [['projects'], ['project', id], ['dashboard']]
  const [title, setTitle] = useState<string | null>(null)
  const [update, setUpdate] = useState('')
  const [step, setStep] = useState('')
  const patch = useAct((body: Record<string, unknown>) => api.patch<ProjectDto>(`/admin/projects/${id}`, body), {
    ok: (_, b) => ('collectOpen' in b ? (b.collectOpen ? 'Collecte ouverte' : 'Collecte fermée') : 'Projet enregistré'),
    invalidate: inv,
    onDone: () => setTitle(null),
  })
  const validate = useAct(() => api.post(`/admin/projects/${id}/validate`), { ok: 'Projet validé', invalidate: inv })
  const steps = useAct((s: Array<{ label: string; done: boolean }>) => api.put(`/admin/projects/${id}/steps`, { steps: s }), { invalidate: inv, onDone: () => setStep('') })
  const post = useAct(
    (text: string) => api.post<ProjectDto>(`/admin/projects/${id}/updates`, text.length <= 160 ? { title: text } : { title: `${text.slice(0, 157).trimEnd()}…`, body: text }),
    { ok: (r) => `Mise à jour publiée${r.notified ? ` · ${r.notified} contributeur(s) prévenu(s)` : ''}`, invalidate: inv, onDone: () => setUpdate('') },
  )

  if (p.isPending) return <Loading rows={6} />
  if (p.isError) return <ErrorBox error={p.error} onRetry={() => p.refetch()} />
  const d = p.data
  const t = title ?? d.title
  const edit = d.can.edit

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
          {d.code} · {d.structure.name}
        </span>
        <Pill label={d.statusLabel} />
      </div>
      <Field label="Nom du projet">
        <input className="input" value={t} disabled={!edit} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== null && title.trim().length >= 3 && title.trim() !== d.title && patch.mutate({ title: title.trim() })} maxLength={160} />
      </Field>
      <div className="facts three">
        <div className="fact">
          <div className="k">Objectif</div>
          <div className="v">{d.goalAmount ? `${fmtMillions(d.goalAmount)} FCFA` : '—'}</div>
        </div>
        <div className="fact">
          <div className="k">Mobilisé</div>
          <div className="v">{fmtMillions(d.raisedAmount)} FCFA</div>
        </div>
        <div className="fact">
          <div className="k">Échéance</div>
          <div className="v">{endOf(d)}</div>
        </div>
      </div>
      {!d.validated ? (
        <div className="alert warn">
          <SealCheck size={18} />
          <div style={{ flex: 1 }}>Projet proposé : il doit être validé avant d’ouvrir la collecte aux fidèles.</div>
          {d.can.validate ? (
            <button type="button" className="btn btn-xs" disabled={validate.isPending} onClick={() => validate.mutate()}>
              Valider
            </button>
          ) : null}
        </div>
      ) : (
        <ToggleRow
          title="Collecte ouverte"
          sub={d.can.validate ? 'Le projet apparaît dans « Contribuer » de l’application' : 'Décidée par un responsable qui valide les projets'}
          on={d.collectOpen}
          disabled={!d.can.validate || patch.isPending}
          onChange={(v) => patch.mutate({ collectOpen: v })}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="h3">Étapes</span>
        {d.steps.map((s, i) => (
          <button
            key={i}
            type="button"
            className="line"
            style={{ padding: '10px 0', gap: 12, textAlign: 'left', boxShadow: '0 1px 0 var(--c-border-soft)' }}
            disabled={!edit || steps.isPending}
            aria-pressed={s.done}
            onClick={() => steps.mutate(d.steps.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
          >
            <span className="mx-cell" data-on={s.done} aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 7 }}>
              {s.done ? <Check size={13} weight="bold" /> : null}
            </span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: s.done ? 700 : 500 }}>{s.label}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {s.done ? 'Terminé' : 'À faire'}
            </span>
          </button>
        ))}
        {edit ? (
          <form
            className="row"
            style={{ marginTop: 8, flexWrap: 'nowrap' }}
            onSubmit={(e) => {
              e.preventDefault()
              if (step.trim().length >= 2) steps.mutate([...d.steps, { label: step.trim(), done: false }])
            }}
          >
            <input className="input" value={step} onChange={(e) => setStep(e.target.value)} placeholder="Nouvelle étape" maxLength={120} aria-label="Nouvelle étape" />
            <button type="submit" className="btn-ghost" disabled={step.trim().length < 2 || steps.isPending}>
              Ajouter
            </button>
          </form>
        ) : null}
      </div>

      {edit ? (
        <>
          <Field label="Publier une mise à jour">
            <textarea className="textarea" rows={2} value={update} onChange={(e) => setUpdate(e.target.value)} placeholder="Ex. La toiture est posée, merci à tous les donateurs !" maxLength={5000} />
          </Field>
          <button type="button" className="btn" disabled={update.trim().length < 3 || post.isPending} onClick={() => post.mutate(update.trim())}>
            <Megaphone size={16} weight="bold" />
            Publier pour les contributeurs
          </button>
        </>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {d.updates.map((u) => (
          <div key={u.id} style={{ display: 'flex', gap: 12, padding: '8px 0', fontSize: 13, boxShadow: '0 1px 0 var(--c-border-soft)' }}>
            <span className="muted" style={{ width: 62, flex: 'none', fontWeight: 700 }}>
              {dayShort(u.date)}
            </span>
            <span>{u.title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function NewProject({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { seat } = useSession()
  const { nodes } = useSeatSubtree()
  const [f, setF] = useState({ title: '', description: '', goal: '', endLabel: '', location: '', steps: 'Cadrage', structureId: seat.structure.id, kind: 'PROJECT' as 'PROJECT' | 'SOCIAL' })
  const goal = parseAmount(f.goal)
  const create = useAct(
    () =>
      api.post<ProjectDto>('/admin/projects', {
        structureId: f.structureId,
        kind: f.kind,
        title: f.title.trim(),
        description: f.description.trim(),
        goalAmount: goal || null,
        budget: goal || null,
        endLabel: f.endLabel.trim() || null,
        location: f.location.trim() || null,
        steps: f.steps
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length >= 2)
          .slice(0, 20),
      }),
    { ok: 'Projet proposé · à valider avant d’ouvrir la collecte', invalidate: [['projects'], ['dashboard']], onDone: (r) => onCreated(r.id) },
  )
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const valid = f.title.trim().length >= 3 && f.description.trim().length >= 10
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) create.mutate()
      }}
    >
      <h2>Nouveau projet</h2>
      <Field label="Nom du projet">
        <input className="input" value={f.title} onChange={set('title')} placeholder="Ex. Forage de Bonamoussadi" maxLength={160} autoFocus />
      </Field>
      <Field label="Description" hint="10 caractères au moins : ce que le projet réalise et pour qui.">
        <textarea className="textarea" rows={3} value={f.description} onChange={set('description')} maxLength={10000} />
      </Field>
      <div className="cols-2">
        <Field label="Objectif (FCFA)">
          <input className="input" inputMode="numeric" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value.replace(/[^\d\s]/g, '') })} placeholder="Ex. 6 000 000" />
        </Field>
        <Field label="Échéance">
          <input className="input" value={f.endLabel} onChange={set('endLabel')} placeholder="Ex. Juin 2027" maxLength={60} />
        </Field>
      </div>
      <div className="cols-2">
        <Field label="Lieu">
          <input className="input" value={f.location} onChange={set('location')} maxLength={160} />
        </Field>
        <Field label="Nature">
          <select className="select" value={f.kind} onChange={set('kind')}>
            <option value="PROJECT">Projet</option>
            <option value="SOCIAL">Action sociale</option>
          </select>
        </Field>
      </div>
      {nodes.length > 1 ? (
        <div className="field">
          <span>Structure</span>
          <StructureSelect value={f.structureId} onChange={(v) => setF({ ...f, structureId: v })} />
        </div>
      ) : null}
      <Field label="Étapes" hint="Une par ligne.">
        <textarea className="textarea" rows={3} value={f.steps} onChange={set('steps')} />
      </Field>
      <div className="row">
        <button type="submit" className="btn" disabled={!valid || create.isPending}>
          Proposer le projet
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
      </div>
      <span className="foot-note">Le projet naît « Proposé », collecte fermée : un responsable qui valide les projets l’examine avant l’appel aux dons.</span>
    </form>
  )
}
