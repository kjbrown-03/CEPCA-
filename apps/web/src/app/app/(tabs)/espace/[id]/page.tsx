'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowSquareOut, Check, CheckCircle } from '@phosphor-icons/react'
import type { AdminSeat, DashboardDto, QueueItemDto } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { BACK_OFFICE, CTA, OPEN_HREF, QUICK, decide, familyOf, oneTap, staffKeys, useSeatDashboard, type Family, type QuickAction } from '../../../_lib/staff'
import { SeatGate } from '../../../_components/seat-gate'
import { useToast } from '../../../_components/toast'
import { BackHeader, Chip, ChipRow, Empty, ErrorState, Loading, Screen, Txt, color } from '../../../_components/ui'

export default function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <SeatGate id={id} title="Espace responsable">{(seat) => <Space seat={seat} />}</SeatGate>
}

function Space({ seat }: { seat: AdminSeat }) {
  const family = familyOf(seat.roleKey)
  const dash = useSeatDashboard(seat.assignmentId)
  const label = seat.title ?? seat.roleLabel

  return (
    <Screen gap={16}>
      <BackHeader title="Espace responsable" fallback="/app" />
      {dash.isPending ? (
        <Loading />
      ) : dash.isError ? (
        <ErrorState error={dash.error} onRetry={() => dash.refetch()} />
      ) : (
        <>
          <Hero d={dash.data} label={label} />
          <Actions seat={seat} family={family} />
          {family === 'project' ? (
            <ProjectSteps seat={seat} />
          ) : family === 'communication' ? (
            <Drafts seat={seat} queue={dash.data.queue} />
          ) : (
            <Queue seat={seat} items={dash.data.queue} title={family === 'finance' ? 'Écarts et décisions' : 'À traiter'} />
          )}
          <a href={BACK_OFFICE.href(seat.assignmentId)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: 700, padding: '6px 0' }}>
            <ArrowSquareOut size={15} aria-hidden />
            Ouvrir le back-office pour le reste
          </a>
        </>
      )}
    </Screen>
  )
}

/** En-tête vert foncé : rôle, structure, chiffre principal et deux indicateurs (maquette 4). */
function Hero({ d, label }: { d: DashboardDto; label: string }) {
  const [main, ...rest] = d.kpis
  return (
    <section className="pwa-card dark" style={{ padding: 18, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 12, color: color.onPrimary }}>
      <div>
        <Txt size={11} weight={700} upper ls={0.08} color={color.accentLight}>
          {label}
        </Txt>
        <Txt as="h1" size={14} weight={600} color={color.onPrimaryMuted2} style={{ marginTop: 2 }}>
          {d.seat.structure.name}
        </Txt>
      </div>
      {main ? (
        <div>
          <Txt size={12} color={color.onPrimaryMuted}>
            {main.label}
          </Txt>
          <Txt serif size={40} lh={1.05} color={color.onPrimary}>
            {main.value}
          </Txt>
          {main.hint ? (
            <Txt size={12} weight={600} color={color.accent}>
              {main.hint}
            </Txt>
          ) : null}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8 }}>
        {rest.slice(0, 2).map((k) => (
          <div key={k.label} style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 14, background: color.sidebarHover }}>
            <Txt size={11} color={color.onPrimaryMuted} clamp={1}>
              {k.label}
            </Txt>
            <Txt size={17} weight={700} color={color.onPrimary} clamp={1}>
              {k.value}
            </Txt>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Trois actions rapides : formulaire de l'application, ou page du back-office pour les tâches lourdes. */
function Actions({ seat, family }: { seat: AdminSeat; family: Family }) {
  const items: QuickAction[] = QUICK[family]
  return (
    <nav aria-label="Actions rapides" style={{ display: 'flex', gap: 8 }}>
      {items.map((a) => {
        const inner = (
          <>
            <span style={{ width: 48, height: 48, borderRadius: 24, background: color.primarySoft, color: color.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <a.icon size={21} aria-hidden />
            </span>
            <Txt as="span" size={11} weight={700} align="center" lh={1.25}>
              {a.label}
            </Txt>
          </>
        )
        const style = { flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6 }
        return a.backOffice ? (
          <a key={a.label} href={a.href(seat.assignmentId)} className="pwa-press" style={style}>
            {inner}
          </a>
        ) : (
          <Link key={a.label} href={a.href(seat.assignmentId)} className="pwa-press" style={style}>
            {inner}
          </Link>
        )
      })}
    </nav>
  )
}

/** Ligne « à traiter » avec son bouton en un geste ; une fois traitée, elle reste affichée avec son résultat. */
function TaskRow({ title, meta, cta, doneLabel, onDo, href, done }: { title: string; meta: string; cta: string; doneLabel: string; onDo?: () => Promise<unknown>; href?: string; done?: boolean }) {
  const toast = useToast()
  const [state, setState] = useState<'idle' | 'busy' | 'done'>(done ? 'done' : 'idle')
  const shownState = done ? 'done' : state
  async function run() {
    if (!onDo) return
    setState('busy')
    try {
      await onDo()
      setState('done')
      toast(`${doneLabel} : ${title}`)
    } catch (e) {
      setState('idle')
      toast(errorMessage(e), 'error')
    }
  }
  return (
    <div className="pwa-row" style={{ padding: '12px 0', gap: 12 }}>
      <span style={{ flex: 1, minWidth: 0, opacity: shownState === 'done' ? 0.55 : 1 }}>
        <Txt as="span" size={14} weight={700} lh={1.3} style={{ display: 'block' }}>
          {title}
        </Txt>
        {meta ? (
          <Txt as="span" size={12} color={color.textMuted} style={{ display: 'block', marginTop: 2 }}>
            {meta}
          </Txt>
        ) : null}
      </span>
      {shownState === 'done' ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: color.primary, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
          <Check size={13} weight="bold" aria-hidden />
          {doneLabel}
        </span>
      ) : onDo ? (
        <button type="button" className="pwa-btn primary" onClick={run} disabled={state === 'busy'} aria-busy={state === 'busy' || undefined} style={{ height: 36, fontSize: 13, padding: '0 14px' }}>
          {state === 'busy' ? <span className="pwa-spinner" style={{ width: 14, height: 14 }} aria-hidden /> : null}
          {cta}
        </button>
      ) : href ? (
        <a href={href} className="pwa-btn outline" style={{ height: 36, fontSize: 13, padding: '0 14px' }}>
          Ouvrir
        </a>
      ) : null}
    </div>
  )
}

function ListHead({ title, left }: { title: string; left: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Txt as="h2" serif size={24}>
        {title}
      </Txt>
      <Txt as="span" size={12} weight={700} color={color.textMuted}>
        {left} restant{left > 1 ? 's' : ''}
      </Txt>
    </div>
  )
}

function AllDone({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 16, background: color.primarySoft }}>
      <CheckCircle size={22} weight="fill" color={color.primary} aria-hidden />
      <Txt size={14}>{text}</Txt>
    </div>
  )
}

/** Pasteur, financier et responsables de structure : la file « À valider » du tableau de bord, bornée à leurs droits. */
function Queue({ seat, items, title }: { seat: AdminSeat; items: QueueItemDto[]; title: string }) {
  const qc = useQueryClient()
  // Un élément traité reste affiché avec son résultat (maquette), même quand la liste rechargée ne le contient plus
  const [handled, setHandled] = useState<QueueItemDto[]>([])
  const key = (it: QueueItemDto) => `${it.kind}-${it.id}`
  const shown = [...items, ...handled.filter((h) => !items.some((it) => key(it) === key(h)))]
  const doneKeys = new Set(handled.map(key))
  const left = shown.filter((it) => !doneKeys.has(key(it))).length
  const act = async (it: QueueItemDto) => {
    await decide(it, true)
    setHandled((h) => [...h, it])
    void qc.invalidateQueries({ queryKey: staffKeys.dashboard(seat.assignmentId) })
  }
  return (
    <section>
      <ListHead title={title} left={left} />
      {shown.length === 0 ? (
        <div style={{ marginTop: 8 }}>
          <AllDone text="Rien à traiter pour le moment." />
        </div>
      ) : (
        shown.map((it) => (
          <TaskRow
            key={key(it)}
            title={it.title}
            meta={it.meta}
            cta={CTA[it.kind].cta}
            doneLabel={CTA[it.kind].done}
            done={doneKeys.has(key(it))}
            // La requête ne part qu'au geste
            onDo={oneTap(it) ? () => act(it) : undefined}
            href={OPEN_HREF[it.kind](it.id)}
          />
        ))
      )}
    </section>
  )
}

type PubRow = { id: string; title: string; audience: string; status: string; statusLabel: string; author: { id: string; fullName: string } | null }

/** Communication : les brouillons partent au pasteur en un geste (« Soumettre »). */
function Drafts({ seat, queue }: { seat: AdminSeat; queue: QueueItemDto[] }) {
  const qc = useQueryClient()
  const drafts = useQuery({
    queryKey: ['app', 'staff', 'drafts', seat.structure.id],
    queryFn: () => api.get<{ items: PubRow[] }>('/admin/publications', { status: 'DRAFT', structureId: seat.structure.id }),
  })
  const returned = queue.filter((q) => q.kind === 'PUBLICATION')
  if (drafts.isPending) return <Loading minHeight={120} />
  if (drafts.isError) return <ErrorState error={drafts.error} onRetry={() => drafts.refetch()} />
  const rows = drafts.data.items
  return (
    <section>
      <ListHead title="Brouillons" left={rows.length + returned.length} />
      {rows.length + returned.length === 0 ? (
        <div style={{ marginTop: 8 }}>
          <AllDone text="Aucun brouillon. Touchez « Rédiger » pour préparer une annonce." />
        </div>
      ) : null}
      {returned.map((it) => (
        <TaskRow key={it.id} title={it.title} meta={it.meta} cta="Ouvrir" doneLabel="" href={OPEN_HREF.PUBLICATION(it.id)} />
      ))}
      {rows.map((p) => (
        <TaskRow
          key={p.id}
          title={p.title}
          meta={`${p.audience}${p.author ? ` · ${p.author.fullName}` : ''}`}
          cta="Soumettre"
          doneLabel="Envoyé au pasteur"
          onDo={() => api.post(`/admin/publications/${encodeURIComponent(p.id)}/submit`).then(() => qc.invalidateQueries({ queryKey: staffKeys.dashboard(seat.assignmentId) }))}
        />
      ))}
    </section>
  )
}

type ProjectRow = { id: string; title: string; status: string; statusLabel: string; progressPct: number; steps: Array<{ label: string; done: boolean }>; structure: { id: string; name: string }; can: { edit: boolean } }

/** Projet : les étapes du chantier se marquent « Terminé » en un geste. */
function ProjectSteps({ seat }: { seat: AdminSeat }) {
  const qc = useQueryClient()
  const projects = useQuery({
    queryKey: ['app', 'staff', 'projects', seat.assignmentId],
    queryFn: async () => {
      const mine = await api.get<{ items: ProjectRow[] }>('/admin/projects', { mine: '1', structureId: seat.structure.id })
      const list = mine.items.length ? mine.items : (await api.get<{ items: ProjectRow[] }>('/admin/projects', { structureId: seat.structure.id })).items
      const todo = (p: ProjectRow) => p.steps.filter((s) => !s.done).length
      // D'abord les chantiers qui ont des étapes à faire
      return list.filter((p) => !['COMPLETED', 'CLOSED'].includes(p.status)).sort((a, b) => Number(todo(b) > 0) - Number(todo(a) > 0))
    },
  })
  const [pick, setPick] = useState<string | null>(null)
  if (projects.isPending) return <Loading minHeight={120} />
  if (projects.isError) return <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
  const list = projects.data
  if (list.length === 0) return <Empty>Aucun projet en cours dans votre structure.</Empty>
  const p = list.find((x) => x.id === pick) ?? list[0]
  const left = p.steps.filter((s) => !s.done).length

  async function finish(i: number) {
    const steps = p.steps.map((s, k) => (k === i ? { ...s, done: true } : s))
    await api.put(`/admin/projects/${encodeURIComponent(p.id)}/steps`, { steps })
    await qc.invalidateQueries({ queryKey: ['app', 'staff', 'projects', seat.assignmentId] })
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.length > 1 ? (
        <ChipRow>
          {list.map((x) => (
            <Chip key={x.id} label={x.title} active={x.id === p.id} onClick={() => setPick(x.id)} />
          ))}
        </ChipRow>
      ) : null}
      <ListHead title="Étapes du chantier" left={left} />
      <Txt size={12} color={color.textMuted}>
        {p.title} · {p.statusLabel}
      </Txt>
      {p.steps.length === 0 ? <Empty>Les étapes de ce projet n’ont pas encore été définies (back-office, Projets).</Empty> : null}
      {p.steps.map((s, i) =>
        s.done ? (
          <TaskRow key={s.label} title={s.label} meta="" cta="" doneLabel="Terminé" done />
        ) : (
          <TaskRow key={s.label} title={s.label} meta="À faire" cta="Terminer" doneLabel="Terminé" onDo={p.can.edit ? () => finish(i) : undefined} />
        ),
      )}
    </section>
  )
}
