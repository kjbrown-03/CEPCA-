import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  assignRoleSchema,
  maskEmail,
  membershipDecisionSchema,
  membershipStatusSchema,
  transferSchema,
  userListSchema,
  type AdminUserDto,
  type ModuleKey,
} from '@cepca/shared'
import { AppError, ClientIp, Conflict, Forbidden, NotFound, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import { MailService } from '../mail/mail.service'
import type { Principal } from '../access/access.service'
import { env } from '../config/env'
import { AdminScope, PAGE, StaffGuard, actor, cursorArgs, page } from './admin-common'

/** Fonction : la date de fin de mandat se compare à l'instant de la requête, pas au démarrage du serveur. */
const userInclude = () =>
  ({
  memberships: {
    where: { status: { in: ['PENDING', 'ACTIVE', 'TO_VERIFY', 'INACTIVE'] } },
    orderBy: { requestedAt: 'desc' },
    take: 1,
    select: { id: true, status: true, requestedAt: true, structure: { select: { id: true, name: true, path: true } } },
  },
  roleAssignments: {
    where: { revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
    select: { id: true, title: true, endsAt: true, role: { select: { id: true, label: true } }, structure: { select: { id: true, name: true, path: true } } },
  },
  }) as const satisfies Prisma.UserInclude
type UserRow = Prisma.UserGetPayload<{ include: ReturnType<typeof userInclude> }>

function toAdminUser(u: UserRow): AdminUserDto {
  const m = u.memberships[0]
  return {
    id: u.id,
    fullName: u.fullName,
    phone: u.phone,
    email: u.email,
    status: u.status,
    residence: u.residence,
    membership: m ? { id: m.id, status: m.status, structureId: m.structure.id, structure: m.structure.name, requestedAt: m.requestedAt.toISOString() } : null,
    roles: u.roleAssignments.map((a) => ({
      assignmentId: a.id,
      roleId: a.role.id,
      label: a.role.label,
      title: a.title,
      structure: a.structure.name,
      structureId: a.structure.id,
      endsAt: a.endsAt?.toISOString() ?? null,
    })),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  }
}

@Controller('admin')
@UseGuards(StaffGuard)
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminScope,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  /**
   * Deux portes, jamais plus larges que le droit : « Fidèles » (lecture détaillée) montre les fidèles
   * rattachés au périmètre ; « Utilisateurs et rôles » montre les responsables nommés dans le périmètre.
   * Un droit agrégé (CEPCA) ne liste aucun fidèle.
   */
  private visibility(p: Principal): Prisma.UserWhereInput[] {
    const ors: Prisma.UserWhereInput[] = []
    const members = this.scope.access.scopePaths(p, 'MEMBERS', 'read')
    if (members.length) ors.push({ memberships: { some: { status: { in: ['PENDING', 'ACTIVE', 'TO_VERIFY', 'INACTIVE'] }, structure: this.scope.access.pathFilter(members) } } })
    const leaders = this.scope.access.scopePaths(p, 'USERS_ROLES', 'read')
    if (leaders.length) ors.push({ roleAssignments: { some: { revokedAt: null, structure: this.scope.access.pathFilter(leaders) } } })
    return ors
  }

  @Get('users')
  async list(@CurrentUser() p: Principal, @Query(new ZodPipe(userListSchema)) q: z.infer<typeof userListSchema>) {
    const ors = this.visibility(p)
    if (ors.length === 0) throw new AppError(403, 'FORBIDDEN', "Vous n'avez pas accès à ce module")
    const and: Prisma.UserWhereInput[] = [{ OR: ors }, { status: { not: 'DELETED' } }]
    if (q.structureId) {
      const s = await this.prisma.structure.findUnique({ where: { id: q.structureId }, select: { path: true } })
      if (!s || !p.assignments.some((a) => s.path.startsWith(a.structurePath))) throw NotFound('Structure')
      const under = { path: { startsWith: s.path } }
      and.push({ OR: [{ memberships: { some: { status: { in: ['PENDING', 'ACTIVE'] }, structure: under } } }, { roleAssignments: { some: { revokedAt: null, structure: under } } }] })
    }
    if (q.filter === 'LEADERS') and.push({ roleAssignments: { some: { revokedAt: null } } })
    if (q.filter === 'MEMBERS') and.push({ roleAssignments: { none: { revokedAt: null } } })
    if (q.filter === 'PENDING') {
      const members = this.scope.access.scopePaths(p, 'MEMBERS', 'read')
      and.push({ memberships: { some: { status: 'PENDING', structure: this.scope.access.pathFilter(members) } } })
    }
    if (q.filter === 'SUSPENDED') and.push({ status: 'SUSPENDED' })
    if (q.q) {
      const digits = q.q.replace(/\D/g, '')
      and.push({
        OR: [
          { fullName: { contains: q.q, mode: 'insensitive' } },
          ...(q.q.includes('@') || q.q.length >= 3 ? [{ email: { contains: q.q.trim().toLowerCase() } }] : []),
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ],
      })
    }
    const rows = await this.prisma.user.findMany({ where: { AND: and }, include: userInclude(), orderBy: [{ fullName: 'asc' }, { id: 'asc' }], ...cursorArgs(q.cursor) })
    const counts = await this.prisma.membership.count({ where: { status: 'PENDING', structure: this.scope.access.pathFilter(this.scope.access.scopePaths(p, 'MEMBERS', 'read')) } })
    const r = page(rows, PAGE)
    return { items: r.items.map(toAdminUser), nextCursor: r.nextCursor, pendingCount: counts }
  }

  @Get('users/:id')
  async one(@CurrentUser() p: Principal, @Param('id') id: string): Promise<AdminUserDto & { email: string | null; city: string | null; groups: string[] }> {
    const ors = this.visibility(p)
    const u = ors.length ? await this.prisma.user.findFirst({ where: { id, OR: ors }, include: { ...userInclude(), groupMemberships: { where: { status: 'ACTIVE' }, select: { group: { select: { name: true } } } } } }) : null
    if (!u) throw NotFound('Utilisateur')
    return { ...toAdminUser(u), email: u.email, city: u.city, groups: u.groupMemberships.map((g) => g.group.name) }
  }

  // ── Rattachements ──

  private async membership(p: Principal, id: string, action: 'write' | 'validate') {
    const m = await this.prisma.membership.findUnique({ where: { id }, include: { structure: { select: { id: true, name: true, path: true } }, user: { select: { id: true, fullName: true } } } })
    if (!m) throw NotFound('Inscription')
    this.scope.access.assert(p, 'MEMBERS', action, m.structure.path, 'Inscription')
    return m
  }

  /** Validation d'une inscription : le fidèle accède alors aux contenus réservés de sa communauté. */
  @Post('memberships/:id/approve')
  @HttpCode(200)
  async approve(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(membershipDecisionSchema)) body: z.infer<typeof membershipDecisionSchema>, @ClientIp() ip: string | null) {
    const m = await this.membership(p, id, 'validate')
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.membership.updateMany({ where: { id, status: { in: ['PENDING', 'TO_VERIFY'] } }, data: { status: 'ACTIVE', validatedAt: new Date(), validatedById: p.userId, note: body.note } })
      if (moved.count !== 1) throw Conflict('ALREADY_DECIDED', 'Cette inscription a déjà été traitée.')
      await tx.notification.create({ data: { userId: m.userId, kind: 'MEMBERSHIP', title: 'Inscription validée', body: `Bienvenue à ${m.structure.name} !`, link: { screen: 'me' } } })
      await this.audit.record({ ...actor(p, ip), category: 'VALIDATION', action: `A validé l'inscription de ${m.user.fullName}`, entityType: 'Membership', entityId: id, structureId: m.structure.id, structurePath: m.structure.path }, tx)
      return { id, status: 'ACTIVE' }
    })
  }

  @Post('memberships/:id/reject')
  @HttpCode(200)
  async reject(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(membershipDecisionSchema)) body: z.infer<typeof membershipDecisionSchema>, @ClientIp() ip: string | null) {
    const m = await this.membership(p, id, 'validate')
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.membership.updateMany({ where: { id, status: { in: ['PENDING', 'TO_VERIFY'] } }, data: { status: 'REJECTED', endedAt: new Date(), validatedById: p.userId, note: body.note } })
      if (moved.count !== 1) throw Conflict('ALREADY_DECIDED', 'Cette inscription a déjà été traitée.')
      await tx.notification.create({
        data: { userId: m.userId, kind: 'MEMBERSHIP', title: 'Inscription non validée', body: `${m.structure.name} n'a pas pu confirmer votre inscription. Contactez la paroisse ou choisissez une autre communauté.`, link: { screen: 'me' } },
      })
      await this.audit.record({ ...actor(p, ip), category: 'VALIDATION', action: `A refusé l'inscription de ${m.user.fullName}`, entityType: 'Membership', entityId: id, structureId: m.structure.id, structurePath: m.structure.path }, tx)
      return { id, status: 'REJECTED' }
    })
  }

  /** Suivi du fichier des membres (§58) : inactif, décédé, à vérifier. */
  @Post('memberships/:id/status')
  @HttpCode(200)
  async setStatus(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(membershipStatusSchema)) body: z.infer<typeof membershipStatusSchema>, @ClientIp() ip: string | null) {
    const m = await this.membership(p, id, body.status === 'ACTIVE' ? 'validate' : 'write')
    if (!['ACTIVE', 'INACTIVE', 'DECEASED', 'TO_VERIFY'].includes(m.status)) throw Conflict('NOT_EDITABLE', 'Ce rattachement est clos.')
    await this.prisma.$transaction(async (tx) => {
      await tx.membership.update({ where: { id }, data: { status: body.status, note: body.note, ...(body.status === 'DECEASED' ? { endedAt: new Date() } : {}) } })
      await this.audit.record({ ...actor(p, ip), category: 'VALIDATION', action: `A passé ${m.user.fullName} au statut ${body.status}`, entityType: 'Membership', entityId: id, structureId: m.structure.id, structurePath: m.structure.path }, tx)
    })
    return { id, status: body.status }
  }

  /**
   * Transfert (§59) : l'ancien rattachement est clos (historique conservé), le nouveau attend
   * la validation de la communauté d'accueil, qui peut être hors du périmètre de l'auteur du transfert.
   */
  @Post('memberships/:id/transfer')
  @HttpCode(200)
  async transfer(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(transferSchema)) body: z.infer<typeof transferSchema>, @ClientIp() ip: string | null) {
    const m = await this.membership(p, id, 'write')
    if (m.status !== 'ACTIVE') throw Conflict('NOT_ACTIVE', 'Seul un fidèle actif peut être transféré.')
    const target = await this.prisma.structure.findUnique({ where: { id: body.structureId }, select: { id: true, name: true, path: true, status: true, confessionId: true, levelType: { select: { isMembership: true } } } })
    if (!target || target.confessionId !== m.confessionId || !target.levelType.isMembership || target.status === 'SUSPENDED') throw NotFound('Communauté d’accueil')
    if (target.id === m.structureId) throw new AppError(400, 'SAME_STRUCTURE', 'Le fidèle est déjà rattaché à cette communauté.')
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.membership.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'TRANSFERRED', endedAt: new Date(), note: body.note } })
      if (moved.count !== 1) throw Conflict('ALREADY_DECIDED', 'Ce rattachement a changé entre-temps.')
      const next = await tx.membership.create({ data: { userId: m.userId, structureId: target.id, confessionId: m.confessionId, status: 'PENDING', note: `Transfert depuis ${m.structure.name}` } })
      await tx.notification.create({ data: { userId: m.userId, kind: 'MEMBERSHIP', title: 'Transfert en cours', body: `Votre rattachement passe à ${target.name}, qui doit le confirmer.`, link: { screen: 'me' } } })
      await this.audit.record({ ...actor(p, ip), category: 'VALIDATION', action: `A transféré ${m.user.fullName} de ${m.structure.name} vers ${target.name}`, entityType: 'Membership', entityId: next.id, structureId: m.structure.id, structurePath: m.structure.path }, tx)
      return { id: next.id, status: next.status }
    })
  }

  // ── Comptes ──

  /**
   * Suspension d'un compte : il faut couvrir toutes ses attaches (rattachement et mandats),
   * sinon une paroisse pourrait suspendre le président de son synode.
   */
  private async assertCovers(p: Principal, userId: string) {
    if (userId === p.userId) throw new AppError(400, 'SELF', 'Vous ne pouvez pas modifier votre propre compte ici.')
    const u = await this.prisma.user.findUnique({ where: { id: userId }, include: userInclude() })
    if (!u || u.status === 'DELETED') throw NotFound('Utilisateur')
    const visible = (await this.prisma.user.count({ where: { id: userId, OR: this.visibility(p) } })) > 0
    if (!visible) throw NotFound('Utilisateur')
    const m = u.memberships[0]
    if (m && !this.scope.access.can(p, 'MEMBERS', 'validate', m.structure.path)) throw Forbidden()
    for (const a of u.roleAssignments) if (!this.scope.access.can(p, 'USERS_ROLES', 'validate', a.structure.path)) throw Forbidden('Ce compte détient un mandat hors de votre périmètre.')
    return u
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  async suspend(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const u = await this.assertCovers(p, id)
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: 'SUSPENDED' } })
      // Sessions coupées tout de suite ; le jeton d'accès en cours est refusé dès la requête suivante (compte relu)
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
      await this.audit.record({ ...actor(p, ip), category: 'DROITS', action: `A suspendu le compte de ${u.fullName}`, entityType: 'User', entityId: id, structurePath: u.memberships[0]?.structure.path ?? u.roleAssignments[0]?.structure.path }, tx)
    })
    return { id, status: 'SUSPENDED' }
  }

  @Post('users/:id/reactivate')
  @HttpCode(200)
  async reactivate(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const u = await this.assertCovers(p, id)
    if (u.status !== 'SUSPENDED') throw Conflict('NOT_SUSPENDED', "Ce compte n'est pas suspendu.")
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: 'ACTIVE' } })
      await this.audit.record({ ...actor(p, ip), category: 'DROITS', action: `A réactivé le compte de ${u.fullName}`, entityType: 'User', entityId: id, structurePath: u.memberships[0]?.structure.path ?? u.roleAssignments[0]?.structure.path }, tx)
    })
    return { id, status: 'ACTIVE' }
  }

  // ── Nominations ──

  /** On ne donne (ni ne retire) que des droits que l'on détient soi-même sur cette structure. */
  private assertNoEscalation(p: Principal, path: string, perms: Array<{ module: string; canRead: boolean; canWrite: boolean; canValidate: boolean; aggregateOnly: boolean }>) {
    const mine = this.scope.effective(p, path)
    for (const r of perms) {
      const m = mine.get(r.module as ModuleKey)
      const ok = (!r.canRead || m?.read) && (!r.canWrite || m?.write) && (!r.canValidate || m?.validate) && (!r.canRead || r.aggregateOnly || !m?.aggregateOnly)
      if (!ok) throw Forbidden('Ce rôle donne des droits que vous ne détenez pas sur cette structure.')
    }
  }

  @Post('assignments')
  async assign(@CurrentUser() p: Principal, @Body(new ZodPipe(assignRoleSchema)) body: z.infer<typeof assignRoleSchema>, @ClientIp() ip: string | null) {
    const s = await this.scope.structure(p, 'USERS_ROLES', 'write', body.structureId)
    const role = await this.prisma.role.findUnique({ where: { id: body.roleId }, include: { permissions: true } })
    if (!role || (role.confessionId && role.confessionId !== s.confessionId)) throw NotFound('Rôle')
    this.assertNoEscalation(p, s.path, role.permissions)
    if (body.endsAt && Date.parse(body.endsAt) <= Date.now()) throw new AppError(400, 'VALIDATION', 'La fin de mandat doit être dans le futur.', { endsAt: 'Date passée' })

    let user = await this.prisma.user.findUnique({ where: { email: body.email } })
    if (user && user.id === p.userId) throw new AppError(400, 'SELF', 'Vous ne pouvez pas vous nommer vous-même.')
    if (user && user.status !== 'ACTIVE') throw Conflict('ACCOUNT_DISABLED', 'Ce compte est suspendu.')
    if (!user && !body.fullName) throw new AppError(400, 'NAME_REQUIRED', 'Cette adresse n’a pas de compte : indiquez le nom de la personne.', { fullName: 'Nom requis' })
    if (!user && !body.phone) throw new AppError(400, 'PHONE_REQUIRED', 'Cette adresse n’a pas de compte : indiquez le téléphone de la personne.', { phone: 'Téléphone requis' })
    if (!user && (await this.prisma.user.findUnique({ where: { phone: body.phone! }, select: { id: true } }))) {
      throw Conflict('PHONE_TAKEN', 'Ce numéro appartient déjà à un compte enregistré avec une autre adresse e-mail.')
    }
    if (user && (await this.prisma.roleAssignment.findFirst({ where: { userId: user.id, roleId: role.id, structureId: s.id, revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } }))) {
      throw Conflict('ALREADY_ASSIGNED', 'Cette personne a déjà ce rôle sur cette structure.')
    }
    const invited = !user
    const a = await this.prisma.$transaction(async (tx) => {
      user ??= await tx.user.create({ data: { email: body.email, phone: body.phone!, fullName: body.fullName!, residence: body.phone!.startsWith('+237') ? 'CAMEROON' : 'DIASPORA' } })
      const a = await tx.roleAssignment.create({ data: { userId: user.id, roleId: role.id, structureId: s.id, title: body.title, endsAt: body.endsAt ? new Date(body.endsAt) : null, createdById: p.userId } })
      await this.audit.record(
        { ...actor(p, ip), category: 'DROITS', action: `A nommé ${user.fullName} ${role.label.toLowerCase()} (${s.name})`, entityType: 'RoleAssignment', entityId: a.id, structureId: s.id, structurePath: s.path, metadata: { invited, email: maskEmail(body.email) } },
        tx,
      )
      return a
    })
    // Le mot de passe n'est jamais fixé par un tiers : la personne le définit avec un code reçu par e-mail
    const needsPassword = !(await this.prisma.user.findUnique({ where: { id: a.userId }, select: { passwordHash: true } }))?.passwordHash
    const site = env.CORS_ORIGIN.split(',')[0].trim()
    await this.mail.trySend({
      to: body.email,
      subject: `CEPCA · Vous êtes nommé(e) ${role.label.toLowerCase()}`,
      text:
        `Bonjour ${user!.fullName},\n\nVous êtes nommé(e) ${role.label.toLowerCase()} (${s.name}).\n\n` +
        (needsPassword
          ? `Pour accéder au back-office, définissez d'abord votre mot de passe : ${site}/admin/mot-de-passe\nUn code de vérification sera envoyé à cette adresse.`
          : `Connectez-vous au back-office avec votre mot de passe habituel : ${site}/admin/connexion\nChoisissez ce rôle et cette structure à la connexion.`),
    })
    return { assignmentId: a.id, userId: a.userId, invited }
  }

  /** Fin de mandat anticipée. L'historique reste (revokedAt), les droits tombent à la requête suivante. */
  @Delete('assignments/:id')
  async revoke(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const a = await this.prisma.roleAssignment.findUnique({ where: { id }, include: { role: { include: { permissions: true } }, structure: { select: { id: true, name: true, path: true } }, user: { select: { fullName: true } } } })
    if (!a || a.revokedAt) throw NotFound('Mandat')
    this.scope.access.assert(p, 'USERS_ROLES', 'write', a.structure.path, 'Mandat')
    if (a.userId === p.userId) throw new AppError(400, 'SELF', 'Demandez à un autre responsable de mettre fin à votre propre mandat.')
    this.assertNoEscalation(p, a.structure.path, a.role.permissions)
    await this.prisma.$transaction(async (tx) => {
      await tx.roleAssignment.update({ where: { id }, data: { revokedAt: new Date() } })
      await this.audit.record({ ...actor(p, ip), category: 'DROITS', action: `A mis fin au mandat de ${a.user.fullName} (${a.role.label}, ${a.structure.name})`, entityType: 'RoleAssignment', entityId: id, structureId: a.structure.id, structurePath: a.structure.path }, tx)
    })
    return { id, revoked: true }
  }
}
