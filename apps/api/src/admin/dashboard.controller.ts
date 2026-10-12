import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import type { Module, Prisma } from '@prisma/client'
import { CHANNEL_LABEL, fmtFcfa, fmtInt, fmtMillions, fmtPct, type DashboardDto, type KpiDto, type QueueItemDto } from '@cepca/shared'
import { NotFound } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { CurrentUser } from '../auth/auth.guard'
import { ancestorPaths, type Action, type Assignment, type Principal } from '../access/access.service'
import { StaffGuard, toSeat } from './admin-common'
import { doualaYm, lastMonths, monthLabel, monthRange } from './period'
import { STATUS_LABEL as EVENT_STATUS } from './events.controller'
import { STATUS_LABEL as PROJECT_STATUS } from './projects.controller'
import { STATUS_LABEL as PUBLICATION_STATUS } from './publications.controller'

const GAP_AFTER_MS = 15 * 60 * 1000
const QUEUE_MAX = 8
const STRUCTURE_STATUS: Record<string, string> = { ACTIVE: 'Actif', CONFIGURATION: 'Configuration', VACANT: 'À pourvoir', SUSPENDED: 'Suspendu' }
// Rôles d'appui : un responsable de structure se cherche d'abord parmi les autres
const SUPPORT_ROLES = ['finance', 'project', 'communication', 'youth']

const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Africa/Douala' })
const plural = (s: string) => (/[sxz]$/i.test(s) ? s : `${s}s`)
const evolution = (now: number, before: number, prevLabel: string) =>
  before > 0 ? `${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 100)} % vs ${prevLabel}` : ''

/** Unité du graphique selon l'ordre de grandeur, comme la maquette (M FCFA, milliers FCFA). */
function scale(values: number[]): { unit: string; values: number[] } {
  const max = Math.max(0, ...values)
  if (max >= 1e6) return { unit: 'M FCFA', values: values.map((v) => Math.round(v / 1e4) / 100) }
  if (max >= 1e4) return { unit: 'milliers FCFA', values: values.map((v) => Math.round(v / 100) / 10) }
  return { unit: 'FCFA', values }
}

function has(a: Assignment, m: Module, action: Action, detailed = false) {
  const p = a.perms.get(m)
  return !!p && p[action] && !(detailed && p.aggregateOnly)
}

/**
 * Tableau de bord d'un mandat (maquette back-office) : 4 indicateurs, 6 mois de contributions,
 * file « À valider » bornée aux droits du mandat, tableau du niveau inférieur et journal récent.
 */
@Controller('admin/dashboard')
@UseGuards(StaffGuard)
export class AdminDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@CurrentUser() p: Principal, @Query('assignmentId') assignmentId?: string): Promise<DashboardDto> {
    const a = assignmentId ? p.assignments.find((x) => x.id === assignmentId) : p.assignments[0]
    if (!a) throw NotFound('Mandat')
    const s = await this.prisma.structure.findUniqueOrThrow({ where: { id: a.structureId }, select: { id: true, name: true, path: true, depth: true, levelType: { select: { isMembership: true } } } })
    const under = { path: { startsWith: s.path } }
    const months = lastMonths(6)
    const cur = months[5]
    const prev = months[4]

    const ancestors = await this.prisma.structure.findMany({ where: { path: { in: ancestorPaths(s.path) } }, select: { name: true, depth: true }, orderBy: { depth: 'asc' } })
    const ctx = { p, a, s, under, months, cur, prev }
    const family = a.roleKey === 'finance' ? 'finance' : a.roleKey === 'project' ? 'project' : a.roleKey === 'communication' ? 'communication' : 'structure'
    const body =
      family === 'finance' ? await this.finance(ctx) : family === 'project' ? await this.projects(ctx) : family === 'communication' ? await this.communication(ctx) : await this.structure(ctx)

    return {
      seat: toSeat(a),
      crumbs: ancestors.map((x) => x.name),
      scopeNote: body.scopeNote,
      kpis: body.kpis,
      chart: body.chart,
      queue: await this.queue(ctx),
      table: body.table,
      recentAudit: await this.recentAudit(p, a),
    }
  }

  // ── Sommes mensuelles ──

  private async monthly(where: Prisma.ContributionWhereInput, months: Ctx['months']) {
    return Promise.all(
      months.map(async (m) => (await this.prisma.contribution.aggregate({ where: { ...where, status: 'SUCCEEDED', confirmedAt: { gte: m.from, lt: m.to } }, _sum: { amount: true } }))._sum.amount ?? 0),
    )
  }

  private contributionsChart(title: string, values: number[], months: Ctx['months']) {
    const sc = scale(values)
    return { title, unit: sc.unit, months: months.map((m) => m.label), values: sc.values }
  }

  // ── Responsables de structure (CEPCA, confession, synode, consistoire, paroisse, chapelle) ──

  private async structure({ a, s, under, months, cur, prev }: Ctx): Promise<Body> {
    const money = has(a, 'CONTRIBUTIONS', 'read')
    const values = money ? await this.monthly({ structure: under }, months) : months.map(() => 0)
    const [now, before] = [values[5], values[4]]
    const moneyKpi: KpiDto = {
      label: `Contributions (${cur.label})`,
      value: fmtMillions(now) + ' FCFA',
      hint: s.depth === 0 ? 'Agrégé, toutes confessions' : evolution(now, before, prev.label),
    }
    const kids = await this.prisma.structure.findMany({ where: { parentId: s.id }, select: { id: true, name: true, path: true, status: true, levelType: { select: { name: true } } }, orderBy: { name: 'asc' } })
    const childLevel = kids[0]?.levelType.name ?? null
    const [members, fresh] = await Promise.all([
      this.prisma.membership.count({ where: { status: 'ACTIVE', structure: under } }),
      this.prisma.membership.count({ where: { status: 'ACTIVE', structure: under, validatedAt: { gte: cur.from, lt: cur.to } } }),
    ])
    const membersKpi: KpiDto = { label: s.levelType.isMembership ? 'Fidèles inscrits' : 'Fidèles', value: fmtInt(members), hint: fresh ? `+${fmtInt(fresh)} ce mois` : '' }
    let kpis: KpiDto[]
    let scopeNote: string

    if (s.levelType.isMembership) {
      // Paroisse, chapelle : la vie locale
      const [diaspora, events] = await Promise.all([
        this.prisma.membership.count({ where: { status: 'ACTIVE', structure: under, user: { residence: 'DIASPORA' } } }),
        this.prisma.event.findMany({ where: { structure: under, status: 'PUBLISHED', startsAt: { gte: cur.from, lt: cur.to } }, select: { _count: { select: { registrations: { where: { cancelledAt: null } } } } } }),
      ])
      const regs = events.reduce((t, e) => t + e._count.registrations, 0)
      kpis = [
        membersKpi,
        { label: 'Diaspora', value: fmtInt(diaspora), hint: members ? fmtPct((diaspora / members) * 100, 0) : '' },
        ...(money ? [moneyKpi] : []),
        { label: 'Activités ce mois', value: fmtInt(events.length), hint: regs ? `${fmtInt(regs)} inscription${regs > 1 ? 's' : ''}` : '' },
      ]
      scopeNote = kids.length ? `${s.name} · ${kids.length} ${plural(childLevel ?? '').toLowerCase()} rattachée${kids.length > 1 ? 's' : ''}.` : `${s.name}.`
    } else {
      const configuring = kids.filter((k) => k.status !== 'ACTIVE').length
      const [activeProjects, toValidate] = await Promise.all([
        this.prisma.project.count({ where: { structure: under, status: { in: ['VALIDATED', 'FUNDING', 'EXECUTION'] } } }),
        this.prisma.project.count({ where: { structure: under, status: { in: ['PROPOSED', 'STUDY'] }, validatedAt: null } }),
      ])
      kpis = [
        { label: s.depth === 0 ? 'Confessions actives' : plural(childLevel ?? 'Structure'), value: fmtInt(s.depth === 0 ? kids.length - configuring : kids.length), hint: configuring ? `${configuring} en configuration` : '' },
        membersKpi,
        ...(money ? [moneyKpi] : []),
        { label: s.depth === 0 ? 'Projets en cours' : 'Projets actifs', value: fmtInt(activeProjects), hint: toValidate ? `${toValidate} à valider` : '' },
      ]
      scopeNote = s.depth === 0 ? 'Vue agrégée des confessions membres. Les données détaillées restent isolées par confession.' : `${s.name} · ${await this.descendantsNote(s)}.`
    }

    let table: Body['table']
    if (kids.length && !s.levelType.isMembership) {
      const leaders = await this.leaders(kids.map((k) => k.id))
      const rows = await Promise.all(
        kids.slice(0, 12).map(async (k) => {
          const kUnder = { path: { startsWith: k.path } }
          const [m, c] = await Promise.all([
            this.prisma.membership.count({ where: { status: 'ACTIVE', structure: kUnder } }),
            money ? this.prisma.contribution.aggregate({ where: { structure: kUnder, status: 'SUCCEEDED', confirmedAt: { gte: cur.from, lt: cur.to } }, _sum: { amount: true } }) : null,
          ])
          const leader = leaders.get(k.id)
          const status = k.status === 'ACTIVE' && !leader ? 'À pourvoir' : STRUCTURE_STATUS[k.status]
          return { id: k.id, cells: [k.name, leader ?? 'Poste vacant', fmtInt(m), ...(c ? [fmtMillions(c._sum.amount ?? 0)] : [])], status }
        }),
      )
      table = { title: plural(childLevel ?? 'Structure'), columns: [childLevel ?? 'Structure', 'Responsable', 'Fidèles', ...(money ? [`Contributions (${cur.label})`] : [])], rows }
    } else {
      const evs = await this.prisma.event.findMany({
        where: { structure: under, status: { in: ['DRAFT', 'PUBLISHED'] }, startsAt: { gte: new Date() } },
        select: { id: true, title: true, responsible: true, startsAt: true, status: true },
        orderBy: { startsAt: 'asc' },
        take: 6,
      })
      table = { title: 'Prochaines activités', columns: ['Activité', 'Responsable', 'Date', 'Statut'], rows: evs.map((e) => ({ id: e.id, cells: [e.title, e.responsible ?? '—', dayFmt.format(e.startsAt), EVENT_STATUS[e.status]], status: EVENT_STATUS[e.status] })) }
    }

    // Sans accès aux contributions, le graphique suit les nouveaux fidèles
    const chart = money
      ? this.contributionsChart(s.depth === 0 ? 'Contributions agrégées' : `Contributions · ${s.name}`, values, months)
      : {
          title: `Nouveaux fidèles · ${s.name}`,
          unit: 'fidèles',
          months: months.map((m) => m.label),
          values: await Promise.all(months.map((m) => this.prisma.membership.count({ where: { status: 'ACTIVE', structure: under, validatedAt: { gte: m.from, lt: m.to } } }))),
        }
    return { kpis, scopeNote, table, chart }
  }

  /** « 6 synodes, 41 consistoires, 612 paroisses » */
  private async descendantsNote(s: { id: string; path: string; depth: number }) {
    const rows = await this.prisma.structure.groupBy({ by: ['levelTypeId', 'depth'], where: { path: { startsWith: s.path }, depth: { gt: s.depth } }, _count: true, orderBy: { depth: 'asc' } })
    const levels = await this.prisma.levelType.findMany({ where: { id: { in: rows.map((r) => r.levelTypeId) } }, select: { id: true, name: true } })
    const name = new Map(levels.map((l) => [l.id, l.name]))
    const byLevel = new Map<string, number>()
    for (const r of rows) byLevel.set(r.levelTypeId, (byLevel.get(r.levelTypeId) ?? 0) + r._count)
    return [...byLevel].map(([id, n]) => `${fmtInt(n)} ${(n > 1 ? plural(name.get(id) ?? '') : name.get(id) ?? '').toLowerCase()}`).join(', ') || 'aucune structure rattachée'
  }

  /** Responsable affiché par structure : un rôle de direction de préférence à un rôle d'appui. */
  private async leaders(structureIds: string[]) {
    const now = new Date()
    const rows = await this.prisma.roleAssignment.findMany({
      where: { structureId: { in: structureIds }, revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      select: { structureId: true, user: { select: { fullName: true } }, role: { select: { key: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const out = new Map<string, string>()
    for (const r of [...rows].sort((x, y) => Number(SUPPORT_ROLES.includes(x.role.key)) - Number(SUPPORT_ROLES.includes(y.role.key)))) {
      if (!out.has(r.structureId)) out.set(r.structureId, r.user.fullName)
    }
    return out
  }

  // ── Responsable financier ──

  private async finance({ s, under, months, cur, prev }: Ctx): Promise<Body> {
    const values = await this.monthly({ structure: under }, months)
    const ids = (await this.prisma.structure.findMany({ where: under, select: { id: true } })).map((x) => x.id)
    const [ok, failed, gaps, plans, diasporaPlans, last] = await Promise.all([
      this.prisma.contribution.count({ where: { structure: under, status: 'SUCCEEDED', confirmedAt: { gte: cur.from, lt: cur.to } } }),
      this.prisma.contribution.count({ where: { structure: under, status: { in: ['FAILED', 'CANCELLED'] }, createdAt: { gte: cur.from, lt: cur.to } } }),
      this.prisma.contribution.count({ where: { structure: under, status: 'PENDING', createdAt: { lt: new Date(Date.now() - GAP_AFTER_MS) } } }),
      this.prisma.recurringPlan.count({ where: { structureId: { in: ids }, status: 'ACTIVE' } }),
      this.prisma.recurringPlan.count({ where: { structureId: { in: ids }, status: 'ACTIVE', user: { residence: 'DIASPORA' } } }),
      this.prisma.contribution.findMany({
        where: { structure: under },
        select: { id: true, amount: true, status: true, payerLabel: true, manualEntryById: true, user: { select: { fullName: true } }, type: { select: { label: true } }, project: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
    ])
    const STATUS: Record<string, string> = { SUCCEEDED: 'Réussi', PENDING: 'En attente', FAILED: 'Échec', CANCELLED: 'Annulé', REFUNDED: 'Remboursé', CREATED: 'En attente' }
    return {
      scopeNote: `Contributions · ${s.name} et structures rattachées.`,
      kpis: [
        { label: `Collecté (${cur.label})`, value: fmtMillions(values[5]) + ' FCFA', hint: evolution(values[5], values[4], prev.label) },
        { label: 'Transactions', value: fmtInt(ok), hint: ok + failed ? `${fmtPct((ok / (ok + failed)) * 100)} réussies` : '' },
        { label: 'Écarts à rapprocher', value: fmtInt(gaps), hint: gaps ? 'Sans réponse de l’opérateur' : '' },
        { label: 'Récurrentes actives', value: fmtInt(plans), hint: diasporaPlans ? `Dont ${fmtInt(diasporaPlans)} diaspora` : '' },
      ],
      chart: this.contributionsChart('Collecte mensuelle', values, months),
      table: {
        title: 'Dernières contributions',
        columns: ['Fidèle', 'Type', 'Montant', 'Statut'],
        rows: last.map((c) => {
          const status = c.manualEntryById ? 'Saisie manuelle' : STATUS[c.status]
          return { id: c.id, cells: [c.user?.fullName ?? c.payerLabel ?? 'Anonyme', c.project ? `${c.type.label} · ${c.project.title}` : c.type.label, fmtInt(c.amount), status], status }
        }),
      },
    }
  }

  // ── Responsable projet ──

  private async projects({ p, under, months }: Ctx): Promise<Body> {
    const mine = await this.prisma.project.findMany({ where: { structure: under, responsibleId: p.userId }, orderBy: { createdAt: 'desc' } })
    // Sans projet nommé à son nom, le responsable voit les projets de sa structure
    const list = mine.length ? mine : await this.prisma.project.findMany({ where: { structure: under, status: { not: 'CLOSED' } }, orderBy: { createdAt: 'desc' }, take: 20 })
    const now = new Date()
    const late = list.filter((x) => x.endsAt && x.endsAt < now && !['COMPLETED', 'CLOSED'].includes(x.status)).length
    const raised = list.reduce((t, x) => t + x.raisedAmount, 0)
    const goal = list.reduce((t, x) => t + (x.goalAmount ?? 0), 0)
    const ids = list.map((x) => x.id)
    const [values, diaspora] = await Promise.all([
      this.monthly({ projectId: { in: ids } }, months),
      this.prisma.contribution.findMany({ where: { projectId: { in: ids }, status: 'SUCCEEDED', user: { residence: 'DIASPORA' } }, distinct: ['userId'], select: { userId: true } }),
    ])
    const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric', timeZone: 'Africa/Douala' })
    return {
      scopeNote: mine.length ? 'Projets dont vous êtes responsable.' : 'Projets de votre structure.',
      kpis: [
        { label: 'Projets suivis', value: fmtInt(list.length), hint: late ? `${late} en retard` : '' },
        { label: 'Mobilisé', value: fmtMillions(raised) + ' FCFA', hint: goal ? `Sur ${fmtMillions(goal)} visés` : '' },
        { label: 'Contributeurs', value: fmtInt(list.reduce((t, x) => t + x.contributorCount, 0)), hint: diaspora.length ? `Dont ${fmtInt(diaspora.length)} diaspora` : '' },
        { label: 'Achevés', value: fmtInt(list.filter((x) => x.status === 'COMPLETED').length), hint: '' },
      ],
      chart: this.contributionsChart(list.length === 1 ? `Mobilisation · ${list[0].title}` : 'Mobilisation des projets', values, months),
      table: {
        title: mine.length ? 'Mes projets' : 'Projets',
        columns: ['Projet', 'Échéance', 'Mobilisé', 'Statut'],
        rows: list.slice(0, 8).map((x) => ({
          id: x.id,
          cells: [x.title, x.endLabel ?? (x.endsAt ? monthFmt.format(x.endsAt) : '—'), x.goalAmount ? fmtPct(Math.min(100, (x.raisedAmount / x.goalAmount) * 100), 0) : fmtMillions(x.raisedAmount), PROJECT_STATUS[x.status]],
          status: PROJECT_STATUS[x.status],
        })),
      },
    }
  }

  // ── Responsable communication ──

  private async communication({ s, under, months, cur, prev }: Ctx): Promise<Body> {
    const published = { target: under, status: { in: ['PUBLISHED', 'ARCHIVED'] } } satisfies Prisma.PublicationWhereInput
    const [nowPubs, beforePubs, campaigns, sermons, recent, reads] = await Promise.all([
      this.prisma.publication.aggregate({ where: { ...published, publishedAt: { gte: cur.from, lt: cur.to } }, _count: true, _sum: { readCount: true } }),
      this.prisma.publication.count({ where: { ...published, publishedAt: { gte: prev.from, lt: prev.to } } }),
      this.prisma.notificationCampaign.aggregate({
        where: { targetStructureId: { in: (await this.prisma.structure.findMany({ where: under, select: { id: true } })).map((x) => x.id) }, status: 'SENT', sentAt: { gte: cur.from, lt: cur.to } },
        _count: true,
        _sum: { recipients: true, opened: true },
      }),
      this.prisma.spiritualContent.aggregate({ where: { structure: under, status: 'PUBLISHED' }, _count: true, _sum: { playCount: true } }),
      this.prisma.publication.findMany({
        where: { target: under },
        select: { id: true, title: true, status: true, readCount: true, target: { select: { name: true } }, group: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      Promise.all(months.map((m) => this.prisma.publicationRead.count({ where: { publication: { target: under }, readAt: { gte: m.from, lt: m.to } } }))),
    ])
    const readsNow = nowPubs._sum.readCount ?? 0
    const sent = campaigns._sum.recipients ?? 0
    const diff = nowPubs._count - beforePubs
    return {
      scopeNote: `Publications et notifications · ${s.name}.`,
      kpis: [
        { label: `Publications (${cur.label})`, value: fmtInt(nowPubs._count), hint: beforePubs || nowPubs._count ? `${diff >= 0 ? '+' : ''}${diff} vs ${prev.label}` : '' },
        { label: 'Lectures', value: fmtInt(readsNow), hint: nowPubs._count ? `Moyenne ${fmtInt(readsNow / nowPubs._count)} par article` : '' },
        { label: 'Notifications envoyées', value: fmtInt(campaigns._count), hint: sent ? `Taux d’ouverture ${fmtPct(((campaigns._sum.opened ?? 0) / sent) * 100, 0)}` : '' },
        { label: 'Prédications en ligne', value: fmtInt(sermons._count), hint: sermons._sum.playCount ? `${fmtInt(sermons._sum.playCount)} écoutes` : '' },
      ],
      chart: { title: 'Lectures des publications', unit: 'lectures', months: months.map((m) => m.label), values: reads },
      table: {
        title: 'Publications récentes',
        columns: ['Titre', 'Audience', 'Lectures', 'Statut'],
        rows: recent.map((x) => ({
          id: x.id,
          cells: [x.title, x.group?.name ?? x.target.name, x.status === 'PUBLISHED' || x.status === 'ARCHIVED' ? fmtInt(x.readCount) : '—', PUBLICATION_STATUS[x.status]],
          status: PUBLICATION_STATUS[x.status],
        })),
      },
    }
  }

  // ── File « À valider » : uniquement ce que ce mandat peut trancher ──

  private async queue({ p, a, s, under }: Ctx): Promise<QueueItemDto[]> {
    const q: QueueItemDto[] = []
    const take = 5
    const tasks: Array<Promise<void>> = []

    if (has(a, 'MEMBERS', 'validate', true)) {
      tasks.push(
        this.prisma.membership
          .findMany({ where: { status: 'PENDING', structure: under }, select: { id: true, requestedAt: true, structure: { select: { name: true } }, user: { select: { fullName: true, residence: true } } }, orderBy: { requestedAt: 'asc' }, take })
          .then((rows) => {
            for (const m of rows) q.push({ kind: 'MEMBERSHIP', id: m.id, title: `Inscription : ${m.user.fullName}`, meta: `${m.user.residence === 'DIASPORA' ? 'Diaspora' : m.structure.name} · ${dayFmt.format(m.requestedAt)}`, actions: ['approve', 'reject'] })
          }),
      )
    }
    if (has(a, 'NEWS', 'validate')) {
      tasks.push(
        this.prisma.publication
          .findMany({ where: { status: 'SUBMITTED', target: under }, select: { id: true, title: true, updatedAt: true, target: { select: { name: true } }, author: { select: { fullName: true } } }, orderBy: { updatedAt: 'asc' }, take })
          .then((rows) => {
            for (const x of rows) q.push({ kind: 'PUBLICATION', id: x.id, title: `Publication : ${x.title}`, meta: `${x.author.fullName} · ${x.target.name}`, actions: ['approve', 'open'] })
          }),
      )
    } else if (has(a, 'NEWS', 'write')) {
      // L'auteur voit ce qu'on lui a renvoyé
      tasks.push(
        this.prisma.publication.findMany({ where: { status: 'RETURNED', authorId: p.userId, target: under }, select: { id: true, title: true, returnNote: true }, take }).then((rows) => {
          for (const x of rows) q.push({ kind: 'PUBLICATION', id: x.id, title: `Renvoyée : ${x.title}`, meta: x.returnNote ?? 'À revoir', actions: ['open'] })
        }),
      )
    }
    if (has(a, 'SERMONS', 'validate')) {
      tasks.push(
        this.prisma.spiritualContent.findMany({ where: { status: 'SUBMITTED', structure: under }, select: { id: true, title: true, durationSec: true, structure: { select: { name: true } } }, take }).then((rows) => {
          for (const x of rows) q.push({ kind: 'SERMON', id: x.id, title: `Prédication : « ${x.title} »`, meta: `${x.durationSec ? `${Math.round(x.durationSec / 60)} min · ` : ''}${x.structure.name}`, actions: ['approve', 'open'] })
        }),
      )
    }
    if (has(a, 'PROJECTS', 'validate')) {
      tasks.push(
        this.prisma.project
          .findMany({ where: { structure: under, status: { in: ['PROPOSED', 'STUDY'] }, validatedAt: null }, select: { id: true, title: true, budget: true, structure: { select: { name: true } } }, orderBy: { createdAt: 'asc' }, take })
          .then((rows) => {
            for (const x of rows) q.push({ kind: 'PROJECT', id: x.id, title: `Projet : ${x.title}`, meta: `${x.structure.name}${x.budget ? ` · ${fmtMillions(x.budget)} FCFA` : ''}`, actions: ['approve', 'open'] })
          }),
      )
    }
    if (has(a, 'CONTRIBUTIONS', 'validate', true)) {
      tasks.push(
        this.prisma.refund
          .findMany({ where: { status: 'REQUESTED', requestedById: { not: p.userId }, contribution: { structure: under } }, select: { id: true, amount: true, reason: true, contribution: { select: { receiptNumber: true } } }, take })
          .then((rows) => {
            for (const r of rows) q.push({ kind: 'REFUND', id: r.id, title: `Remboursement : ${fmtFcfa(r.amount)}`, meta: `${r.contribution.receiptNumber ?? ''} · ${r.reason}`, actions: ['approve', 'reject'] })
          }),
      )
      tasks.push(this.closingItem(s, under).then((x) => void (x && q.push(x))))
    }
    if (has(a, 'CONTRIBUTIONS', 'write', true)) {
      tasks.push(
        this.prisma.contribution
          .findMany({
            where: { structure: under, status: 'PENDING', createdAt: { lt: new Date(Date.now() - GAP_AFTER_MS) } },
            select: { id: true, amount: true, channel: true, createdAt: true, transactions: { orderBy: { requestedAt: 'desc' }, take: 1, select: { providerRef: true } } },
            orderBy: { createdAt: 'asc' },
            take,
          })
          .then((rows) => {
            for (const c of rows) {
              const ref = c.transactions[0]?.providerRef
              q.push({ kind: 'PAYMENT', id: c.id, title: `Écart : ${CHANNEL_LABEL[c.channel] ?? c.channel} ${fmtFcfa(c.amount)} non confirmé`, meta: `${ref ? `Réf. ${ref} · ` : ''}${dayFmt.format(c.createdAt)}`, actions: ['open'] })
            }
          }),
      )
    }
    await Promise.all(tasks)
    const order: QueueItemDto['kind'][] = ['PAYMENT', 'REFUND', 'CLOSING', 'MEMBERSHIP', 'PUBLICATION', 'SERMON', 'PROJECT']
    return q.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind)).slice(0, QUEUE_MAX)
  }

  /** Le mois précédent n'est pas clôturé pour cette structure (ni par un niveau supérieur). */
  private async closingItem(s: Ctx['s'], under: Ctx['under']): Promise<QueueItemDto | null> {
    const { year, month } = doualaYm(new Date())
    const pm = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
    const ancestors = await this.prisma.structure.findMany({ where: { path: { in: ancestorPaths(s.path) } }, select: { id: true } })
    if (await this.prisma.periodClosing.findFirst({ where: { ...pm, structureId: { in: ancestors.map((x) => x.id) } } })) return null
    const { from, to } = monthRange(pm.year, pm.month)
    const agg = await this.prisma.contribution.aggregate({ where: { structure: under, status: 'SUCCEEDED', confirmedAt: { gte: from, lt: to } }, _sum: { amount: true }, _count: true })
    if (agg._count === 0) return null
    return { kind: 'CLOSING', id: `${s.id}:${pm.year}-${pm.month}`, title: `Clôture du mois de ${monthLabel(pm.month)}`, meta: `${fmtInt(agg._count)} transactions · ${fmtFcfa(agg._sum.amount ?? 0)}`, actions: ['open'] }
  }

  /** Journal du périmètre si le mandat le lit, sinon ses propres actions. */
  private async recentAudit(p: Principal, a: Assignment) {
    const where: Prisma.AuditLogWhereInput = has(a, 'AUDIT', 'read')
      ? a.structurePath === '/cepca/'
        ? {}
        : { OR: [{ structurePath: { startsWith: a.structurePath } }, { actorId: p.userId }] }
      : { actorId: p.userId }
    const rows = await this.prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, take: 6, select: { at: true, actorLabel: true, action: true } })
    return rows.map((r) => ({ at: r.at.toISOString(), actor: r.actorLabel, action: r.action }))
  }
}

type Ctx = {
  p: Principal
  a: Assignment
  s: { id: string; name: string; path: string; depth: number; levelType: { isMembership: boolean } }
  under: { path: { startsWith: string } }
  months: ReturnType<typeof lastMonths>
  cur: ReturnType<typeof lastMonths>[number]
  prev: ReturnType<typeof lastMonths>[number]
}
type Body = Pick<DashboardDto, 'scopeNote' | 'kpis' | 'chart' | 'table'>
