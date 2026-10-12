'use client'

import { Suspense, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, FilmStrip, Headphones, MicrophoneStage, PaperPlaneTilt, Plus, VideoCamera, Waveform } from '@phosphor-icons/react'
import { fmtInt } from '@cepca/shared'
import { api, errorMessage, uploadWithProgress } from '@/lib/api'
import { useSeatSubtree, useSession } from '@/lib/session'
import type { Page, SermonDto } from '@/lib/types'
import { dayShort, displayName, duration } from '@/lib/format'
import { Chips, ErrorBox, Field, Loading, PageHead, Pill, ToggleRow, useToast } from '@/components/ui'
import { StructureSelect } from '@/components/structure-select'

const STATUS: Record<SermonDto['status'], string> = { DRAFT: 'Brouillon', SUBMITTED: 'À valider', PUBLISHED: 'Publié', ARCHIVED: 'Archivé' }
type Media = 'AUDIO' | 'VIDEO'

interface Draft {
  id: string | null
  title: string
  speaker: string
  scriptureRef: string
  date: string
  mediaType: Media
  externalUrl: string
  offlineAllowed: boolean
  structureId: string
}

const fromDto = (s: SermonDto): Draft => ({
  id: s.id,
  title: s.title,
  speaker: s.speaker ?? '',
  scriptureRef: s.scriptureRef ?? '',
  date: s.recordedAt ? s.recordedAt.slice(0, 10) : '',
  mediaType: s.mediaType === 'VIDEO' ? 'VIDEO' : 'AUDIO',
  externalUrl: s.externalUrl ?? '',
  offlineAllowed: s.offlineAllowed,
  structureId: s.structure.id,
})

/** Durée lue dans le fichier choisi, avant l'envoi. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith('video') ? 'video' : 'audio')
    const url = URL.createObjectURL(file)
    const done = (v: number | null) => {
      URL.revokeObjectURL(url)
      resolve(v)
    }
    el.preload = 'metadata'
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration) : null)
    el.onerror = () => done(null)
    el.src = url
  })
}

export default function SermonsPage() {
  return (
    <Suspense>
      <Sermons />
    </Suspense>
  )
}

function Sermons() {
  const params = useSearchParams()
  const { me, seat, can } = useSession()
  const [selId, setSelId] = useState<string | null>(params.get('id'))
  const [creating, setCreating] = useState(params.get('nouveau') === '1')
  const list = useInfiniteQuery({
    queryKey: ['sermons', seat.structure.id],
    queryFn: ({ pageParam }) => api.get<Page<SermonDto>>('/admin/sermons', { structureId: seat.structure.id, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const sel = rows.find((r) => r.id === selId)

  return (
    <>
      <PageHead eyebrow={`${seat.roleLabel} · ${seat.structure.level}`} title="Prédications" note="Mettez en ligne les prédications audio et vidéo des cultes.">
        {can('SERMONS', 'write') ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setCreating(true)
              setSelId(null)
            }}
          >
            <Plus size={16} weight="bold" />
            Nouvelle prédication
          </button>
        ) : null}
      </PageHead>

      <div className="split">
        <section className="card tight main" style={{ flexBasis: 500 }}>
          <h2 style={{ marginBottom: 8 }}>Prédications</h2>
          {list.isError ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : null}
          {list.isPending ? <Loading rows={4} /> : null}
          {!list.isPending && rows.length === 0 ? (
            <div className="empty">
              <MicrophoneStage size={40} />
              Aucune prédication en ligne pour le moment.
            </div>
          ) : null}
          {rows.map((x) => {
            const Icon = x.mediaType === 'VIDEO' ? VideoCamera : Headphones
            return (
              <button
                key={x.id}
                type="button"
                className="pick"
                aria-pressed={x.id === selId && !creating}
                onClick={() => {
                  setSelId(x.id)
                  setCreating(false)
                }}
              >
                <span className="tile lg">
                  <Icon size={20} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{x.title}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {x.speaker ?? '—'} · {x.scriptureRef ?? '—'} · {x.recordedAt ? dayShort(x.recordedAt) : dayShort(x.publishedAt ?? new Date().toISOString())}
                  </div>
                </div>
                <div className="right muted" style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: 'var(--c-text)' }}>{x.playCount ? fmtInt(x.playCount) : '—'}</div>
                  écoutes
                </div>
                <Pill label={STATUS[x.status]} />
              </button>
            )
          })}
          {list.hasNextPage ? (
            <button type="button" className="btn-ghost btn-sm" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
              Afficher plus
            </button>
          ) : null}
        </section>

        <section className="card side">
          {creating ? (
            <Sheet
              key="new"
              initial={{ id: null, title: '', speaker: displayName(me.fullName, seat.title), scriptureRef: '', date: new Date().toISOString().slice(0, 10), mediaType: 'AUDIO', externalUrl: '', offlineAllowed: true, structureId: seat.structure.id }}
              onSaved={(id) => {
                setCreating(false)
                setSelId(id)
              }}
            />
          ) : sel ? (
            <Sheet key={`${sel.id}-${sel.status}-${sel.hasMedia}`} initial={fromDto(sel)} sermon={sel} onSaved={() => undefined} />
          ) : (
            <div className="empty">
              <MicrophoneStage size={40} />
              {list.isPending ? 'Chargement…' : 'Sélectionnez une prédication ou créez-en une nouvelle.'}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function Sheet({ initial, sermon, onSaved }: { initial: Draft; sermon?: SermonDto; onSaved: (id: string) => void }) {
  const { nodes } = useSeatSubtree()
  const qc = useQueryClient()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [d, setD] = useState<Draft>(initial)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [uploaded, setUploaded] = useState<{ name: string; durationSec: number | null } | null>(null)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const status = sermon?.status ?? 'DRAFT'
  const hasMedia = !!uploaded || !!sermon?.hasMedia
  const dur = uploaded?.durationSec ?? sermon?.durationSec ?? null
  const urlOk = !d.externalUrl || /^https:\/\//.test(d.externalUrl)
  const valid = d.title.trim().length >= 3 && urlOk
  const canPublish = valid && (hasMedia || !!d.externalUrl)

  const body = () => ({
    title: d.title.trim(),
    speaker: d.speaker.trim() || null,
    scriptureRef: d.scriptureRef.trim() || null,
    recordedAt: d.date ? new Date(`${d.date}T10:00:00+01:00`).toISOString() : null,
    mediaType: d.mediaType,
    externalUrl: d.externalUrl.trim() || null,
    offlineAllowed: d.offlineAllowed,
  })

  const persist = async (): Promise<string> => {
    if (d.id) {
      await api.patch(`/admin/sermons/${d.id}`, body())
      return d.id
    }
    const created = await api.post<SermonDto>('/admin/sermons', { ...body(), structureId: d.structureId, kind: 'PREDICATION' })
    setD((x) => ({ ...x, id: created.id }))
    return created.id
  }

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['sermons'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })])

  const run = async (what: 'draft' | 'publish' | 'archive') => {
    setBusy(true)
    try {
      if (what === 'archive') {
        if (!window.confirm('Retirer cette prédication de l’application ?')) return
        await api.post(`/admin/sermons/${d.id}/archive`)
        toast('Prédication archivée')
      } else {
        const id = await persist()
        if (what === 'publish' && status !== 'PUBLISHED') {
          await api.post(`/admin/sermons/${id}/publish`)
          toast('Prédication publiée')
        } else toast(status === 'PUBLISHED' ? 'Prédication mise à jour' : 'Brouillon enregistré')
        if (!initial.id) onSaved(id)
      }
      await refresh()
    } catch (e) {
      toast(errorMessage(e), true)
    } finally {
      setBusy(false)
    }
  }

  const upload = async (file: File) => {
    if (d.title.trim().length < 3) return toast('Ajoutez un titre avant de déposer le fichier', true)
    setBusy(true)
    try {
      const durationSec = await readDuration(file)
      const id = await persist()
      const form = new FormData()
      form.append('file', file)
      setProgress(0)
      await uploadWithProgress(`/admin/sermons/${id}/media`, form, setProgress)
      if (durationSec) await api.patch(`/admin/sermons/${id}`, { durationSec })
      setUploaded({ name: file.name, durationSec })
      toast('Fichier importé')
      await refresh()
      if (!initial.id) onSaved(id)
    } catch (e) {
      toast(errorMessage(e), true)
    } finally {
      setProgress(null)
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const FileIcon = hasMedia ? CheckCircle : d.mediaType === 'VIDEO' ? FilmStrip : Waveform
  const editable = status !== 'ARCHIVED'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card-head" style={{ alignItems: 'center' }}>
        <h2>Fiche</h2>
        <Pill label={STATUS[status]} />
      </div>
      <fieldset disabled={!editable || busy} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <Field label="Titre">
          <input className="input" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex. La lumière du monde" maxLength={200} />
        </Field>
        <div className="cols-2">
          <Field label="Prédicateur">
            <input className="input" value={d.speaker} onChange={(e) => set('speaker', e.target.value)} maxLength={120} />
          </Field>
          <Field label="Référence biblique">
            <input className="input" value={d.scriptureRef} onChange={(e) => set('scriptureRef', e.target.value)} placeholder="Ex. Jean 8, 12" maxLength={80} />
          </Field>
        </div>
        <div className="cols-2" style={{ alignItems: 'end' }}>
          <Field label="Date du culte">
            <input className="input" type="date" value={d.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <div className="field">
            <span>Format</span>
            <Chips
              label="Format"
              options={[
                { value: 'AUDIO', label: 'Audio' },
                { value: 'VIDEO', label: 'Vidéo' },
              ]}
              value={d.mediaType}
              onChange={(v) => set('mediaType', v as Media)}
            />
          </div>
        </div>
        {!d.id && nodes.length > 1 ? (
          <div className="field">
            <span>Structure</span>
            <StructureSelect value={d.structureId} onChange={(v) => set('structureId', v)} />
          </div>
        ) : null}
        <div className="file-box" data-ok={hasMedia}>
          <FileIcon size={26} weight={hasMedia ? 'fill' : 'regular'} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ellipsis" style={{ fontSize: 14, fontWeight: 600 }}>
              {progress !== null ? `Envoi… ${Math.round(progress * 100)} %` : uploaded?.name ?? (hasMedia ? 'Fichier déposé' : 'Aucun fichier')}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {hasMedia ? `${d.mediaType === 'VIDEO' ? 'Vidéo' : 'Audio'} · ${duration(dur)}` : d.mediaType === 'VIDEO' ? 'MP4, 300 Mo max.' : 'MP3 ou M4A, 300 Mo max.'}
            </div>
            {progress !== null ? (
              <div className="progress thin" style={{ marginTop: 6 }}>
                <div style={{ width: `${progress * 100}%` }} />
              </div>
            ) : null}
          </div>
          <input ref={fileRef} type="file" hidden accept={d.mediaType === 'VIDEO' ? 'video/mp4,.mp4' : 'audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a'} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
            {hasMedia ? 'Remplacer' : 'Importer'}
          </button>
        </div>
        {hasMedia && d.id ? (
          <a href={`/api/admin/sermons/${d.id}/media`} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, marginTop: -6 }}>
            {d.mediaType === 'VIDEO' ? 'Regarder' : 'Écouter'} le fichier déposé
          </a>
        ) : null}
        <Field label="Ou lien externe (facultatif)" error={urlOk ? undefined : 'Adresse https:// attendue'} hint="YouTube, Facebook… si la vidéo est hébergée ailleurs.">
          <input className="input" type="url" value={d.externalUrl} onChange={(e) => set('externalUrl', e.target.value)} placeholder="https://" />
        </Field>
        <ToggleRow title="Écoute hors ligne" sub="Les fidèles peuvent télécharger le fichier" on={d.offlineAllowed} onChange={(v) => set('offlineAllowed', v)} />
      </fieldset>
      {editable ? (
        <div className="row">
          <button type="button" className="btn" disabled={busy || !canPublish} onClick={() => run('publish')} title={canPublish ? undefined : 'Ajoutez un titre et le fichier'}>
            <PaperPlaneTilt size={16} weight="bold" />
            {status === 'PUBLISHED' ? 'Mettre à jour' : 'Publier'}
          </button>
          {status !== 'PUBLISHED' ? (
            <button type="button" className="btn-ghost" disabled={busy || !valid} onClick={() => run('draft')}>
              Enregistrer le brouillon
            </button>
          ) : (
            <button type="button" className="btn-ghost btn-danger" disabled={busy} onClick={() => run('archive')}>
              Archiver
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
