// Parcours 3 — compléments de l'app des fidèles (maquette 3) : ma chapelle, groupes, « Je participe »,
// bénévolat sur les projets et actions sociales, mon engagement, recherche.
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  TZ_DOUALA,
  dayMonth,
  displayName,
  fmtPct,
  pct,
  searchSchema,
  volunteerSchema,
  type ChurchDto,
  type EngagementDto,
  type GroupDto,
  type SearchResultDto,
  type VolunteerDto,
  type WeekDay,
} from '@cepca/shared'
import { AppError, NotFound, OptionalAuth, Public, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { CurrentUser, MaybeUser } from '../auth/auth.guard'
import { ancestorPaths, type Principal } from '../access/access.service'
import { mediaUrl } from '../storage/storage.service'
import { MemberContextService, type MemberContext } from './member-context.service'
import { projectInclude, toProject } from './dto'

// Statuts où un projet accepte encore de l'aide (dons ou bénévoles)
const OPEN_PROJECT: Prisma.ProjectWhereInput['status'] = { in: ['VALIDATED', 'FUNDING', 'EXECUTION'] }
// Statuts montrés aux fidèles, comme la liste des projets du fil
const VISIBLE_PROJECT: Prisma.ProjectWhereInput['status'] = { in: ['VALIDATED', 'FUNDING', 'EXECUTION', 'COMPLETED'] }

const DAY_OF: Record<string, WeekDay> = { Mon: 'lun', Tue: 'mar', Wed: 'mer', Thu: 'jeu', Fri: 'ven', Sat: 'sam', Sun: 'dim' }
const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TZ_DOUALA })
const yearFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: TZ_DOUALA })

/** Jour de la semaine à Douala : un culte du dimanche 23 h UTC reste… un lundi à Douala. */
const weekdayIn = (d: Date): WeekDay => DAY_OF[weekdayFmt.format(d)]

/** 1er janvier 00:00, heure de Douala (UTC+1, sans heure d'été) */
function yearStart(now: Date): { year: number; from: Date; to: Date } {
  const year = Number(yearFmt.format(now))
  return { year, from: new Date(Date.UTC(year, 0, 1, -1)), to: new Date(Date.UTC(year + 1, 0, 1, -1)) }
}

function minutes(sec: number | null): string | null {
  return sec ? `${Math.max(1, Math.round(sec / 60))} min` : null
}

/** Disponibilités stockées en { days: [...] } ; une ancienne forme ({ lun: [...] }) est lue par ses clés. */
function readDays(availability: Prisma.JsonValue | undefined): WeekDay[] {
  if (!availability || typeof availability !== 'object' || Array.isArray(availability)) return []
  const a = availability as Record<string, unknown>
  const raw = Array.isArray(a.days) ? a.days : Object.keys(a)
  const valid = new Set(Object.values(DAY_OF))
  return raw.filter((d): d is WeekDay => typeof d === 'string' && valid.has(d as WeekDay))
}

@Controller()
export class EngagementController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: MemberContextService,
  ) {}

  /** Un rattachement validé est exigé pour s'engager : en attente, le fidèle n'est pas encore connu de la paroisse. */
  private async activeContext(p: Principal): Promise<MemberContext> {
    const c = await this.ctx.forPrincipal(p)
    if (c.status !== 'ACTIVE') throw new AppError(403, 'MEMBERSHIP_PENDING', 'Votre rattachement doit d’abord être validé par votre paroisse.')
    return c
  }

  // ── Ma chapelle ──

  @Get('me/church')
  async church(@CurrentUser() p: Principal): Promise<ChurchDto> {
    const m = p.membership
    if (!m) throw new AppError(404, 'NO_MEMBERSHIP', 'Vous n’êtes rattaché(e) à aucune Église.')
    const now = new Date()
    const [chain, own, leaders] = await Promise.all([
      this.prisma.structure.findMany({
        where: { path: { in: ancestorPaths(m.path) }, levelType: { rank: { gte: 1 } } },
        select: { id: true, name: true, levelType: { select: { key: true, name: true } } },
        orderBy: { depth: 'asc' },
      }),
      this.prisma.structure.findUniqueOrThrow({ where: { id: m.structureId }, select: { id: true, name: true, address: true, city: true, phone: true, serviceSchedule: true, levelType: { select: { key: true, name: true } } } }),
      this.prisma.roleAssignment.findMany({
        where: { structureId: m.structureId, revokedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], role: { key: { not: 'member' } } },
        select: { title: true, user: { select: { fullName: true } }, role: { select: { label: true } } },
        orderBy: { startsAt: 'asc' },
      }),
    ])
    const ref = (s: { id: string; name: string; levelType: { key: string; name: string } }) => ({ id: s.id, name: s.name, level: s.levelType.name, levelKey: s.levelType.key })
    return {
      status: m.status === 'ACTIVE' ? 'ACTIVE' : m.status === 'TO_VERIFY' ? 'TO_VERIFY' : 'PENDING',
      hierarchy: chain.map(ref),
      structure: { ...ref(own), address: own.address, city: own.city, phone: own.phone, serviceSchedule: own.serviceSchedule },
      leaders: leaders.map((l) => ({ name: displayName(l.user.fullName, l.title), title: l.title ?? l.role.label })),
    }
  }

  // ── Groupes ──

  /** Groupes de la communauté : la paroisse et ses chapelles (le fidèle d'une chapelle voit ceux de sa paroisse). */
  private groupWhere(c: MemberContext): Prisma.GroupWhereInput | null {
    if (!c.communityPath || !c.confessionId) return null
    return { confessionId: c.confessionId, structure: { path: { startsWith: c.communityPath } } }
  }

  @Get('groups')
  async groups(@CurrentUser() p: Principal): Promise<GroupDto[]> {
    const c = await this.ctx.forPrincipal(p)
    const where = this.groupWhere(c)
    if (!where) return []
    const rows = await this.prisma.group.findMany({
      where,
      include: {
        structure: { select: { name: true } },
        _count: { select: { members: { where: { status: 'ACTIVE' } } } },
        members: { where: { userId: p.userId }, select: { status: true } },
      },
      orderBy: [{ structure: { depth: 'asc' } }, { name: 'asc' }],
    })
    return rows.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind,
      description: g.description,
      structure: g.structure.name,
      memberCount: g._count.members,
      openToJoin: g.openToJoin,
      myStatus: g.members[0]?.status ?? null,
    }))
  }

  /** Demande d'adhésion : le responsable valide (maquette « Le responsable valide votre demande »). */
  @Post('groups/:id/join')
  @HttpCode(200)
  async join(@CurrentUser() p: Principal, @Param('id') id: string): Promise<{ myStatus: 'PENDING' | 'ACTIVE' }> {
    const c = await this.activeContext(p)
    const g = await this.prisma.group.findFirst({ where: { id, ...this.groupWhere(c) }, select: { id: true, openToJoin: true } })
    if (!g) throw NotFound('Groupe')
    if (!g.openToJoin) throw new AppError(403, 'GROUP_CLOSED', 'Ce groupe n’accepte pas de demande depuis l’application. Adressez-vous à son responsable.')
    // Une demande déjà faite (ou une adhésion validée) n'est pas réinitialisée par un second appui
    await this.prisma.groupMember.createMany({ data: [{ groupId: id, userId: p.userId }], skipDuplicates: true })
    const m = await this.prisma.groupMember.findUniqueOrThrow({ where: { groupId_userId: { groupId: id, userId: p.userId } }, select: { status: true } })
    return { myStatus: m.status }
  }

  /** Retrait du groupe ou annulation de la demande. */
  @Delete('groups/:id/membership')
  async leave(@CurrentUser() p: Principal, @Param('id') id: string): Promise<{ myStatus: null }> {
    await this.prisma.groupMember.deleteMany({ where: { groupId: id, userId: p.userId } })
    return { myStatus: null }
  }

  // ── Je participe ──

  private async volunteerDto(p: Principal, profile: { skills: string[]; availability: Prisma.JsonValue; updatedAt: Date } | null): Promise<VolunteerDto> {
    const days = readDays(profile?.availability)
    let openActivities = 0
    if (days.length) {
      const c = await this.ctx.forPrincipal(p)
      const now = new Date()
      const events = await this.prisma.event.findMany({
        where: {
          status: 'PUBLISHED',
          registrationOpen: true,
          startsAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) },
          structure: { path: { in: c.visiblePaths } },
          ...(c.status !== 'ACTIVE' ? { isPublic: true } : {}),
        },
        select: { startsAt: true },
      })
      const wanted = new Set(days)
      openActivities = events.filter((e) => wanted.has(weekdayIn(e.startsAt))).length
    }
    return { skills: profile?.skills ?? [], days, updatedAt: profile?.updatedAt.toISOString() ?? null, openActivities }
  }

  @Get('me/volunteer')
  async volunteer(@CurrentUser() p: Principal): Promise<VolunteerDto> {
    const profile = await this.prisma.volunteerProfile.findUnique({ where: { userId: p.userId } })
    return this.volunteerDto(p, profile)
  }

  @Put('me/volunteer')
  async saveVolunteer(@CurrentUser() p: Principal, @Body(new ZodPipe(volunteerSchema)) body: z.infer<typeof volunteerSchema>): Promise<VolunteerDto> {
    const data = { skills: [...new Set(body.skills)], availability: { days: [...new Set(body.days)] } }
    const profile = await this.prisma.volunteerProfile.upsert({ where: { userId: p.userId }, create: { userId: p.userId, ...data }, update: data })
    return this.volunteerDto(p, profile)
  }

  // ── Bénévolat sur un projet ou une action sociale (« Je donne du temps ») ──

  @Get('me/volunteering')
  async volunteering(@CurrentUser() p: Principal): Promise<string[]> {
    const rows = await this.prisma.projectVolunteer.findMany({ where: { userId: p.userId }, select: { projectId: true } })
    return rows.map((r) => r.projectId)
  }

  @Post('projects/:id/volunteer')
  @HttpCode(200)
  async offerTime(@CurrentUser() p: Principal, @Param('id') id: string): Promise<{ volunteer: boolean }> {
    const c = await this.activeContext(p)
    const project = await this.prisma.project.findFirst({ where: { id, ...this.ctx.projectWhere(c), status: OPEN_PROJECT }, select: { id: true } })
    if (!project) throw NotFound('Projet')
    await this.prisma.projectVolunteer.createMany({ data: [{ projectId: id, userId: p.userId }], skipDuplicates: true })
    return { volunteer: true }
  }

  @Delete('projects/:id/volunteer')
  async withdrawTime(@CurrentUser() p: Principal, @Param('id') id: string): Promise<{ volunteer: boolean }> {
    await this.prisma.projectVolunteer.deleteMany({ where: { projectId: id, userId: p.userId } })
    return { volunteer: false }
  }

  // ── Mon engagement ──

  /** Projets soutenus cette année (dons réussis) ou pour lesquels le fidèle s'est proposé comme bénévole. */
  @Get('me/engagement')
  async engagement(@CurrentUser() p: Principal): Promise<EngagementDto> {
    const { year, from, to } = yearStart(new Date())
    const [given, volunteering] = await Promise.all([
      this.prisma.contribution.groupBy({
        by: ['projectId'],
        where: { userId: p.userId, status: 'SUCCEEDED', projectId: { not: null }, confirmedAt: { gte: from, lt: to } },
        _sum: { amount: true },
      }),
      this.prisma.projectVolunteer.findMany({ where: { userId: p.userId }, select: { projectId: true } }),
    ])
    const byProject = new Map(given.map((g) => [g.projectId!, g._sum.amount ?? 0]))
    const mine = new Set(volunteering.map((v) => v.projectId))
    const ids = [...new Set([...byProject.keys(), ...mine])]
    const projects = ids.length ? await this.prisma.project.findMany({ where: { id: { in: ids } }, include: projectInclude }) : []
    const items = projects
      .map((pr) => ({ project: toProject(pr), given: byProject.get(pr.id) ?? 0, volunteer: mine.has(pr.id) }))
      .sort((a, b) => b.given - a.given || a.project.title.localeCompare(b.project.title, 'fr'))
    return { year, givenThisYear: items.reduce((s, x) => s + x.given, 0), projects: items }
  }
}

// Colonnes cherchées par table. Liste fermée : ces noms entrent dans le SQL sans passer par un paramètre.
const SEARCH_COLUMNS = {
  SpiritualContent: ['title', 'speaker', 'scriptureRef'],
  Structure: ['name', 'city'],
  Project: ['title', 'location'],
  Event: ['title', 'place'],
  Document: ['title', 'category'],
} as const

/** « 100% » cherche le texte « 100% », pas « 100 suivi de n'importe quoi » */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`

/** Recherche globale de l'app : mêmes règles de visibilité que le fil (§14). */
@Controller('feed')
@Public()
@OptionalAuth()
export class SearchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: MemberContextService,
  ) {}

  /**
   * Présélection sans tenir compte des accents ni de la casse (« deido » trouve « Deïdo ») : Prisma ne sait pas
   * appeler unaccent, la présélection se fait donc en SQL, puis les filtres de visibilité s'appliquent en Prisma.
   */
  private async matching(table: keyof typeof SEARCH_COLUMNS, q: string): Promise<string[]> {
    const pattern = likePattern(q)
    const ors = Prisma.join(
      SEARCH_COLUMNS[table].map((col) => Prisma.sql`unaccent(coalesce(${Prisma.raw(`"${col}"`)}, '')) ILIKE unaccent(${pattern})`),
      ' OR ',
    )
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE ${ors} LIMIT 500`
    return rows.map((r) => r.id)
  }

  @Get('search')
  async search(@MaybeUser() p: Principal | null, @Query(new ZodPipe(searchSchema)) q: z.infer<typeof searchSchema>): Promise<SearchResultDto[]> {
    const c = await this.ctx.forPrincipal(p)
    const ids = async (table: keyof typeof SEARCH_COLUMNS) => ({ in: await this.matching(table, q.q) })
    const want = (cat: SearchResultDto['category']) => !q.cat || q.cat === cat
    const members = c.status === 'ACTIVE'
    const reserved = members ? {} : { isPublic: true }
    const take = q.cat ? 30 : 8
    const now = new Date()

    const [sermons, structures, projects, events, documents] = await Promise.all([
      want('SERMON')
        ? this.prisma.spiritualContent.findMany({
            where: { id: await ids('SpiritualContent'), status: 'PUBLISHED', structure: { path: { in: c.visiblePaths } }, ...reserved },
            orderBy: { publishedAt: 'desc' },
            take,
          })
        : [],
      want('STRUCTURE')
        ? this.prisma.structure.findMany({
            // Les Églises locales de la confession du fidèle ; sans rattachement, toutes (pour choisir la sienne)
            where: { id: await ids('Structure'), status: 'ACTIVE', levelType: { isMembership: true }, ...(c.confessionId ? { confessionId: c.confessionId } : {}) },
            select: { id: true, name: true, city: true, parent: { select: { name: true } } },
            orderBy: { name: 'asc' },
            take,
          })
        : [],
      want('PROJECT')
        ? this.prisma.project.findMany({ where: { id: await ids('Project'), ...this.ctx.projectWhere(c), status: VISIBLE_PROJECT }, orderBy: { createdAt: 'desc' }, take })
        : [],
      want('EVENT')
        ? this.prisma.event.findMany({
            where: { id: await ids('Event'), status: 'PUBLISHED', structure: { path: { in: c.visiblePaths } }, ...reserved, startsAt: { gte: new Date(now.getTime() - 12 * 3600 * 1000) } },
            orderBy: { startsAt: 'asc' },
            take,
          })
        : [],
      want('DOCUMENT')
        ? this.prisma.document.findMany({
            where: { id: await ids('Document'), archivedAt: null, structure: { path: { in: c.visiblePaths } }, visibility: members ? { in: ['PUBLIC', 'MEMBERS'] } : 'PUBLIC' },
            orderBy: { createdAt: 'desc' },
            take,
          })
        : [],
    ])

    return [
      ...sermons.map((s): SearchResultDto => ({ category: 'SERMON', id: s.id, title: s.title, meta: [s.speaker, minutes(s.durationSec)].filter(Boolean).join(' · ') || s.kind, href: `/app/predications/${s.id}` })),
      ...structures.map((s): SearchResultDto => ({ category: 'STRUCTURE', id: s.id, title: s.name, meta: [s.parent?.name, s.city].filter(Boolean).join(' · '), href: null })),
      ...projects.map((pr): SearchResultDto => ({ category: 'PROJECT', id: pr.id, title: pr.title, meta: pr.goalAmount ? `${fmtPct(pct(pr.raisedAmount, pr.goalAmount))} mobilisé` : (pr.location ?? ''), href: `/app/projets/${pr.id}` })),
      ...events.map((e): SearchResultDto => ({ category: 'EVENT', id: e.id, title: e.title, meta: `${dayMonth(e.startsAt)} · ${e.place}`, href: `/app/agenda/${e.id}` })),
      ...documents.map((d): SearchResultDto => ({ category: 'DOCUMENT', id: d.id, title: d.title, meta: d.mimeType === 'application/pdf' ? 'PDF' : d.category, href: mediaUrl('doc', d.id) })),
    ]
  }
}
