'use client'

import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Check, LockSimple, Plus, X } from '@phosphor-icons/react'
import { fmtFcfa, fmtInt, fmtPct } from '@cepca/shared'
import { api, idempotencyKey } from '@/lib/api'
import { useAct, useDebounced } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import type { ClosingDto, ContributionList, ContributionRow, Page, ProjectDto, RefundDto } from '@/lib/types'
import { dayTime, parseAmount } from '@/lib/format'
import { Chips, ErrorBox, Field, Loading, PageHead, Pill, SearchInput } from '@/components/ui'

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** Mois comptable à Douala (UTC+1) : bornes [from, to[ en ISO. */
function monthBounds(year: number, month: number) {
  const at = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1) - 3600_000).toISOString()
  return { from: at(year, month), to: at(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1) }
}
function doualaYm(d = new Date()) {
  const x = new Date(d.getTime() + 3600_000)
  return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1 }
}
const prevYm = ({ year, month }: { year: number; month: number }) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 })

type Status = 'ALL' | 'SUCCEEDED' | 'PENDING' | 'FAILED' | 'MANUAL' | 'REFUNDED'
const STATUS_CHIPS: Array<{ value: Status; label: string }> = [
  { value: 'ALL', label: 'Tous' },
  { value: 'SUCCEEDED', label: 'Réussi' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'FAILED', label: 'Échec' },
  { value: 'MANUAL', label: 'Manuel' },
  { value: 'REFUNDED', label: 'Remboursé' },
]
const REFUND_STATUS: Record<RefundDto['status'], string> = { REQUESTED: 'Demandé', VALIDATED: 'Validé', EXECUTED: 'Exécuté', REJECTED: 'Refusé' }
const GAP_MS = 15 * 60 * 1000

export default function ContributionsPage() {
  return (
    <Suspense>
      <Contributions />
    </Suspense>
  )
}

function Contributions() {
  const params = useSearchParams()
  const { seat, can } = useSession()
  const [view, setView] = useState<'tx' | 'refunds'>(params.get('vue') === 'remboursements' ? 'refunds' : 'tx')
  const [manual, setManual] = useState(params.get('saisie') === '1')
  const now = doualaYm()
  const prev = prevYm(now)
  const [period, setPeriod] = useState<'cur' | 'prev' | 'all'>('cur')
  const range = period === 'cur' ? monthBounds(now.year, now.month) : period === 'prev' ? monthBounds(prev.year, prev.month) : null
  const periodLabel = period === 'cur' ? SHORT[now.month - 1] : period === 'prev' ? SHORT[prev.month - 1] : 'total'

  return (
    <>
      <PageHead
        eyebrow={`${seat.roleLabel} · ${seat.structure.level}`}
        title="Contributions"
        note="Contributions reçues par Mobile Money et saisies manuelles. Rapprochez les paiements en attente avant de clôturer le mois."
      >
        {can('CONTRIBUTIONS', 'write', true) ? (
          <button type="button" className="btn" onClick={() => setManual(true)}>
            <Plus size={16} weight="bold" />
            Saisie manuelle
          </button>
        ) : null}
      </PageHead>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Chips
          label="Vue"
          options={[
            { value: 'tx', label: 'Transactions' },
            { value: 'refunds', label: 'Remboursements' },
          ]}
          value={view}
          onChange={setView}
        />
        {view === 'tx' ? (
          <Chips
            label="Période"
            options={[
              { value: 'cur', label: `${MONTHS[now.month - 1][0].toUpperCase()}${MONTHS[now.month - 1].slice(1)} ${now.year}` },
              { value: 'prev', label: `${MONTHS[prev.month - 1][0].toUpperCase()}${MONTHS[prev.month - 1].slice(1)} ${prev.year}` },
              { value: 'all', label: 'Tout' },
            ]}
            value={period}
            onChange={setPeriod}
          />
        ) : null}
      </div>

      {manual ? <ManualForm onClose={() => setManual(false)} /> : null}
      {view === 'tx' ? <Transactions range={range} periodLabel={periodLabel} initialStatus={(params.get('statut') as Status) || 'ALL'} closeYm={prev} /> : <Refunds />}
    </>
  )
}

function Transactions({ range, periodLabel, initialStatus, closeYm }: { range: { from: string; to: string } | null; periodLabel: string; initialStatus: Status; closeYm: { year: number; month: number } }) {
  const { seat, can } = useSession()
  const [status, setStatus] = useState<Status>(initialStatus)
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim())
  const [open, setOpen] = useState<{ id: string; kind: 'resolve' | 'refund' } | null>(null)

  const list = useInfiniteQuery({
    queryKey: ['contributions', seat.structure.id, status, dq, range?.from ?? 'all'],
    queryFn: ({ pageParam }) =>
      api.get<ContributionList>('/admin/contributions', { structureId: seat.structure.id, status: status === 'ALL' ? undefined : status, q: dq || undefined, from: range?.from, to: range?.to, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const s = list.data?.pages[0]?.summary
  const inv = [['contributions'], ['dashboard'], ['refunds']]
  const recheck = useAct((id: string) => api.post<ContributionRow>(`/admin/contributions/${id}/recheck`), {
    ok: (r) => (r.status === 'PENDING' ? 'Toujours en attente chez l’opérateur' : `Opérateur : ${r.statusLabel}`),
    invalidate: inv,
  })

  const closings = useQuery({ queryKey: ['closings', seat.structure.id], queryFn: () => api.get<ClosingDto[]>('/admin/closings', { structureId: seat.structure.id }), enabled: can('CONTRIBUTIONS', 'read', true) })
  const closed = closings.data?.some((c) => c.year === closeYm.year && c.month === closeYm.month)
  const close = useAct(() => api.post<{ label: string }>('/admin/closings', { structureId: seat.structure.id, ...closeYm }), {
    ok: (r) => `${r.label[0].toUpperCase()}${r.label.slice(1)} clôturé`,
    invalidate: [['closings'], ['dashboard']],
  })
  const monthName = MONTHS[closeYm.month - 1]
  const grid = '120px 1.5fr 1.2fr 1fr 110px 130px 120px'

  return (
    <>
      <div className="kpis">
        <div className="kpi sm">
          <span className="l">Collecté ({periodLabel})</span>
          <span className="v">{s ? fmtFcfa(s.collected) : '—'}</span>
          <span className="n up">{s ? `${fmtInt(s.succeeded)} contribution${s.succeeded > 1 ? 's' : ''}` : ' '}</span>
        </div>
        <div className="kpi sm">
          <span className="l">En attente</span>
          <span className="v">{s ? fmtInt(s.pending) : '—'}</span>
          <span className="n warn">{s?.pending ? 'À rapprocher avec l’opérateur' : ' '}</span>
        </div>
        <div className="kpi sm">
          <span className="l">Échecs</span>
          <span className="v">{s ? fmtInt(s.failed) : '—'}</span>
          <span className="n down">{s?.failed ? 'Refus ou abandon du payeur' : ' '}</span>
        </div>
        <div className="kpi sm">
          <span className="l">Taux de réussite</span>
          <span className="v">{s?.successRate != null ? fmtPct(s.successRate) : '—'}</span>
          <span className="n">MTN MoMo et Orange Money</span>
        </div>
      </div>

      <section className="card">
        <div className="row" style={{ gap: 10 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Fidèle, référence" label="Rechercher une contribution" />
          <Chips label="Statut" options={STATUS_CHIPS} value={status} onChange={setStatus} />
        </div>
        {list.isError ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : null}
        <div className="table-wrap">
          <div style={{ minWidth: 900 }}>
            <div className="tbl-head" style={{ gridTemplateColumns: grid, gap: 12 }}>
              <span>Date</span>
              <span>Fidèle</span>
              <span>Type</span>
              <span>Moyen</span>
              <span className="right">Montant</span>
              <span>Statut</span>
              <span />
            </div>
            {list.isPending ? <Loading rows={6} /> : null}
            {rows.map((x) => {
              const late = x.status === 'PENDING' && Date.now() - new Date(x.at).getTime() > GAP_MS
              return (
                <div key={x.id}>
                  <div className="tbl-row" style={{ gridTemplateColumns: grid, gap: 12, padding: '11px 0' }}>
                    <span className="muted">{dayTime(x.at)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="strong ellipsis" style={{ display: 'block' }}>
                        {x.payer}
                      </span>
                      <span className="sub" style={{ fontSize: 11 }}>
                        {x.reference ?? '—'}
                        {x.recurring ? ' · mensuel' : ''}
                      </span>
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="ellipsis" style={{ display: 'block' }}>
                        {x.destination.startsWith(`${x.type} · `) ? x.destination : x.type}
                      </span>
                      {x.structure.id !== seat.structure.id ? (
                        <span className="sub ellipsis" style={{ fontSize: 11 }}>
                          {x.structure.name}
                        </span>
                      ) : null}
                    </span>
                    <span style={{ color: 'var(--c-text-muted-2)' }}>{x.channelLabel}</span>
                    <span className="right tabular" style={{ fontWeight: 700 }}>
                      {fmtInt(x.amount)}
                    </span>
                    <span>
                      <Pill small label={x.statusLabel} />
                    </span>
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      {x.status === 'PENDING' && can('CONTRIBUTIONS', 'write', true) ? (
                        late && can('CONTRIBUTIONS', 'validate', true) ? (
                          <button type="button" className="btn-outline-green" onClick={() => setOpen({ id: x.id, kind: 'resolve' })}>
                            Rapprocher
                          </button>
                        ) : (
                          <button type="button" className="btn-outline-green" disabled={recheck.isPending} onClick={() => recheck.mutate(x.id)}>
                            Relancer
                          </button>
                        )
                      ) : null}
                      {x.status === 'SUCCEEDED' && can('CONTRIBUTIONS', 'write', true) ? (
                        <button type="button" className="btn-outline-green" onClick={() => setOpen({ id: x.id, kind: 'refund' })}>
                          Rembourser
                        </button>
                      ) : null}
                    </span>
                  </div>
                  {open?.id === x.id ? open.kind === 'resolve' ? <ResolveForm row={x} onClose={() => setOpen(null)} /> : <RefundForm row={x} onClose={() => setOpen(null)} /> : null}
                </div>
              )
            })}
            {!list.isPending && rows.length === 0 ? <div className="empty-line">Aucune contribution ne correspond.</div> : null}
          </div>
        </div>
        {list.hasNextPage ? (
          <button type="button" className="btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            Afficher plus
          </button>
        ) : null}
        <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
          <span className="foot-note">{fmtInt(rows.length)} transaction(s) affichée(s) · frais opérateur à la charge du fidèle</span>
          {can('CONTRIBUTIONS', 'validate', true) ? (
            <button
              type="button"
              className="btn-ghost"
              disabled={!!closed || close.isPending}
              onClick={() => {
                if (window.confirm(`Clôturer ${monthName} ${closeYm.year} ? Aucune saisie ne pourra plus être datée de ce mois.`)) close.mutate()
              }}
            >
              <LockSimple size={16} />
              {closed ? `${monthName[0].toUpperCase()}${monthName.slice(1)} clôturé` : `Clôturer ${monthName}`}
            </button>
          ) : null}
        </div>
      </section>
    </>
  )
}

function ResolveForm({ row, onClose }: { row: ContributionRow; onClose: () => void }) {
  const [status, setStatus] = useState<'SUCCEEDED' | 'FAILED'>('SUCCEEDED')
  const [note, setNote] = useState('')
  const resolve = useAct(() => api.post<ContributionRow>(`/admin/contributions/${row.id}/resolve`, { status, note: note.trim() }), {
    ok: (r) => `Rapproché · ${r.statusLabel}`,
    invalidate: [['contributions'], ['dashboard']],
    onDone: onClose,
  })
  return (
    <div className="soft-box on-soft" style={{ margin: '8px 0 12px' }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>
        Rapprochement : {row.payer} · {fmtFcfa(row.amount)}
      </span>
      <span style={{ fontSize: 12, color: 'var(--c-text-muted-2)' }}>L’opérateur sera interrogé une dernière fois : sa réponse l’emporte sur votre décision. Celle-ci est tracée au journal.</span>
      <Chips
        label="Constat"
        options={[
          { value: 'SUCCEEDED', label: 'Reçu sur le relevé' },
          { value: 'FAILED', label: 'Non reçu' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <Field label="Preuve (relevé, référence opérateur…)">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} autoFocus />
      </Field>
      <div className="row">
        <button type="button" className="btn" disabled={note.trim().length < 5 || resolve.isPending} onClick={() => resolve.mutate()}>
          Rapprocher
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  )
}

function RefundForm({ row, onClose }: { row: ContributionRow; onClose: () => void }) {
  const [amount, setAmount] = useState(String(row.amount))
  const [reason, setReason] = useState('')
  const n = parseAmount(amount)
  const req = useAct(() => api.post(`/admin/contributions/${row.id}/refunds`, { amount: n, reason: reason.trim() }), {
    ok: 'Demande de remboursement enregistrée · un autre responsable doit la valider',
    invalidate: [['refunds'], ['dashboard']],
    onDone: onClose,
  })
  return (
    <div className="soft-box on-soft" style={{ margin: '8px 0 12px' }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>
        Remboursement : {row.payer} · {row.reference}
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0,1fr)', gap: 10 }}>
        <Field label="Montant (FCFA)">
          <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ''))} />
        </Field>
        <Field label="Motif">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. Double paiement" maxLength={500} autoFocus />
        </Field>
      </div>
      <div className="row">
        <button type="button" className="btn" disabled={n <= 0 || n > row.amount || reason.trim().length < 5 || req.isPending} onClick={() => req.mutate()}>
          Demander le remboursement
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  )
}

function Refunds() {
  const { can } = useSession()
  const list = useQuery({ queryKey: ['refunds'], queryFn: () => api.get<RefundDto[]>('/admin/refunds') })
  const [exec, setExec] = useState<string | null>(null)
  const [ref, setRef] = useState('')
  const inv = [['refunds'], ['contributions'], ['dashboard']]
  const validate = useAct((id: string) => api.post(`/admin/refunds/${id}/validate`), { ok: 'Remboursement validé', invalidate: inv })
  const reject = useAct((id: string) => api.post(`/admin/refunds/${id}/reject`), { ok: 'Remboursement refusé', invalidate: inv })
  const execute = useAct((id: string) => api.post(`/admin/refunds/${id}/execute`, { providerRef: ref.trim() }), {
    ok: 'Remboursement exécuté · le fidèle est prévenu',
    invalidate: inv,
    onDone: () => {
      setExec(null)
      setRef('')
    },
  })
  const v = can('CONTRIBUTIONS', 'validate', true)
  const grid = '1.4fr 1.6fr 110px 1.6fr 100px 190px'
  return (
    <section className="card">
      <div className="card-head">
        <h2>Remboursements</h2>
        <span className="meta">Demande → validation par un autre responsable → exécution chez l’opérateur</span>
      </div>
      {list.isError ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : null}
      <div className="table-wrap">
        <div style={{ minWidth: 860 }}>
          <div className="tbl-head" style={{ gridTemplateColumns: grid, gap: 12 }}>
            <span>Demande</span>
            <span>Contribution</span>
            <span className="right">Montant</span>
            <span>Motif</span>
            <span>Statut</span>
            <span />
          </div>
          {list.isPending ? <Loading rows={3} /> : null}
          {(list.data ?? []).map((r) => (
            <div key={r.id}>
              <div className="tbl-row" style={{ gridTemplateColumns: grid, gap: 12 }}>
                <span className="muted">{dayTime(r.createdAt)}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="strong ellipsis" style={{ display: 'block' }}>
                    {r.contribution.payer}
                  </span>
                  <span className="sub" style={{ fontSize: 11 }}>
                    {r.contribution.reference} · {r.contribution.type}
                  </span>
                </span>
                <span className="right tabular" style={{ fontWeight: 700 }}>
                  {fmtInt(r.amount)}
                </span>
                <span className="ellipsis">{r.reason}</span>
                <span>
                  <Pill small label={REFUND_STATUS[r.status]} />
                </span>
                <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  {v && r.status === 'REQUESTED' && !r.requestedByMe ? (
                    <>
                      <button type="button" className="icon-btn" aria-label="Refuser" disabled={reject.isPending} onClick={() => reject.mutate(r.id)}>
                        <X size={14} />
                      </button>
                      <button type="button" className="btn btn-xs" disabled={validate.isPending} onClick={() => validate.mutate(r.id)}>
                        <Check size={14} weight="bold" />
                        Valider
                      </button>
                    </>
                  ) : null}
                  {v && r.status === 'REQUESTED' && r.requestedByMe ? <span className="muted" style={{ fontSize: 12 }}>Votre demande</span> : null}
                  {v && r.status === 'VALIDATED' ? (
                    <button type="button" className="btn-outline-green" onClick={() => setExec(r.id)}>
                      Exécuter
                    </button>
                  ) : null}
                </span>
              </div>
              {exec === r.id ? (
                <div className="soft-box on-soft" style={{ margin: '8px 0 12px' }}>
                  <span style={{ fontSize: 13 }}>Faites le virement de retour chez l’opérateur, puis saisissez sa référence.</span>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Référence de l’opérateur" aria-label="Référence de l’opérateur" maxLength={80} autoFocus />
                    <button type="button" className="btn" disabled={ref.trim().length < 3 || execute.isPending} onClick={() => execute.mutate(r.id)}>
                      Confirmer
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setExec(null)}>
                      Annuler
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {!list.isPending && (list.data ?? []).length === 0 ? <div className="empty-line">Aucune demande de remboursement.</div> : null}
        </div>
      </div>
    </section>
  )
}

const MODES = [
  { value: 'CASH', label: 'Espèces' },
  { value: 'CHEQUE', label: 'Chèque' },
  { value: 'BANK', label: 'Virement' },
] as const

function ManualForm({ onClose }: { onClose: () => void }) {
  const { seat } = useSession()
  const [key] = useState(idempotencyKey)
  const [payer, setPayer] = useState('')
  const [typeKey, setTypeKey] = useState('')
  const [projectId, setProjectId] = useState('')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<(typeof MODES)[number]['value']>('CASH')
  const types = useQuery({ queryKey: ['contribution-types', seat.structure.id], queryFn: () => api.get<Array<{ key: string; label: string; requiresProject: boolean }>>('/admin/contribution-types', { structureId: seat.structure.id }) })
  const t = types.data?.find((x) => x.key === (typeKey || types.data?.[0]?.key))
  const projects = useQuery({
    queryKey: ['projects-open', seat.structure.id],
    queryFn: () => api.get<Page<ProjectDto>>('/admin/projects', { structureId: seat.structure.id }),
    enabled: !!t?.requiresProject,
  })
  const openProjects = useMemo(() => (projects.data?.items ?? []).filter((p) => p.status !== 'CLOSED'), [projects.data])
  const n = parseAmount(amount)
  const pid = projectId || openProjects[0]?.id || ''
  const valid = payer.trim().length >= 2 && n >= 100 && !!t && (!t.requiresProject || !!pid)
  const save = useAct(
    () =>
      api.post<ContributionRow>('/admin/contributions/manual', {
        idempotencyKey: key,
        structureId: seat.structure.id,
        typeKey: t!.key,
        projectId: t!.requiresProject ? pid : null,
        amount: n,
        channel: mode === 'CASH' ? 'CASH' : 'BANK',
        payerLabel: payer.trim(),
        note: mode === 'CHEQUE' ? 'Chèque' : undefined,
      }),
    { ok: (r) => `Contribution enregistrée · reçu ${r.receiptNumber}`, invalidate: [['contributions'], ['dashboard']], onDone: onClose },
  )
  return (
    <section className="card">
      <div className="card-head">
        <h2>Saisie manuelle</h2>
        <span className="meta">Pour les dons remis en espèces, par chèque ou par virement</span>
      </div>
      <div className="form-grid">
        <Field label="Fidèle">
          <input className="input" value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="Nom du fidèle" maxLength={120} autoFocus />
        </Field>
        <Field label="Type">
          <select className="select" value={t?.key ?? ''} onChange={(e) => setTypeKey(e.target.value)}>
            {(types.data ?? []).map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        {t?.requiresProject ? (
          <Field label="Projet">
            <select className="select" value={pid} onChange={(e) => setProjectId(e.target.value)}>
              {openProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Montant (FCFA)">
          <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ''))} placeholder="Ex. 10 000" />
        </Field>
      </div>
      <div className="field">
        <span>Mode</span>
        <Chips label="Mode" options={MODES} value={mode} onChange={setMode} />
      </div>
      <div className="row">
        <button type="button" className="btn" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
          Enregistrer et émettre le reçu
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
      </div>
    </section>
  )
}
