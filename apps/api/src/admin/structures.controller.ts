import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { createConfessionSchema, createStructureSchema, displayName, updateStructureSchema, type StructureNodeDto } from '@cepca/shared'
import { AppError, ClientIp, Conflict, Forbidden, NotFound, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { AdminScope, StaffGuard, actor, slugify } from './admin-common'

@Controller('admin/structures')
@UseGuards(StaffGuard)
export class AdminStructuresController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminScope,
    private readonly audit: AuditService,
  ) {}

  /**
   * Arbre limité au périmètre : chaque affectation qui donne « Structures » (ou à défaut n'importe quel
   * module) ouvre son sous-arbre. Liste à plat, triée par chemin : le client reconstruit l'arbre.
   */
  @Get()
  async tree(@CurrentUser() p: Principal, @Query('rootId') rootId?: string): Promise<StructureNodeDto[]> {
    let paths = this.scope.access.scopePaths(p, 'STRUCTURES', 'read')
    if (paths.length === 0) paths = [...new Set(p.assignments.map((a) => a.structurePath))].filter((x, _, all) => !all.some((y) => y !== x && x.startsWith(y)))
    let where: Prisma.StructureWhereInput = this.scope.access.pathFilter(paths) as Prisma.StructureWhereInput
    if (rootId) {
      const r = await this.prisma.structure.findUnique({ where: { id: String(rootId) }, select: { path: true } })
      if (!r || !paths.some((x) => r.path.startsWith(x))) throw NotFound('Structure')
      where = { path: { startsWith: r.path } }
    }
    const rows = await this.prisma.structure.findMany({
      where,
      select: {
        id: true,
        parentId: true,
        name: true,
        code: true,
        depth: true,
        status: true,
        path: true,
        levelType: { select: { key: true, name: true, children: { select: { name: true }, take: 1 } } },
        roleAssignments: {
          where: { revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
          select: { title: true, user: { select: { fullName: true } }, role: { select: { levelKey: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { path: 'asc' },
      take: 2000,
    })
    // Effectifs : un seul regroupement, puis cumul vers les ancêtres
    const direct = await this.prisma.membership.groupBy({ by: ['structureId'], where: { status: 'ACTIVE', structureId: { in: rows.map((r) => r.id) } }, _count: true })
    const own = new Map(direct.map((d) => [d.structureId, d._count]))
    const total = new Map<string, number>()
    for (const r of rows) total.set(r.path, 0)
    for (const r of rows) {
      const n = own.get(r.id) ?? 0
      for (const anc of rows) if (r.path.startsWith(anc.path)) total.set(anc.path, (total.get(anc.path) ?? 0) + n)
    }
    return rows.map((r) => {
      // Le responsable affiché est celui dont le rôle correspond au niveau (pasteur sur une paroisse…)
      const lead = r.roleAssignments.find((a) => a.role.levelKey === r.levelType.key) ?? null
      return {
        id: r.id,
        parentId: r.parentId,
        name: r.name,
        code: r.code,
        level: r.levelType.name,
        levelKey: r.levelType.key,
        depth: r.depth,
        status: r.status,
        leader: lead ? displayName(lead.user.fullName, lead.title) : null,
        members: total.get(r.path) ?? 0,
        childLevel: r.levelType.children[0]?.name ?? null,
      }
    })
  }

  @Get(':id')
  async one(@CurrentUser() p: Principal, @Param('id') id: string) {
    const s = await this.prisma.structure.findUnique({
      where: { id },
      include: { levelType: { select: { key: true, name: true } }, parent: { select: { id: true, name: true } }, _count: { select: { children: true } } },
    })
    if (!s) throw NotFound('Structure')
    const visible = p.assignments.some((a) => s.path.startsWith(a.structurePath))
    if (!visible) throw NotFound('Structure')
    const [members, pending] = await Promise.all([
      this.prisma.membership.count({ where: { status: 'ACTIVE', structure: { path: { startsWith: s.path } } } }),
      this.prisma.membership.count({ where: { status: 'PENDING', structure: { path: { startsWith: s.path } } } }),
    ])
    const leaders = await this.prisma.roleAssignment.findMany({
      where: { structureId: id, revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
      select: { id: true, title: true, endsAt: true, role: { select: { label: true } }, user: { select: { id: true, fullName: true } } },
    })
    return {
      id: s.id,
      name: s.name,
      code: s.code,
      level: s.levelType.name,
      status: s.status,
      parent: s.parent,
      city: s.city,
      address: s.address,
      phone: s.phone,
      email: s.email,
      serviceSchedule: s.serviceSchedule,
      timezone: s.timezone,
      children: s._count.children,
      members,
      pendingMembers: pending,
      leaders: leaders.map((l) => ({ assignmentId: l.id, role: l.role.label, title: l.title, userId: l.user.id, name: l.user.fullName, endsAt: l.endsAt?.toISOString() ?? null })),
      canEdit: this.scope.access.can(p, 'STRUCTURES', 'write', s.path) || this.scope.access.can(p, 'SETTINGS', 'write', s.path),
    }
  }

  /** Ajout du niveau suivant sous une structure. La nouvelle structure naît « En configuration ». */
  @Post()
  async create(@CurrentUser() p: Principal, @Body(new ZodPipe(createStructureSchema)) body: z.infer<typeof createStructureSchema>, @ClientIp() ip: string | null) {
    const parent = await this.scope.structure(p, 'STRUCTURES', 'write', body.parentId)
    if (parent.levelType.rank === 0) throw new AppError(400, 'USE_CONFESSION', 'Sous le CEPCA, créez une confession.')
    // Le niveau « confession » est commun : le niveau enfant se distingue par la confession
    const level = await this.prisma.levelType.findFirst({ where: { parentId: parent.levelTypeId, confessionId: parent.confessionId } })
    if (!level) throw new AppError(400, 'NO_CHILD_LEVEL', `Une structure de niveau « ${parent.levelType.name} » n'a pas de sous-structure.`)

    const base = slugify(body.name)
    let slug = base
    for (let i = 2; await this.prisma.structure.findUnique({ where: { parentId_slug: { parentId: parent.id, slug } }, select: { id: true } }); i++) slug = `${base}-${i}`
    const code = body.code ?? (await this.nextCode(parent.confessionId!, level.key))

    const s = await this.prisma.$transaction(async (tx) => {
      const s = await tx.structure.create({
        data: {
          confessionId: parent.confessionId,
          levelTypeId: level.id,
          parentId: parent.id,
          slug,
          path: `${parent.path}${slug}/`,
          depth: parent.depth + 1,
          name: body.name,
          code,
          city: body.city,
          address: body.address,
          status: 'CONFIGURATION',
        },
      })
      await this.audit.record({ ...actor(p, ip), category: 'PARAMETRAGE', action: `A créé ${level.name.toLowerCase()} « ${s.name} » sous ${parent.name}`, entityType: 'Structure', entityId: s.id, structureId: parent.id, structurePath: parent.path }, tx)
      return s
    })
    return { id: s.id, name: s.name, code: s.code, level: level.name, status: s.status }
  }

  /** Code court par niveau : PAR016, CHA024… unique dans la confession. */
  private async nextCode(confessionId: string, levelKey: string) {
    const prefix = (levelKey.replace(/[^a-z]/g, '').slice(0, 3) || 'STR').toUpperCase()
    const rows = await this.prisma.structure.findMany({ where: { confessionId, code: { startsWith: prefix } }, select: { code: true } })
    const max = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(prefix.length)) || 0), 0)
    return `${prefix}${String(max + 1).padStart(3, '0')}`
  }

  @Patch(':id')
  async update(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(updateStructureSchema)) body: z.infer<typeof updateStructureSchema>, @ClientIp() ip: string | null) {
    const s = await this.prisma.structure.findUnique({ where: { id }, select: { id: true, name: true, path: true, status: true, parentId: true } })
    if (!s) throw NotFound('Structure')
    // Les coordonnées relèvent du paramétrage de la structure elle-même ; le statut, du niveau qui l'administre
    const canIdentity = this.scope.access.can(p, 'STRUCTURES', 'write', s.path) || this.scope.access.can(p, 'SETTINGS', 'write', s.path)
    if (!canIdentity) {
      if (!p.assignments.some((a) => s.path.startsWith(a.structurePath))) throw NotFound('Structure')
      throw Forbidden()
    }
    if (body.status && body.status !== s.status) {
      if (!this.scope.access.can(p, 'STRUCTURES', 'validate', s.path)) throw Forbidden('Seul un niveau supérieur peut changer le statut de cette structure.')
      // On ne suspend pas la structure dont on tient son propre droit
      if (body.status === 'SUSPENDED' && p.assignments.some((a) => a.structurePath.startsWith(s.path))) {
        throw new AppError(400, 'SELF_SUSPEND', 'Vous ne pouvez pas suspendre une structure dont vous êtes responsable.')
      }
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.structure.update({ where: { id }, data: body })
      await this.audit.record(
        {
          ...actor(p, ip),
          category: 'PARAMETRAGE',
          action: body.status && body.status !== s.status ? `A passé « ${s.name} » au statut ${body.status}` : `A modifié la fiche de « ${s.name} »`,
          entityType: 'Structure',
          entityId: id,
          structureId: id,
          structurePath: s.path,
          metadata: { fields: Object.keys(body) },
        },
        tx,
      )
      return u
    })
    return { id: updated.id, name: updated.name, status: updated.status }
  }
}

/** Création d'une confession membre (administrateur CEPCA), avec sa hiérarchie et ses types de contribution. */
@Controller('admin/confessions')
@UseGuards(StaffGuard)
export class AdminConfessionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminScope,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async create(@CurrentUser() p: Principal, @Body(new ZodPipe(createConfessionSchema)) body: z.infer<typeof createConfessionSchema>, @ClientIp() ip: string | null) {
    const root = await this.prisma.structure.findUnique({ where: { path: '/cepca/' }, select: { id: true, path: true } })
    if (!root) throw NotFound('CEPCA')
    this.scope.access.assert(p, 'STRUCTURES', 'validate', root.path, 'Structure')
    if (await this.prisma.confession.findUnique({ where: { code: body.code }, select: { id: true } })) throw Conflict('CODE_TAKEN', 'Ce sigle est déjà utilisé.')
    const confLevel = await this.prisma.levelType.findFirst({ where: { confessionId: null, key: 'confession' } })
    if (!confLevel) throw NotFound('Niveau confession')
    const slug = body.code.toLowerCase()
    if (await this.prisma.structure.findUnique({ where: { path: `/cepca/${slug}/` }, select: { id: true } })) throw Conflict('CODE_TAKEN', 'Ce sigle est déjà utilisé.')

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.confession.count()
      const c = await tx.confession.create({ data: { code: body.code, name: body.name, shortCode: `CONF${String(count + 1).padStart(2, '0')}`, status: 'CONFIGURATION' } })
      const s = await tx.structure.create({
        data: { confessionId: c.id, levelTypeId: confLevel.id, parentId: root.id, slug, path: `/cepca/${slug}/`, depth: 1, name: `${body.name} (${body.code})`, code: body.code, status: 'CONFIGURATION' },
      })
      let parentId = confLevel.id
      for (const [i, l] of body.levels.entries()) {
        parentId = (await tx.levelType.create({ data: { confessionId: c.id, key: l.key, name: l.name, rank: i + 2, parentId, isMembership: l.isMembership } })).id
      }
      for (const [position, [key, label, requiresProject]] of ([['offrande', 'Offrande', false], ['dime', 'Dîme', false], ['projet', 'Projet', true], ['oeuvre_sociale', 'Œuvre sociale', false]] as const).entries()) {
        await tx.contributionType.create({ data: { confessionId: c.id, key, label, requiresProject, position } })
      }
      await this.audit.record({ ...actor(p, ip), category: 'PARAMETRAGE', action: `A créé la confession ${body.code} (${body.name})`, entityType: 'Confession', entityId: c.id, structureId: root.id, structurePath: root.path }, tx)
      return { id: c.id, structureId: s.id, code: c.code, status: c.status }
    })
  }
}
