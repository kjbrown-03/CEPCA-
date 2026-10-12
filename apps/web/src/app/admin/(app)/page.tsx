'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowCounterClockwise, Buildings, Check, DownloadSimple, MicrophoneStage, Newspaper, Plus, Receipt, UserPlus, Warning, X, type Icon } from '@phosphor-icons/react'
import { MODULE_LABEL, type ModuleKey, type QueueItemDto } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { useSession } from '@/lib/session'
import { auditStamp, greetingName } from '@/lib/format'
import { ErrorBox, PageHead, Pill, Skeleton, useToast } from '@/components/ui'
import { useDashboard } from './shell'

const KIND_ICON: Record<QueueItemDto['kind'], Icon> = {
  MEMBERSHIP: UserPlus,
  PUBLICATION: Newspaper,
  SERMON: MicrophoneStage,
  PROJECT: Buildings,
  PAYMENT: Warning,
  REFUND: ArrowCounterClockwise,
  CLOSING: Receipt,
}

const OPEN_HREF: Record<QueueItemDto['kind'], (id: string) => string> = {
  MEMBERSHIP: () => '/admin/utilisateurs?filtre=PENDING',
  PUBLICATION: (id) => `/admin/publications?id=${id}`,
  SERMON: (id) => `/admin/predications?id=${id}`,
  PROJECT: (id) => `/admin/projets?id=${id}`,
  PAYMENT: () => '/admin/contributions?statut=PENDING',
  REFUND: () => '/admin/contributions?vue=remboursements',
  CLOSING: () => '/admin/contributions',
}

/** Décision en un geste depuis la file, selon la nature de l'élément. */
function decide(item: QueueItemDto, ok: boolean): Promise<unknown> {
  switch (item.kind) {
    case 'MEMBERSHIP':
      return api.post(`/admin/memberships/${item.id}/${ok ? 'approve' : 'reject'}`)
    case 'REFUND':
      return api.post(`/admin/refunds/${item.id}/${ok ? 'validate' : 'reject'}`)
    case 'PUBLICATION':
      return api.post(`/admin/publications/${item.id}/publish`)
    case 'SERMON':
      return api.post(`/admin/sermons/${item.id}/publish`)
    case 'PROJECT':
      return api.post(`/admin/projects/${item.id}/validate`)
    default:
      return Promise.reject(new Error('Ouvrez l’élément pour le traiter.'))
  }
}

const OK_TOAST: Partial<Record<QueueItemDto['kind'], string>> = {
  MEMBERSHIP: 'Inscription validée',
  REFUND: 'Remboursement validé',
  PUBLICATION: 'Publication en ligne',
  SERMON: 'Prédication publiée',
  PROJECT: 'Projet validé',
}

const MATRIX: ModuleKey[] = ['NEWS', 'EVENTS', 'SERMONS', 'DOCUMENTS', 'MEMBERS', 'CONTRIBUTIONS', 'PROJECTS', 'REPORTS', 'USERS_ROLES', 'SETTINGS']

function kpiTone(label: string, hint: string) {
  if (/retard|manquant|écart|sans|vacant|à rapprocher/i.test(label + ' ' + hint)) return 'down'
  if (/^-\d/.test(hint)) return 'down'
  if (/\+|réussi|validé/i.test(hint)) return 'up'
  return ''
}

/** « A validé… » se lit à la suite du nom ; une action nominale (« Connexion au back-office ») est séparée. */
const auditPhrase = (action: string) => (/^A /.test(action) ? 'a' + action.slice(1) : `· ${action}`)

const monthShort = (m: string) => (m[0].toUpperCase() + m.slice(1)).replace(/\.$/, '')
const barValue = (v: number) => (v >= 1000 ? Math.round(v).toLocaleString('fr-FR') : String(v).replace('.', ','))

export default function DashboardPage() {
  const { me, seat, can } = useSession()
  const dash = useDashboard()
  const qc = useQueryClient()
  const toast = useToast()
  const [decided, setDecided] = useState<Array<{ item: QueueItemDto; ok: boolean }>>([])

  const act = useMutation({
    mutationFn: ({ item, ok }: { item: QueueItemDto; ok: boolean }) => decide(item, ok),
    onSuccess: (_, { item, ok }) => {
      setDecided((d) => [...d, { item, ok }])
      toast(ok ? (OK_TOAST[item.kind] ?? 'Validé') : 'Refusé')
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e) => toast(errorMessage(e), true),
  })

  const primary = primaryAction(seat.roleKey, seat.structure.path, seat.nav, can)
  const head = (
    <PageHead eyebrow={`${seat.roleLabel} · ${seat.structure.level}`} title={`Bonjour, ${greetingName(me.fullName, seat.title)}`} note={dash.data?.scopeNote}>
      {seat.nav.includes('reports') ? (
        <Link href="/admin/rapports" className="btn-ghost">
          <DownloadSimple size={16} />
          Exporter le rapport
        </Link>
      ) : null}
      {primary ? (
        <Link href={primary.href} className="btn">
          <Plus size={16} weight="bold" />
          {primary.label}
        </Link>
      ) : null}
    </PageHead>
  )

  if (dash.isPending)
    return (
      <>
        {head}
        <div className="kpis">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={118} />
          ))}
        </div>
        <div className="grid2">
          <Skeleton h={300} />
          <Skeleton h={300} />
        </div>
      </>
    )
  if (dash.isError)
    return (
      <>
        {head}
        <ErrorBox error={dash.error} onRetry={() => dash.refetch()} />
      </>
    )

  const d = dash.data
  const max = Math.max(1, ...d.chart.values)
  const live = d.queue.filter((q) => !decided.some((x) => x.item.id === q.id))
  const rows = [...live.map((item) => ({ item, ok: null as boolean | null })), ...decided]

  const statusLast = d.table.columns[d.table.columns.length - 1] === 'Statut'
  const cols = statusLast ? d.table.columns : [...d.table.columns, 'Statut']
  const grid = `2.2fr 1.2fr ${'1fr '.repeat(Math.max(0, cols.length - 2))}`.trim()

  return (
    <>
      {head}
      <div className="kpis">
        {d.kpis.map((k) => (
          <div key={k.label} className="kpi">
            <span className="l">{k.label}</span>
            <span className="v">{k.value}</span>
            <span className={`n ${kpiTone(k.label, k.hint)}`}>{k.hint || ' '}</span>
          </div>
        ))}
      </div>

      <div className="grid2">
        <section className="card" style={{ gap: 20 }}>
          <div className="card-head">
            <h2>{d.chart.title}</h2>
            <span className="meta">{d.chart.unit}</span>
          </div>
          <div className="bars" role="img" aria-label={`${d.chart.title} : ${d.chart.months.map((m, i) => `${m} ${barValue(d.chart.values[i])}`).join(', ')} ${d.chart.unit}`}>
            {d.chart.values.map((v, i) => (
              <div key={d.chart.months[i]} className={`b${i === d.chart.values.length - 1 ? ' cur' : ''}`}>
                <span className="v">{barValue(v)}</span>
                <div className="bar" style={{ height: Math.round((v / max) * 150) }} />
                <span className="m">{monthShort(d.chart.months[i])}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card" id="a-valider">
          <div className="card-head">
            <h2>À valider</h2>
            <span className="meta strong">{live.length} en attente</span>
          </div>
          {rows.length === 0 ? <div className="empty-line" style={{ padding: '12px 0' }}>Rien à valider pour le moment.</div> : null}
          {rows.map(({ item, ok }) => {
            const Icon = KIND_ICON[item.kind]
            const busy = act.isPending && act.variables?.item.id === item.id
            return (
              <div key={`${item.kind}-${item.id}`} className="line">
                <span className="tile">
                  <Icon size={18} />
                </span>
                <div className="grow">
                  <div className="t">{item.title}</div>
                  <div className="m">{item.meta}</div>
                </div>
                {ok === null ? (
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    {item.actions.includes('open') ? (
                      <Link href={OPEN_HREF[item.kind](item.id)} className={item.actions.includes('approve') ? 'btn-outline-green' : 'btn btn-xs'}>
                        Ouvrir
                      </Link>
                    ) : null}
                    {item.actions.includes('reject') ? (
                      <button type="button" className="icon-btn" aria-label={`Refuser : ${item.title}`} disabled={busy} onClick={() => act.mutate({ item, ok: false })}>
                        <X size={16} />
                      </button>
                    ) : null}
                    {item.actions.includes('approve') ? (
                      <button type="button" className="btn btn-xs" style={{ height: 36, padding: '0 14px', fontSize: 13 }} disabled={busy} onClick={() => act.mutate({ item, ok: true })}>
                        Valider
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <span className={`done-label${ok ? '' : ' no'}`}>
                    {ok ? <Check size={14} weight="bold" /> : <X size={14} weight="bold" />}
                    {ok ? 'Validé' : 'Refusé'}
                  </span>
                )}
              </div>
            )
          })}
        </section>
      </div>

      <section className="card table-wrap">
        <h2>{d.table.title}</h2>
        {d.table.rows.length === 0 ? (
          <div className="empty-line">Rien à afficher pour le moment.</div>
        ) : (
          <div style={{ minWidth: 640 }}>
            <div className="tbl-head" style={{ gridTemplateColumns: grid, gap: 16 }}>
              {cols.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            {d.table.rows.map((r) => {
              const cells = statusLast ? r.cells.slice(0, -1) : r.cells
              return (
                <div key={r.id} className="tbl-row big" style={{ gridTemplateColumns: grid, gap: 16 }}>
                  {cells.map((c, i) => (
                    <span key={i} className={i === 0 ? 'strong' : i === 1 ? 'muted' : 'tabular'}>
                      {c}
                    </span>
                  ))}
                  <span>
                    <Pill label={r.status} />
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="grid2">
        <section className="card">
          <h2>Mes droits</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            C consulter · R créer/modifier · V valider · niveau {seat.structure.level}
          </span>
          <div>
            {MATRIX.map((m) => {
              const p = seat.permissions[m]
              const v = !p ? 'Non' : [p.read && 'C', p.write && 'R', p.validate && 'V'].filter(Boolean).join('/') + (p.aggregateOnly ? ' · agrégé' : '')
              return (
                <div key={m} className="line" style={{ padding: '8px 0', boxShadow: '0 1px 0 var(--c-border-soft)' }}>
                  <span style={{ flex: 1, fontSize: 14 }}>{MODULE_LABEL[m]}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: p ? 'var(--c-text)' : 'var(--c-error-fg)' }}>{v}</span>
                </div>
              )
            })}
          </div>
        </section>
        <section className="card">
          <h2>Journal d’audit</h2>
          {d.recentAudit.length === 0 ? <div className="empty-line">Aucune action récente.</div> : null}
          <div>
            {d.recentAudit.map((a, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '86px minmax(0,1fr)', gap: 12, padding: '8px 0', boxShadow: '0 1px 0 var(--c-border-soft)', fontSize: 13 }}>
                <span className="muted tabular">{auditStamp(a.at)}</span>
                <span>
                  <strong style={{ fontWeight: 600 }}>{a.actor}</strong> {auditPhrase(a.action)}
                </span>
              </div>
            ))}
          </div>
          {seat.nav.includes('audit') ? (
            <Link href="/admin/journal" style={{ fontSize: 13, fontWeight: 700 }}>
              Tout le journal
            </Link>
          ) : null}
        </section>
      </div>
    </>
  )
}

/** Bouton principal du tableau de bord, selon le rôle (maquette : « Nouvelle confession », « Saisie manuelle »…). */
function primaryAction(roleKey: string, path: string, nav: string[], can: (m: ModuleKey, a?: 'read' | 'write' | 'validate') => boolean) {
  const pick = (key: string, label: string, href: string) => (nav.includes(key) ? { label, href } : null)
  if (path === '/cepca/' && can('STRUCTURES', 'validate')) return pick('struct', 'Nouvelle confession', '/admin/structures?nouveau=confession')
  if (roleKey === 'finance') return pick('pay', 'Saisie manuelle', '/admin/contributions?saisie=1')
  if (roleKey === 'project') return pick('proj', 'Nouveau projet', '/admin/projets?nouveau=1')
  if (roleKey === 'communication') return pick('news', 'Nouvelle publication', '/admin/publications?nouveau=1')
  if (roleKey === 'conf_admin' && can('STRUCTURES', 'write')) return pick('struct', 'Nouvelle structure', '/admin/structures?ajout=1')
  if (can('NEWS', 'write')) return pick('news', 'Nouvelle annonce', '/admin/publications?nouveau=1')
  return null
}
