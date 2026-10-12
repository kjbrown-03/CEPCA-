import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import type { Module, Prisma } from '@prisma/client'
import type { Request } from 'express'
import { MODULES, type AdminSeat, type ModuleKey } from '@cepca/shared'
import { AccessService, type Action, type Assignment, type Principal } from '../access/access.service'
import { AppError, NotFound } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import type { AuditEntry } from '../audit/audit.service'

/** Le back-office est réservé aux comptes qui ont au moins une affectation en cours. */
@Injectable()
export class StaffGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const p = ctx.switchToHttp().getRequest<Request>().principal
    if (!p) throw new AppError(401, 'UNAUTHENTICATED', 'Connectez-vous pour continuer.')
    if (p.assignments.length === 0) throw new AppError(403, 'NOT_STAFF', 'Cet espace est réservé aux responsables.')
    return true
  }
}

// Ordre du menu de la maquette ; un module n'apparaît que s'il est lisible par l'affectation
const NAV_ORDER: Array<[string, Module | null]> = [
  ['dash', null],
  ['struct', 'STRUCTURES'],
  ['users', 'MEMBERS'],
  ['roles', 'USERS_ROLES'],
  ['news', 'NEWS'],
  ['events', 'EVENTS'],
  ['sermons', 'SERMONS'],
  ['docs', 'DOCUMENTS'],
  ['notif', 'NOTIFICATIONS'],
  ['proj', 'PROJECTS'],
  ['pay', 'CONTRIBUTIONS'],
  ['reports', 'REPORTS'],
  ['audit', 'AUDIT'],
  ['settings', 'SETTINGS'],
]

export function toSeat(a: Assignment): AdminSeat {
  const permissions: AdminSeat['permissions'] = {}
  for (const m of MODULES) {
    const p = a.perms.get(m)
    if (p && (p.read || p.write || p.validate)) permissions[m] = { ...p }
  }
  // « Fidèles » en agrégé (CEPCA) : pas de liste nominative, donc pas d'entrée de menu « Utilisateurs »
  const nav = NAV_ORDER.filter(([, m]) => {
    if (!m) return true
    const p = a.perms.get(m)
    if (!p?.read) return false
    return !(p.aggregateOnly && (m === 'MEMBERS' || m === 'CONTRIBUTIONS'))
  }).map(([k]) => k)
  if (a.perms.get('USERS_ROLES')?.read && !nav.includes('users')) nav.splice(1, 0, 'users')
  return {
    assignmentId: a.id,
    roleKey: a.roleKey,
    roleLabel: a.roleLabel,
    title: a.title,
    structure: { id: a.structureId, name: a.structureName, level: a.levelName, path: a.structurePath },
    nav,
    permissions,
  }
}

export const structureSel = {
  id: true,
  name: true,
  path: true,
  depth: true,
  code: true,
  status: true,
  parentId: true,
  confessionId: true,
  levelTypeId: true,
  levelType: { select: { key: true, name: true, rank: true, isMembership: true } },
} as const satisfies Prisma.StructureSelect
export type StructureRow = Prisma.StructureGetPayload<{ select: typeof structureSel }>

/** Trace d'audit au nom de la personne connectée. */
export function actor(p: Principal, ip: string | null): Pick<AuditEntry, 'actorId' | 'actorLabel' | 'ip'> {
  return { actorId: p.userId, actorLabel: p.fullName, ip }
}

@Injectable()
export class AdminScope {
  constructor(
    private readonly prisma: PrismaService,
    readonly access: AccessService,
  ) {}

  /**
   * Structure cible d'une action, contrôlée : hors périmètre → 404, visible mais action interdite → 403.
   */
  async structure(p: Principal, module: Module, action: Action, structureId: string): Promise<StructureRow> {
    const s = await this.prisma.structure.findUnique({ where: { id: structureId }, select: structureSel })
    if (!s) throw NotFound('Structure')
    this.access.assert(p, module, action, s.path, 'Structure')
    return s
  }

  /** Filtre Prisma « dans mon périmètre » sur une relation structure. Vide = aucune ligne. */
  where(p: Principal, module: Module, action: Action = 'read', opts: { allowAggregate?: boolean } = {}): Prisma.StructureWhereInput {
    return this.access.pathFilter(this.access.scopePaths(p, module, action, opts)) as Prisma.StructureWhereInput
  }

  /** Restreint en plus à une structure choisie (filtre de l'écran), qui doit elle-même être dans le périmètre. */
  async whereWithin(p: Principal, module: Module, structureId?: string, opts: { allowAggregate?: boolean } = {}): Promise<Prisma.StructureWhereInput> {
    if (!structureId) {
      const paths = this.access.scopePaths(p, module, 'read', opts)
      if (paths.length === 0) throw new AppError(403, 'FORBIDDEN', "Vous n'avez pas accès à ce module")
      return this.access.pathFilter(paths) as Prisma.StructureWhereInput
    }
    const s = await this.prisma.structure.findUnique({ where: { id: structureId }, select: { path: true } })
    if (!s || !this.access.can(p, module, 'read', s.path, opts)) throw NotFound('Structure')
    return { path: { startsWith: s.path } }
  }

  /** Lève 403 si aucune affectation ne donne ce droit, où que ce soit. */
  requireAny(p: Principal, module: Module, action: Action = 'read', opts: { allowAggregate?: boolean } = {}) {
    if (this.access.scopePaths(p, module, action, opts).length === 0) throw new AppError(403, 'FORBIDDEN', "Vous n'avez pas accès à ce module")
  }

  /** Droits effectifs d'une personne sur un chemin (union de ses affectations qui le couvrent). */
  effective(p: Principal, path: string): Map<ModuleKey, { read: boolean; write: boolean; validate: boolean; aggregateOnly: boolean }> {
    const out = new Map<ModuleKey, { read: boolean; write: boolean; validate: boolean; aggregateOnly: boolean }>()
    for (const a of p.assignments) {
      if (!path.startsWith(a.structurePath)) continue
      for (const [m, perm] of a.perms) {
        const cur = out.get(m) ?? { read: false, write: false, validate: false, aggregateOnly: true }
        out.set(m, {
          read: cur.read || perm.read,
          write: cur.write || perm.write,
          validate: cur.validate || perm.validate,
          // Un accès détaillé quelque part l'emporte sur un accès agrégé
          aggregateOnly: cur.aggregateOnly && (perm.aggregateOnly || !perm.read),
        })
      }
    }
    return out
  }
}

/** Pagination par curseur commune aux listes du back-office. */
export const PAGE = 30
export function page<T extends { id: string }>(rows: T[], size = PAGE) {
  const items = rows.slice(0, size)
  return { items, nextCursor: rows.length > size ? items[items.length - 1].id : null }
}
export function cursorArgs(cursor?: string, size = PAGE) {
  return { take: size + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }
}

/** Nombre de fidèles actifs rattachés à une structure ou à ses sous-structures. */
export function membersUnder(prisma: PrismaService, path: string) {
  return prisma.membership.count({ where: { status: 'ACTIVE', structure: { path: { startsWith: path } } } })
}

/** Slug ASCII stable pour un chemin de structure. */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/^(paroisse|chapelle|synode|consistoire|region|eglise)\s+(de\s+|d'|du\s+|des\s+)?/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 's'
  )
}
