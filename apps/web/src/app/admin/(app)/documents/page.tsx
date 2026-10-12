'use client'

import { useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { DownloadSimple, FilePdf, UploadSimple } from '@phosphor-icons/react'
import { DOC_CATEGORIES, fmtInt } from '@cepca/shared'
import { api, download, errorMessage } from '@/lib/api'
import { useAct } from '@/lib/hooks'
import { useSeatSubtree, useSession } from '@/lib/session'
import type { DocumentDto, Page } from '@/lib/types'
import { fileSize } from '@/lib/format'
import { Chips, ErrorBox, Field, Loading, PageHead, useToast } from '@/components/ui'
import { StructureSelect } from '@/components/structure-select'

type Vis = DocumentDto['visibility']
const VIS: Array<{ value: Vis; label: string; tone: string }> = [
  { value: 'PUBLIC', label: 'Public', tone: 'tone-ok' },
  { value: 'MEMBERS', label: 'Fidèles', tone: 'tone-warn' },
  { value: 'LEADERS', label: 'Responsables', tone: 'tone-neutral' },
]
const visOf = (v: Vis) => VIS.find((x) => x.value === v)!
const MAX = 25 * 1024 * 1024

export default function DocumentsPage() {
  const { seat, can } = useSession()
  const [cat, setCat] = useState<string>('ALL')
  const [form, setForm] = useState(false)
  const list = useInfiniteQuery({
    queryKey: ['documents', seat.structure.id, cat],
    queryFn: ({ pageParam }) => api.get<Page<DocumentDto>>('/admin/documents', { structureId: seat.structure.id, category: cat === 'ALL' ? undefined : cat, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const writable = can('DOCUMENTS', 'write')
  const inv = [['documents']]
  const cycle = useAct((d: DocumentDto) => api.patch(`/admin/documents/${d.id}`, { visibility: VIS[(VIS.findIndex((x) => x.value === d.visibility) + 1) % VIS.length].value }), {
    ok: (_, d) => `Visibilité : ${VIS[(VIS.findIndex((x) => x.value === d.visibility) + 1) % VIS.length].label}`,
    invalidate: inv,
  })
  const archive = useAct((d: DocumentDto) => api.post(`/admin/documents/${d.id}/archive`), { ok: 'Document retiré', invalidate: inv })
  const toast = useToast()
  const grid = '2.4fr 1.3fr 80px 120px 90px 150px'

  return (
    <>
      <PageHead eyebrow={`${seat.roleLabel} · ${seat.structure.level}`} title="Documents" note="Méditations, études bibliques, lettres et bulletins en PDF, avec la visibilité de chacun.">
        {writable ? (
          <button type="button" className="btn" onClick={() => setForm(true)}>
            <UploadSimple size={16} weight="bold" />
            Ajouter un document
          </button>
        ) : null}
      </PageHead>

      {form ? <UploadForm onClose={() => setForm(false)} /> : null}

      <section className="card">
        <Chips label="Catégorie" options={[{ value: 'ALL', label: 'Tous' }, ...DOC_CATEGORIES.map((c) => ({ value: c, label: c }))]} value={cat} onChange={setCat} />
        {list.isError ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : null}
        <div className="table-wrap">
          <div style={{ minWidth: 780 }}>
            <div className="tbl-head" style={{ gridTemplateColumns: grid, gap: 12 }}>
              <span>Document</span>
              <span>Catégorie</span>
              <span>Taille</span>
              <span>Visibilité</span>
              <span>Téléch.</span>
              <span />
            </div>
            {list.isPending ? <Loading rows={5} /> : null}
            {rows.map((x) => {
              const v = visOf(x.visibility)
              return (
                <div key={x.id} className="tbl-row" style={{ gridTemplateColumns: grid, gap: 12, padding: '11px 0' }}>
                  <span className="row strong" style={{ flexWrap: 'nowrap', gap: 10, minWidth: 0 }}>
                    <FilePdf size={20} color="var(--c-primary)" style={{ flex: 'none' }} />
                    <span className="ellipsis">
                      {x.title}
                      {x.version > 1 ? <span className="muted" style={{ fontWeight: 500 }}> · v{x.version}</span> : null}
                    </span>
                  </span>
                  <span style={{ color: 'var(--c-text-muted-2)' }}>{x.category}</span>
                  <span className="muted">{fileSize(x.sizeBytes)}</span>
                  <span>
                    {writable ? (
                      <button type="button" className={`pill ${v.tone}`} title="Changer la visibilité" disabled={cycle.isPending} onClick={() => cycle.mutate(x)}>
                        {v.label}
                      </button>
                    ) : (
                      <span className={`pill ${v.tone}`}>{v.label}</span>
                    )}
                  </span>
                  <span className="tabular">{x.downloads ? fmtInt(x.downloads) : '—'}</span>
                  <span className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
                    <button type="button" className="row" style={{ gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--c-primary)' }} onClick={() => download(`/admin/documents/${x.id}/file`).catch((e) => toast(errorMessage(e), true))}>
                      <DownloadSimple size={14} />
                      PDF
                    </button>
                    {writable ? (
                      <button
                        type="button"
                        className="link-danger"
                        disabled={archive.isPending}
                        onClick={() => {
                          if (window.confirm(`Retirer « ${x.title} » ? Il ne sera plus proposé au téléchargement.`)) archive.mutate(x)
                        }}
                      >
                        Retirer
                      </button>
                    ) : null}
                  </span>
                </div>
              )
            })}
            {!list.isPending && rows.length === 0 ? <div className="empty-line">Aucun document dans cette catégorie.</div> : null}
          </div>
        </div>
        {list.hasNextPage ? (
          <button type="button" className="btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            Afficher plus
          </button>
        ) : null}
        <span className="foot-note">{writable ? 'Cliquez sur la visibilité pour la changer : ' : 'Visibilité : '}Public (portail), Fidèles (application), Responsables (back-office).</span>
      </section>
    </>
  )
}

function UploadForm({ onClose }: { onClose: () => void }) {
  const { seat } = useSession()
  const { nodes } = useSeatSubtree()
  const ref = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>(DOC_CATEGORIES[0])
  const [visibility, setVisibility] = useState<Vis>('MEMBERS')
  const [structureId, setStructureId] = useState(seat.structure.id)
  const [file, setFile] = useState<File | null>(null)
  const tooBig = !!file && file.size > MAX
  const save = useAct(
    () => {
      const f = new FormData()
      f.append('structureId', structureId)
      f.append('title', title.trim())
      f.append('category', category)
      f.append('visibility', visibility)
      f.append('file', file!)
      return api.upload<DocumentDto>('/admin/documents', f)
    },
    { ok: 'Document mis en ligne', invalidate: [['documents']], onDone: onClose },
  )
  const valid = title.trim().length >= 3 && !!file && !tooBig
  return (
    <section className="card">
      <h2>Ajouter un document</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <Field label="Nom du document">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Méditations de novembre" maxLength={200} autoFocus />
        </Field>
        <Field label="Catégorie">
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        {nodes.length > 1 ? (
          <div className="field">
            <span>Structure</span>
            <StructureSelect value={structureId} onChange={setStructureId} />
          </div>
        ) : null}
      </div>
      <div className="field">
        <span>Visible par</span>
        <Chips label="Visible par" options={VIS} value={visibility} onChange={setVisibility} />
      </div>
      <div className="file-box" data-ok={!!file && !tooBig}>
        <FilePdf size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ellipsis" style={{ fontSize: 14, fontWeight: 600 }}>
            {file ? `${file.name} · ${fileSize(file.size)}` : 'Aucun fichier choisi'}
          </div>
          {tooBig ? <div className="field-error">25 Mo au plus.</div> : null}
        </div>
        <input ref={ref} type="file" hidden accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" className="btn-ghost btn-sm" onClick={() => ref.current?.click()}>
          Choisir un PDF
        </button>
      </div>
      <div className="row">
        <button type="button" className="btn" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Envoi…' : 'Mettre en ligne'}
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
      </div>
    </section>
  )
}
