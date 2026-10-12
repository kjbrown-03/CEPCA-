import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import type { Module, Role, RolePermission } from '@prisma/client'
import { z } from 'zod'
import { MODULES, createRoleSchema, rolePermissionsSchema, type AdminMeDto, type ModuleKey, type RoleMatrixDto } from '@cepca/shared'
import { ClientIp, Conflict, Forbidden, NotFound, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { AdminScope, StaffGuard, actor, toSeat } from './admin-common'

const ROOT = '/cepca/'

@Controller('admin')
@UseGuards(StaffGuard)
export class AdminRolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminScope,
    private readonly audit: AuditService,
  ) {}

  /** Qui suis-je dans le back-office : une « place » par mandat en cours, avec son menu. */
  @Get('me')
  me(@CurrentUser() p: Principal): AdminMeDto {
    return { id: p.userId, fullName: p.fullName, phone: p.phone, email: p.email, seats: p.assignments.map(toSeat) }
  }

  /** Chemin où se décide la matrice d'un rôle : le CEPCA pour un rôle système, la confession sinon. */
  private async governingPath(role: Pick<Role, 'confessionId'>): Promise<string> {
    if (!role.confessionId) return ROOT
    const s = await this.prisma.structure.findFirst({ where: { confessionId: role.confessionId, depth: 1 }, select: { path: true } })
    return s?.path ?? '__none__'
  }

  private toDto(r: Role & { permissions: RolePermission[] }, editable: boolean): RoleMatrixDto {
    const permissions: RoleMatrixDto['permissions'] = {}
    for (const x of r.permissions) permissions[x.module as ModuleKey] = { read: x.canRead, write: x.canWrite, validate: x.canValidate, aggregateOnly: x.aggregateOnly }
    return { id: r.id, key: r.key, label: r.label, description: r.description, confessionId: r.confessionId, isSystem: r.isSystem, editable, permissions }
  }

  @Get('roles')
  async list(@CurrentUser() p: Principal): Promise<RoleMatrixDto[]> {
    this.scope.requireAny(p, 'USERS_ROLES', 'read')
    const confs = [...new Set(p.assignments.map((a) => a.confessionId).filter((x): x is string => !!x))]
    const atRoot = this.scope.access.can(p, 'USERS_ROLES', 'read', ROOT)
    const roles = await this.prisma.role.findMany({
      where: atRoot ? {} : { OR: [{ confessionId: null }, { confessionId: { in: confs } }] },
      include: { permissions: true },
      orderBy: [{ confessionId: { sort: 'asc', nulls: 'first' } }, { label: 'asc' }],
    })
    const out: RoleMatrixDto[] = []
    for (const r of roles) out.push(this.toDto(r, this.scope.access.can(p, 'USERS_ROLES', 'validate', await this.governingPath(r))))
    return out
  }

  /**
   * Enregistrement de la matrice d'un rôle. Une case modifiée doit correspondre à un droit que l'auteur
   * détient lui-même (il ne s'octroie rien par ricochet) ; le caractère « agrégé » d'une case ne se change pas ici.
   */
  @Put('roles/:id/permissions')
  async save(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(rolePermissionsSchema)) body: z.infer<typeof rolePermissionsSchema>, @ClientIp() ip: string | null) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { permissions: true } })
    if (!role) throw NotFound('Rôle')
    const path = await this.governingPath(role)
    this.scope.access.assert(p, 'USERS_ROLES', 'validate', path, 'Rôle')
    const mine = this.scope.effective(p, path)
    const current = new Map(role.permissions.map((x) => [x.module, x]))
    const changes: string[] = []
    for (const [m, cell] of Object.entries(body.permissions) as Array<[Module, { read: boolean; write: boolean; validate: boolean }]>) {
      // Créer ou valider suppose de consulter
      const next = { read: cell.read || cell.write || cell.validate, write: cell.write, validate: cell.validate }
      const cur = current.get(m)
      const before = { read: cur?.canRead ?? false, write: cur?.canWrite ?? false, validate: cur?.canValidate ?? false }
      const own = mine.get(m as ModuleKey)
      for (const k of ['read', 'write', 'validate'] as const) {
        if (next[k] !== before[k]) {
          if (!own?.[k] || (k === 'read' && own.aggregateOnly && !cur?.aggregateOnly)) throw Forbidden(`Vous ne pouvez pas modifier le droit « ${k} » du module ${m}.`)
          changes.push(`${m}.${k}=${next[k] ? 'oui' : 'non'}`)
        }
      }
    }
    if (changes.length === 0) return this.toDto(role, true)
    await this.prisma.$transaction(async (tx) => {
      for (const [m, cell] of Object.entries(body.permissions) as Array<[Module, { read: boolean; write: boolean; validate: boolean }]>) {
        const read = cell.read || cell.write || cell.validate
        await tx.rolePermission.upsert({
          where: { roleId_module: { roleId: id, module: m } },
          create: { roleId: id, module: m, canRead: read, canWrite: cell.write, canValidate: cell.validate },
          update: { canRead: read, canWrite: cell.write, canValidate: cell.validate },
        })
      }
      await tx.role.update({ where: { id }, data: { updatedAt: new Date() } })
      await this.audit.record({ ...actor(p, ip), category: 'DROITS', action: `A modifié les droits du rôle ${role.label}`, entityType: 'Role', entityId: id, structurePath: path, metadata: { changes } }, tx)
    })
    const updated = await this.prisma.role.findUniqueOrThrow({ where: { id }, include: { permissions: true } })
    return this.toDto(updated, true)
  }

  /** Rôle propre à une confession (§38), créé vide ou à partir d'un rôle existant, limité aux droits de l'auteur. */
  @Post('roles')
  async create(@CurrentUser() p: Principal, @Body(new ZodPipe(createRoleSchema)) body: z.infer<typeof createRoleSchema>, @ClientIp() ip: string | null) {
    const path = await this.governingPath({ confessionId: body.confessionId })
    this.scope.access.assert(p, 'USERS_ROLES', 'validate', path, 'Confession')
    if (await this.prisma.role.findFirst({ where: { OR: [{ confessionId: body.confessionId, key: body.key }, { confessionId: null, key: body.key }] } })) {
      throw Conflict('KEY_TAKEN', 'Cette clé de rôle existe déjà.')
    }
    const mine = this.scope.effective(p, path)
    let cells: Array<{ module: Module; canRead: boolean; canWrite: boolean; canValidate: boolean; aggregateOnly: boolean }> = []
    if (body.basedOn) {
      const src = await this.prisma.role.findUnique({ where: { id: body.basedOn }, include: { permissions: true } })
      if (!src || (src.confessionId && src.confessionId !== body.confessionId)) throw NotFound('Rôle modèle')
      // Copie bornée aux droits de l'auteur
      cells = src.permissions.map((x) => {
        const own = mine.get(x.module as ModuleKey)
        return { module: x.module, canRead: x.canRead && !!own?.read, canWrite: x.canWrite && !!own?.write, canValidate: x.canValidate && !!own?.validate, aggregateOnly: x.aggregateOnly || !!own?.aggregateOnly }
      })
    }
    const r = await this.prisma.$transaction(async (tx) => {
      const r = await tx.role.create({
        data: { confessionId: body.confessionId, key: body.key, label: body.label, description: body.description, isSystem: false, permissions: { createMany: { data: cells.filter((c) => c.canRead) } } },
        include: { permissions: true },
      })
      await this.audit.record({ ...actor(p, ip), category: 'DROITS', action: `A créé le rôle ${body.label}`, entityType: 'Role', entityId: r.id, structurePath: path }, tx)
      return r
    })
    return this.toDto(r, true)
  }

  /** Les modules, pour l'en-tête de la matrice. */
  @Get('modules')
  modules() {
    return MODULES
  }
}
