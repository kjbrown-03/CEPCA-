'use client'

import { Suspense, use, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, X } from '@phosphor-icons/react'
import type { AdminSeat } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { SeatGate, can } from '../../../../_components/seat-gate'
import { Field } from '../../../../_components/form'
import { useToast } from '../../../../_components/toast'
import { BackHeader, Btn, Chip, ChipRow, Empty, ErrorState, FormError, Loading, Screen, Txt, color } from '../../../../_components/ui'

type ProjectRow = { id: string; title: string; status: string; structure: { id: string; name: string }; can: { edit: boolean } }

export default function StepReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <SeatGate id={id} title="Rapport d’étape" fallback={`/app/espace/${id}`}>
      {(seat) => (
        <Suspense>
          <StepReport seat={seat} />
        </Suspense>
      )}
    </SeatGate>
  )
}

/** Suivi du projet vu par les donateurs : un titre, un texte et, au choix, une photo du chantier prise sur place. */
function StepReport({ seat }: { seat: AdminSeat }) {
  const router = useRouter()
  const qc = useQueryClient()
  const toast = useToast()
  const photoFirst = useSearchParams().get('photo') === '1'
  const back = `/app/espace/${seat.assignmentId}`
  const projects = useQuery({
    queryKey: ['app', 'staff', 'projects-edit', seat.assignmentId],
    queryFn: async () => {
      const mine = await api.get<{ items: ProjectRow[] }>('/admin/projects', { mine: '1', structureId: seat.structure.id })
      const list = mine.items.length ? mine.items : (await api.get<{ items: ProjectRow[] }>('/admin/projects', { structureId: seat.structure.id })).items
      return list.filter((p) => p.can.edit && !['COMPLETED', 'CLOSED'].includes(p.status))
    },
    enabled: can(seat, 'PROJECTS', 'write'),
  })
  const [pick, setPick] = useState<string | null>(null)
  const [title, setTitle] = useState(photoFirst ? 'Photos du chantier' : '')
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!can(seat, 'PROJECTS', 'write'))
    return (
      <Screen>
        <BackHeader title="Rapport d’étape" fallback={back} />
        <Empty>Votre rôle ne permet pas de mettre à jour les projets.</Empty>
      </Screen>
    )

  const list = projects.data ?? []
  const project = list.find((p) => p.id === pick) ?? list[0]
  const valid = !!project && title.trim().length >= 3 && (!photoFirst || !!file)

  function choose(f: File | null) {
    if (preview) URL.revokeObjectURL(preview)
    setFile(f)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!valid || !project) return
    setBusy(true)
    setError(null)
    try {
      let imageKey: string | null = null
      if (file) {
        const form = new FormData()
        form.append('file', file)
        imageKey = (await api.upload<{ key: string }>(`/admin/uploads/image?structureId=${encodeURIComponent(project.structure.id)}`, form)).key
      }
      await api.post(`/admin/projects/${encodeURIComponent(project.id)}/updates`, { title: title.trim(), body: body.trim() || null, imageKey })
      void qc.invalidateQueries({ queryKey: ['app'] })
      toast('Suivi du projet publié')
      router.replace(back)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Screen gap={16}>
      <BackHeader title={photoFirst ? 'Photos du chantier' : 'Rapport d’étape'} fallback={back} />
      {projects.isPending ? (
        <Loading minHeight={160} />
      ) : projects.isError ? (
        <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
      ) : list.length === 0 ? (
        <Empty>Aucun projet en cours dont vous avez la charge.</Empty>
      ) : (
        <form onSubmit={save} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {list.length > 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="pwa-label">Projet</span>
              <ChipRow>
                {list.map((p) => (
                  <Chip key={p.id} label={p.title} active={p.id === project?.id} onClick={() => setPick(p.id)} />
                ))}
              </ChipRow>
            </div>
          ) : (
            <Txt size={13} color={color.textMuted}>
              {project?.title} · {project?.structure.name}
            </Txt>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="pwa-label">Photo{photoFirst ? '' : ' (facultatif)'}</span>
            {preview ? (
              <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', height: 200, background: color.divider }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local de la photo choisie */}
                <img src={preview} alt="Photo choisie" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button type="button" className="pwa-round" aria-label="Retirer la photo" onClick={() => choose(null)} style={{ position: 'absolute', top: 10, right: 10, width: 36, height: 36, background: color.bg }}>
                  <X size={16} aria-hidden />
                </button>
              </div>
            ) : (
              <label className="pwa-press" style={{ position: 'relative', height: 120, borderRadius: 18, boxShadow: `inset 0 0 0 1.5px ${color.fieldBorder}`, background: color.surface, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', color: color.primary }}>
                <Camera size={28} aria-hidden />
                <Txt as="span" size={13} weight={700} color={color.primary}>
                  Prendre ou choisir une photo
                </Txt>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => choose(e.target.files?.[0] ?? null)} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
              </label>
            )}
          </div>
          <Field label="Titre">
            <input className="pwa-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Ex. Murs élevés à 70 %" />
          </Field>
          <Field label="Texte (facultatif)">
            <textarea className="pwa-textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={4} style={{ minHeight: 100 }} />
          </Field>
          <FormError text={error} />
          <Btn type="submit" label="Publier le suivi" loading={busy} disabled={!valid} />
        </form>
      )}
    </Screen>
  )
}
