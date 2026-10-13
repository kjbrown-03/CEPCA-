import { Injectable } from '@nestjs/common'
import type { Module } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { Forbidden, NotFound } from '../common/http'

export type Action = 'read' | 'write' | 'validate'

export interface Assignment {
  id: string
  roleKey: string
  roleLabel: string
  title: string | null
  structureId: string
  structureName: string
  structurePath: string
  levelKey: string
  levelName: string
  confessionId: string | null
  perms: Map<Module, { read: boolean; write: boolean; validate: boolean; aggregateOnly: boolean }>
}

export interface Principal {
  userId: string
  fullName: string
  phone: string
  email: string | null
  assignments: Assignment[]
  /** Session ouverte par la double authentification (posé par le garde d'authentification) */
  mfa: boolean
  /** Rattachement en cours (actif ou en attente) */
  membership: null | { status: string; structureId: string; path: string; confessionId: string }
}

/** "/cepca/eec/lit/dc/dei/" → ["/cepca/", "/cepca/eec/", …, "/cepca/eec/lit/dc/dei/"] */
export function ancestorPaths(path: string): string[] {
  const parts = path.split('/').filter(Boolean)
  return parts.map((_, i) => '/' + parts.slice(0, i + 1).join('/') + '/')
}

export function isWithin(path: string, scopePath: string): boolean {
  return path.startsWith(scopePath)
}

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Relit le compte et ses affectations en base à chaque requête :
   * une suspension ou une fin de mandat prend effet immédiatement, sans attendre l'expiration du jeton.
   */
  async loadPrincipal(userId: string): Promise<Principal | null> {
    const now = new Date()
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        status: true,
        roleAssignments: {
          where: { revokedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          select: {
            id: true,
            title: true,
            role: { select: { key: true, label: true, permissions: true } },
            structure: { select: { id: true, name: true, path: true, confessionId: true, status: true, levelType: { select: { key: true, name: true } } } },
          },
        },
        memberships: {
          where: { status: { in: ['PENDING', 'ACTIVE'] } },
          select: { status: true, structureId: true, confessionId: true, structure: { select: { path: true } } },
          take: 1,
        },
      },
    })
    if (!user || user.status !== 'ACTIVE') return null
    const m = user.memberships[0]
    return {
      userId: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      membership: m ? { status: m.status, structureId: m.structureId, path: m.structure.path, confessionId: m.confessionId } : null,
      mfa: false,
      assignments: user.roleAssignments
        .filter((a) => a.structure.status !== 'SUSPENDED')
        .map((a) => ({
          id: a.id,
          roleKey: a.role.key,
          roleLabel: a.role.label,
          title: a.title,
          structureId: a.structure.id,
          structureName: a.structure.name,
          structurePath: a.structure.path,
          levelKey: a.structure.levelType.key,
          levelName: a.structure.levelType.name,
          confessionId: a.structure.confessionId,
          perms: new Map(
            a.role.permissions.map((p) => [p.module, { read: p.canRead, write: p.canWrite, validate: p.canValidate, aggregateOnly: p.aggregateOnly }]),
          ),
        })),
    }
  }

  /** Affectations qui donnent `action` sur `module` (toutes structures confondues). */
  grants(p: Principal, module: Module, action: Action, opts: { allowAggregate?: boolean } = {}): Assignment[] {
    return p.assignments.filter((a) => {
      const perm = a.perms.get(module)
      if (!perm || !perm[action]) return false
      if (perm.aggregateOnly && !opts.allowAggregate) return false
      return true
    })
  }

  /** Chemins racines du périmètre pour un module et une action. Vide = aucun droit. */
  scopePaths(p: Principal, module: Module, action: Action, opts: { allowAggregate?: boolean } = {}): string[] {
    const paths = this.grants(p, module, action, opts).map((a) => a.structurePath)
    // Retirer les chemins couverts par un chemin plus large
    return paths.filter((x) => !paths.some((y) => y !== x && x.startsWith(y)))
  }

  can(p: Principal, module: Module, action: Action, targetPath: string, opts: { allowAggregate?: boolean } = {}): boolean {
    return this.grants(p, module, action, opts).some((a) => isWithin(targetPath, a.structurePath))
  }

  /**
   * Vérifie le droit sur une ressource précise.
   * Hors périmètre en lecture → 404 (l'existence est une information) ; en écriture sur une ressource lisible → 403.
   */
  assert(p: Principal, module: Module, action: Action, targetPath: string, what = 'Ressource') {
    if (this.can(p, module, action, targetPath)) return
    if (action !== 'read' && this.can(p, module, 'read', targetPath)) throw Forbidden()
    throw NotFound(what)
  }

  /** Filtre Prisma sur le chemin de structure : OR des préfixes du périmètre. */
  pathFilter(paths: string[]) {
    if (paths.length === 0) return { path: { equals: '__none__' } }
    return { OR: paths.map((p) => ({ path: { startsWith: p } })) }
  }
}
