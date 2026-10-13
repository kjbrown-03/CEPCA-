'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CaretDown, CaretRight, CaretRight as Chevron, DotOutline, FileArrowUp, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { fmtInt, type StructureNodeDto } from '@cepca/shared'
import { api } from '@/lib/api'
import { useAct } from '@/lib/hooks'
import { useSeatSubtree, useSession } from '@/lib/session'
import type { StructureDetail } from '@/lib/types'
import { ErrorBox, Field, Loading, PageHead, Pill, Skeleton } from '@/components/ui'
import { depthIcon } from '../../nav'
import { ImportStructuresPanel } from './import-panel'

const STATUS: Record<string, string> = { ACTIVE: 'Actif', CONFIGURATION: 'Configuration', VACANT: 'À pourvoir', SUSPENDED: 'Suspendu' }
const PH: Record<string, string> = { Chapelle: 'Ex. Chapelle de Makepe', Paroisse: 'Ex. Paroisse de Logbaba', Consistoire: 'Ex. Consistoire de Douala-Est', Synode: 'Ex. Synode du Nord' }

export default function StructuresPage() {
  return (
    <Suspense>
      <Structures />
    </Suspense>
  )
}

function Structures() {
  const params = useSearchParams()
  const { seat, can } = useSession()
  const { nodes, isPending, isError, error, refetch } = useSeatSubtree()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [selId, setSelId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [panel, setPanel] = useState<'none' | 'add' | 'edit' | 'confession'>(params.get('nouveau') === 'confession' ? 'confession' : params.get('ajout') ? 'add' : 'none')

  // Ouverture initiale : la racine du mandat et le niveau suivant
  useEffect(() => {
    if (nodes.length && open.size === 0) setOpen(new Set(nodes.filter((n) => n.rel <= 1).map((n) => n.id)))
  }, [nodes, open.size])

  const kids = useMemo(() => {
    const m = new Map<string, typeof nodes>()
    for (const n of nodes) if (n.parentId) m.set(n.parentId, [...(m.get(n.parentId) ?? []), n])
    return m
  }, [nodes])

  const root = nodes[0]
  const sel = nodes.find((n) => n.id === selId) ?? root
  const visible = useMemo(() => {
    const out: typeof nodes = []
    const walk = (n: (typeof nodes)[number]) => {
      out.push(n)
      if (open.has(n.id)) for (const c of kids.get(n.id) ?? []) walk(c)
    }
    if (root) walk(root)
    return out
  }, [root, kids, open])

  const atRoot = sel?.depth === 0
  const canAdd = !!sel && can('STRUCTURES', 'write') && !!sel.childLevel
  const canConfession = atRoot && can('STRUCTURES', 'validate')
  const canImport = can('STRUCTURES', 'write')
  const select = (id: string) => {
    setSelId(id)
    setPanel('none')
  }

  return (
    <>
      <PageHead eyebrow={`${seat.roleLabel} · ${seat.structure.level}`} title="Structures" note="Créez et organisez les structures de votre périmètre. Chaque niveau hérite de son parent.">
        {canImport ? (
          <button type="button" className="btn-ghost" onClick={() => setImporting((on) => !on)}>
            <FileArrowUp size={16} />
            Importer des structures
          </button>
        ) : null}
        {canConfession ? (
          <button type="button" className="btn" onClick={() => setPanel('confession')}>
            <Plus size={16} weight="bold" />
            Nouvelle confession
          </button>
        ) : canAdd ? (
          <button type="button" className="btn" onClick={() => setPanel('add')}>
            <Plus size={16} weight="bold" />
            Nouvelle structure
          </button>
        ) : null}
      </PageHead>

      {importing && canImport ? <ImportStructuresPanel onClose={() => setImporting(false)} /> : null}
      {isError ? <ErrorBox error={error} onRetry={() => refetch()} /> : null}
      <div className="split">
        <section className="card tight main" style={{ gap: 2 }}>
          <div className="card-head" style={{ marginBottom: 12 }}>
            <h2>Arborescence</h2>
            <span className="meta">{fmtInt(nodes.length)} structure{nodes.length > 1 ? 's' : ''} dans mon périmètre</span>
          </div>
          {isPending ? <Loading rows={6} /> : null}
          {visible.map((n) => {
            const has = (kids.get(n.id)?.length ?? 0) > 0
            const Icon = depthIcon(n.depth)
            return (
              <div key={n.id} className="tree-row" data-on={n.id === sel?.id} style={{ paddingLeft: n.rel * 22 }}>
                <button
                  type="button"
                  className="caret"
                  disabled={!has}
                  aria-label={has ? (open.has(n.id) ? `Replier ${n.name}` : `Déplier ${n.name}`) : undefined}
                  aria-expanded={has ? open.has(n.id) : undefined}
                  onClick={() =>
                    setOpen((o) => {
                      const x = new Set(o)
                      if (x.has(n.id)) x.delete(n.id)
                      else x.add(n.id)
                      return x
                    })
                  }
                >
                  {has ? open.has(n.id) ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" /> : <DotOutline size={16} />}
                </button>
                <button type="button" className="sel" onClick={() => select(n.id)} aria-pressed={n.id === sel?.id}>
                  <Icon size={18} />
                  <span className="nm" style={{ fontWeight: n.id === sel?.id ? 700 : 500 }}>
                    {n.name}
                  </span>
                  <span className="ty">{n.level}</span>
                </button>
              </div>
            )
          })}
        </section>

        <section className="card side" style={{ gap: 16 }}>
          {sel ? (
            <Detail
              node={sel}
              kids={kids.get(sel.id) ?? []}
              panel={panel}
              setPanel={setPanel}
              canAdd={canAdd}
              canConfession={canConfession}
              onSelect={(id) => {
                setOpen((o) => new Set(o).add(sel.id))
                select(id)
              }}
              onCreated={(id) => {
                setOpen((o) => new Set(o).add(sel.id))
                setSelId(id)
              }}
            />
          ) : (
            <Skeleton h={240} />
          )}
        </section>
      </div>
    </>
  )
}

function Detail(props: {
  node: StructureNodeDto
  kids: StructureNodeDto[]
  panel: 'none' | 'add' | 'edit' | 'confession'
  setPanel: (p: 'none' | 'add' | 'edit' | 'confession') => void
  canAdd: boolean
  canConfession: boolean
  onSelect: (id: string) => void
  onCreated: (id: string) => void
}) {
  const { node, kids: children, panel, setPanel, canAdd, canConfession } = props
  const Icon = depthIcon(node.depth)
  const d = useQuery({ queryKey: ['structure', node.id], queryFn: () => api.get<StructureDetail>(`/admin/structures/${node.id}`) })
  const leader = node.leader ?? d.data?.leaders[0]?.name ?? null

  return (
    <>
      <span className="pill tone-ok" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Icon size={14} />
        {node.level}
      </span>
      <h2 style={{ font: '400 32px/1.1 var(--font-serif), serif' }}>{node.name}</h2>
      <div className="facts">
        <Fact k="Responsable" v={leader ?? 'Poste vacant'} />
        <Fact k="Fidèles" v={fmtInt(node.members)} />
        <Fact k="Sous-structures" v={String(children.length)} />
        <Fact k="Statut" v={node.status === 'ACTIVE' && !leader && node.depth > 0 ? 'À pourvoir' : STATUS[node.status] ?? node.status} />
      </div>
      {d.data && (d.data.city || d.data.address || d.data.serviceSchedule || d.data.pendingMembers > 0) ? (
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          {[d.data.address, d.data.city].filter(Boolean).join(', ')}
          {d.data.serviceSchedule ? <div>Culte : {d.data.serviceSchedule}</div> : null}
          {d.data.pendingMembers > 0 ? <div>{d.data.pendingMembers} inscription(s) en attente de validation</div> : null}
        </div>
      ) : null}

      <div className="row">
        {canConfession ? (
          <button type="button" className="btn" onClick={() => setPanel('confession')}>
            <Plus size={16} weight="bold" />
            Ajouter : confession
          </button>
        ) : canAdd ? (
          <button type="button" className="btn" onClick={() => setPanel('add')}>
            <Plus size={16} weight="bold" />
            Ajouter : {node.childLevel}
          </button>
        ) : null}
        {d.data?.canEdit ? (
          <button type="button" className="btn-ghost" onClick={() => setPanel('edit')}>
            <PencilSimple size={16} />
            Modifier
          </button>
        ) : null}
      </div>
      {!node.childLevel && node.depth > 0 ? <span className="muted" style={{ fontSize: 13 }}>Une {node.level.toLowerCase()} est le dernier niveau : elle n’a pas de sous-structure.</span> : null}

      {panel === 'add' && canAdd && !canConfession ? <AddForm parent={node} onClose={() => setPanel('none')} onCreated={props.onCreated} /> : null}
      {panel === 'confession' && canConfession ? <ConfessionForm onClose={() => setPanel('none')} onCreated={props.onCreated} /> : null}
      {panel === 'edit' && d.data ? <EditForm s={d.data} onClose={() => setPanel('none')} /> : null}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="h3">Sous-structures</span>
        {children.map((k) => (
          <button key={k.id} type="button" className="line" style={{ padding: '11px 0', gap: 12, textAlign: 'left', boxShadow: '0 1px 0 var(--c-border-soft)' }} onClick={() => props.onSelect(k.id)}>
            <div className="grow">
              <div className="t">{k.name}</div>
              <div className="m">{k.leader ?? 'Poste vacant'}</div>
            </div>
            <Pill small label={k.status === 'ACTIVE' && !k.leader ? 'À pourvoir' : STATUS[k.status] ?? k.status} />
            <Chevron size={14} color="var(--c-text-muted)" />
          </button>
        ))}
        {children.length === 0 ? <span className="muted" style={{ fontSize: 13, padding: '8px 0' }}>Aucune sous-structure.</span> : null}
      </div>
    </>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="fact">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  )
}

function AddForm({ parent, onClose, onCreated }: { parent: StructureNodeDto; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const add = useAct((body: { parentId: string; name: string; city?: string }) => api.post<{ id: string; name: string; level: string }>('/admin/structures', body), {
    ok: (r) => `${r.level} créée : ${r.name}`,
    invalidate: [['structures'], ['dashboard']],
    onDone: (r) => {
      onClose()
      onCreated(r.id)
    },
  })
  const valid = name.trim().length >= 3
  return (
    <form
      className="soft-box on-soft"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) add.mutate({ parentId: parent.id, name: name.trim(), city: city.trim() || undefined })
      }}
    >
      <Field label={`Nom (${parent.childLevel})`}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={PH[parent.childLevel ?? ''] ?? 'Nom'} autoFocus />
      </Field>
      <Field label="Ville (facultatif)">
        <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex. Douala" />
      </Field>
      <div className="row">
        <button className="btn" type="submit" disabled={!valid || add.isPending}>
          Créer
        </button>
        <button className="btn-ghost" type="button" onClick={onClose}>
          Annuler
        </button>
      </div>
      <span style={{ fontSize: 12, color: 'var(--c-text-muted-2)', lineHeight: 1.5 }}>Elle sera créée avec le statut « Configuration ». Nommez ensuite son responsable dans Utilisateurs.</span>
    </form>
  )
}

function EditForm({ s, onClose }: { s: StructureDetail; onClose: () => void }) {
  const { can } = useSession()
  const [f, setF] = useState({ name: s.name, city: s.city ?? '', address: s.address ?? '', serviceSchedule: s.serviceSchedule ?? '', email: s.email ?? '', status: s.status })
  const save = useAct(
    () =>
      api.patch(`/admin/structures/${s.id}`, {
        name: f.name.trim(),
        city: f.city.trim() || null,
        address: f.address.trim() || null,
        serviceSchedule: f.serviceSchedule.trim() || null,
        email: f.email.trim() || null,
        ...(f.status !== s.status ? { status: f.status } : {}),
      }),
    { ok: 'Fiche enregistrée', invalidate: [['structures'], ['structure', s.id], ['dashboard']], onDone: onClose },
  )
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <form
      className="soft-box on-soft"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Field label="Nom">
        <input className="input" value={f.name} onChange={set('name')} />
      </Field>
      <div className="cols-2">
        <Field label="Ville">
          <input className="input" value={f.city} onChange={set('city')} />
        </Field>
        <Field label="Horaire du culte">
          <input className="input" value={f.serviceSchedule} onChange={set('serviceSchedule')} placeholder="Dimanche 10:00" />
        </Field>
      </div>
      <Field label="Adresse">
        <input className="input" value={f.address} onChange={set('address')} />
      </Field>
      <Field label="E-mail de contact">
        <input className="input" type="email" value={f.email} onChange={set('email')} />
      </Field>
      {can('STRUCTURES', 'validate') && s.parent ? (
        <Field label="Statut" hint="Seul un niveau supérieur change le statut d’une structure.">
          <select className="select" value={f.status} onChange={set('status')}>
            {Object.entries(STATUS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <div className="row">
        <button className="btn" type="submit" disabled={f.name.trim().length < 3 || save.isPending}>
          Enregistrer
        </button>
        <button className="btn-ghost" type="button" onClick={onClose}>
          Annuler
        </button>
      </div>
    </form>
  )
}

/** Hiérarchie propre à la confession (§7) : modèle EEC proposé, modifiable. */
const DEFAULT_LEVELS = [
  { name: 'Synode', isMembership: false },
  { name: 'Consistoire', isMembership: false },
  { name: 'Paroisse', isMembership: true },
  { name: 'Chapelle', isMembership: true },
]

const levelKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)

function ConfessionForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [levels, setLevels] = useState(DEFAULT_LEVELS)
  const create = useAct(
    () =>
      api.post<{ structureId: string; code: string }>('/admin/confessions', {
        code,
        name: name.trim(),
        levels: levels.filter((l) => l.name.trim()).map((l) => ({ key: levelKey(l.name), name: l.name.trim(), isMembership: l.isMembership })),
      }),
    {
      ok: (r) => `Confession créée : ${r.code}`,
      invalidate: [['structures'], ['dashboard']],
      onDone: (r) => {
        onClose()
        onCreated(r.structureId)
      },
    },
  )
  const keys = levels.filter((l) => l.name.trim()).map((l) => levelKey(l.name))
  const valid = /^[A-Z]{2,8}$/.test(code) && name.trim().length >= 3 && keys.length > 0 && keys.every((k) => k.length >= 2) && new Set(keys).size === keys.length && levels.some((l) => l.isMembership && l.name.trim())
  return (
    <form
      className="soft-box on-soft"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) create.mutate()
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 700 }}>Nouvelle confession membre</span>
      <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 10 }}>
        <Field label="Sigle">
          <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8))} placeholder="EPA" autoFocus />
        </Field>
        <Field label="Nom complet">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Église Protestante Africaine" />
        </Field>
      </div>
      <div className="field">
        <span>Niveaux, du plus haut au plus local</span>
        {levels.map((l, i) => (
          <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" value={l.name} aria-label={`Niveau ${i + 1}`} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <label className="row" style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', gap: 6 }}>
              <input type="checkbox" checked={l.isMembership} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? { ...x, isMembership: e.target.checked } : x)))} />
              Accueille des fidèles
            </label>
            <button type="button" className="icon-btn" aria-label={`Retirer le niveau ${l.name}`} disabled={levels.length <= 1} onClick={() => setLevels(levels.filter((_, j) => j !== i))}>
              <Trash size={15} />
            </button>
          </div>
        ))}
        {levels.length < 6 ? (
          <button type="button" className="row" style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-primary)' }} onClick={() => setLevels([...levels, { name: '', isMembership: true }])}>
            <Plus size={14} weight="bold" />
            Ajouter un niveau
          </button>
        ) : null}
      </div>
      <div className="row">
        <button className="btn" type="submit" disabled={!valid || create.isPending}>
          Créer la confession
        </button>
        <button className="btn-ghost" type="button" onClick={onClose}>
          Annuler
        </button>
      </div>
      <span style={{ fontSize: 12, color: 'var(--c-text-muted-2)', lineHeight: 1.5 }}>Elle naît « En configuration » avec les types de contribution habituels. Nommez ensuite son administrateur dans Utilisateurs.</span>
    </form>
  )
}
