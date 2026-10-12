'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChartLine, CheckCircle, Circle, Cross, DownloadSimple, FileArrowDown, FileText, HandCoins, Megaphone, Buildings, Users } from '@phosphor-icons/react'
import { api, download, errorMessage } from '@/lib/api'
import { useSession } from '@/lib/session'
import type { ModuleKey, RecentReport, ReportDto } from '@/lib/types'
import { dayShort, dayTime } from '@/lib/format'
import { Chips, ErrorBox, PageHead, Skeleton, useToast } from '@/components/ui'
import { StructureSelect } from '@/components/structure-select'

type ReportType = 'contributions' | 'members' | 'projects' | 'activities' | 'communication'
const TYPES: Array<{ value: ReportType; label: string; icon: typeof HandCoins; module: ModuleKey }> = [
  { value: 'contributions', label: 'Contributions', icon: HandCoins, module: 'CONTRIBUTIONS' },
  { value: 'members', label: 'Fidèles', icon: Users, module: 'MEMBERS' },
  { value: 'projects', label: 'Projets', icon: Buildings, module: 'PROJECTS' },
  { value: 'activities', label: 'Activités', icon: ChartLine, module: 'EVENTS' },
  { value: 'communication', label: 'Communication et audience', icon: Megaphone, module: 'NEWS' },
]
type Format = 'pdf' | 'xlsx' | 'csv'
const FORMATS: Array<{ value: Format; label: string }> = [
  { value: 'pdf', label: 'PDF' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'csv', label: 'CSV' },
]
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

/** Périodes proposées : mois écoulé, trimestre écoulé, mois en cours, année en cours (heure de Douala). */
function periods() {
  const x = new Date(Date.now() + 3600_000)
  const y = x.getUTCFullYear()
  const m = x.getUTCMonth() + 1
  const pm = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
  const q = Math.ceil(m / 3)
  const pq = q === 1 ? { y: y - 1, q: 4 } : { y, q: q - 1 }
  const two = (n: number) => String(n).padStart(2, '0')
  return [
    { value: `${pm.y}-${two(pm.m)}`, label: `${MONTHS[pm.m - 1]} ${pm.y}` },
    { value: `${pq.y}-Q${pq.q}`, label: `${pq.q === 1 ? '1er' : `${pq.q}e`} trimestre ${pq.y}` },
    { value: `${y}-${two(m)}`, label: `${MONTHS[m - 1]} ${y} (en cours)` },
    { value: String(y), label: `Année ${y}` },
  ]
}

export default function ReportsPage() {
  const { me, seat, can } = useSession()
  const qc = useQueryClient()
  const toast = useToast()
  const types = TYPES.filter((t) => can(t.module))
  const [type, setType] = useState<ReportType>(types[0]?.value ?? 'contributions')
  const options = periods()
  const [period, setPeriod] = useState(options[0].value)
  const [structureId, setStructureId] = useState(seat.structure.id)
  const [format, setFormat] = useState<Format>('pdf')
  const [busy, setBusy] = useState(false)

  const preview = useQuery({ queryKey: ['report', type, period, structureId], queryFn: () => api.get<ReportDto>('/admin/reports', { type, period, structureId, format: 'json' }) })
  const recent = useQuery({ queryKey: ['reports-recent'], queryFn: () => api.get<RecentReport[]>('/admin/reports/recent') })

  const generate = async (q: { type: string; period: string; structureId?: string | null; format: Format }) => {
    setBusy(true)
    try {
      await download('/admin/reports', { type: q.type, period: q.period, structureId: q.structureId ?? undefined, format: q.format })
      toast(`Rapport généré (${FORMATS.find((f) => f.value === q.format)?.label})`)
      await qc.invalidateQueries({ queryKey: ['reports-recent'] })
    } catch (e) {
      toast(errorMessage(e), true)
    } finally {
      setBusy(false)
    }
  }

  const r = preview.data
  const cols = r ? `1.8fr ${'1fr '.repeat(Math.max(0, r.columns.length - 1))}`.trim() : ''

  return (
    <>
      <PageHead eyebrow={`${seat.roleLabel} · ${seat.structure.level}`} title="Rapports" note="Générez un rapport sur votre périmètre, prévisualisez-le puis exportez-le.">
        <button type="button" className="btn" disabled={busy} onClick={() => generate({ type, period, structureId, format })}>
          <FileArrowDown size={16} weight="bold" />
          Générer le rapport
        </button>
      </PageHead>

      <div className="split">
        <section className="card" style={{ flex: '1 1 320px', gap: 18 }}>
          <h2>Paramètres</h2>
          <div className="field" role="radiogroup" aria-label="Type de rapport">
            <span>Type de rapport</span>
            {types.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={type === t.value} className="radio-card" onClick={() => setType(t.value)}>
                <t.icon size={18} />
                <span style={{ flex: 1 }}>{t.label}</span>
                {type === t.value ? <CheckCircle size={20} weight="fill" /> : <Circle size={20} />}
              </button>
            ))}
          </div>
          <div className="field">
            <span>Période</span>
            <Chips label="Période" options={options} value={period} onChange={setPeriod} />
          </div>
          <div className="field">
            <span>Périmètre</span>
            <StructureSelect value={structureId} onChange={setStructureId} maxDepth={1} label="Périmètre" />
          </div>
          <div className="field">
            <span>Format</span>
            <Chips label="Format" options={FORMATS} value={format} onChange={setFormat} />
          </div>
          <button type="button" className="btn" disabled={busy} onClick={() => generate({ type, period, structureId, format })}>
            <FileArrowDown size={16} weight="bold" />
            Générer le rapport
          </button>
        </section>

        <section className="card" style={{ flex: '2 1 480px', gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-text-muted)' }}>Aperçu</span>
          {preview.isError ? <ErrorBox error={preview.error} onRetry={() => preview.refetch()} /> : null}
          {preview.isPending ? <Skeleton h={360} /> : null}
          {r ? (
            <div className="paper" aria-busy={preview.isFetching}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--c-primary)' }}>Rapport · {r.title}</div>
                  <div style={{ font: '400 30px/1.1 var(--font-serif), serif', marginTop: 6 }}>{r.scope}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    {r.period.label}
                  </div>
                </div>
                <span className="row" style={{ gap: 8, font: '22px var(--font-serif), serif', flexWrap: 'nowrap' }}>
                  <span className="bo-mark" style={{ width: 28, height: 28, borderRadius: 8 }}>
                    <Cross size={14} weight="bold" />
                  </span>
                  CEPCA
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, r.kpis.length) || 1}, 1fr)`, gap: 10 }}>
                {r.kpis.slice(0, 3).map(([l, v]) => (
                  <div key={l} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--c-bg)' }}>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {l}
                    </div>
                    <div style={{ font: '400 24px/1.1 var(--font-serif), serif', marginTop: 4 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div className="table-wrap">
                <div className="tbl-head" style={{ gridTemplateColumns: cols, gap: 10, padding: '8px 0', fontSize: 11 }}>
                  {r.columns.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
                {r.rows.slice(0, 12).map((row, i) => (
                  <div key={i} className="tbl-row tabular" style={{ gridTemplateColumns: cols, gap: 10, padding: '10px 0' }}>
                    {row.map((c, j) => (
                      <span key={j} className={j === 0 ? 'strong' : ''}>
                        {c}
                      </span>
                    ))}
                  </div>
                ))}
                {r.rows.length === 0 ? <div className="empty-line">Aucune donnée sur cette période.</div> : null}
                {r.rows.length > 12 ? <div className="foot-note" style={{ paddingTop: 8 }}>… et {r.rows.length - 12} ligne(s) de plus dans l’export.</div> : null}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                Généré le {dayShort(r.generatedAt)} par {me.fullName} · données arrêtées au {dayTime(r.generatedAt)} · format {FORMATS.find((f) => f.value === format)?.label}
              </div>
            </div>
          ) : null}
        </section>

        <section className="card tight" style={{ flex: '1 1 100%' }}>
          <h2 style={{ marginBottom: 6 }}>Rapports récents</h2>
          {recent.isPending ? <Skeleton h={60} /> : null}
          {recent.data?.length === 0 ? <div className="empty-line" style={{ padding: '12px 0' }}>Vos exports apparaîtront ici.</div> : null}
          {(recent.data ?? []).map((x) => (
            <div key={x.id} className="line" style={{ boxShadow: '0 1px 0 var(--c-border-soft)' }}>
              <span className="tile">
                <FileText size={18} />
              </span>
              <div className="grow">
                <div className="t">{x.title}</div>
                <div className="m">Généré le {dayTime(x.at)}</div>
              </div>
              <span className="pill" style={{ background: 'var(--c-draft-bg)', color: 'var(--c-text)' }}>
                {FORMATS.find((f) => f.value === x.format)?.label ?? x.format.toUpperCase()}
              </span>
              <button type="button" className="icon-btn" style={{ width: 38, height: 38 }} aria-label={`Télécharger ${x.title}`} disabled={busy} onClick={() => generate({ type: x.type, period: x.period, structureId: x.structureId, format: x.format })}>
                <DownloadSimple size={16} />
              </button>
            </div>
          ))}
        </section>
      </div>
    </>
  )
}
