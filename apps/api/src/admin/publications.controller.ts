import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import type { ContentStatus, Prisma } from '@prisma/client'
import { z } from 'zod'
import { PUBLICATION_KIND_LABEL, adminPublicationSchema, returnSchema, updatePublicationSchema } from '@cepca/shared'
import { AppError, ClientIp, Conflict, Forbidden, NotFound, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { mediaUrl } from '../storage/storage.service'
import { AdminScope, StaffGuard, actor, cursorArgs, page } from './admin-common'
import { AudienceService, PushService } from './audience.service'

const listSchema = z.strictObject({
  status: z.enum(['DRAFT', 'SUBMITTED', 'RETURNED', 'PUBLISHED', 'ARCHIVED']).optional(),
  q: z.string().trim().max(80).optional(),
  structureId: z.string().max(40).optional(),
  cursor: z.string().max(40).optional(),
})

const pubInclude = {
  target: { select: { id: true, name: true, path: true } },
  group: { select: { id: true, name: true } },
  author: { select: { id: true, fullName: true } },
  validatedBy: { select: { fullName: true } },
} as const satisfies Prisma.PublicationInclude
type PubRow = Prisma.PublicationGetPayload<{ include: typeof pubInclude }>

export const STATUS_LABEL: Record<ContentStatus, string> = { DRAFT: 'Brouillon', SUBMITTED: 'À valider', RETURNED: 'Renvoyé', PUBLISHED: 'Publié', ARCHIVED: 'Archivé' }

@Controller('admin/publications')
@UseGuards(StaffGuard)
export class AdminPublicationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminScope,
    private readonly audit: AuditService,
    private readonly audience: AudienceService,
    private readonly push: PushService,
  ) {}

  private dto(p: Principal, r: PubRow) {
    const canValidate = this.scope.access.can(p, 'NEWS', 'validate', r.target.path)
    const canWrite = this.scope.access.can(p, 'NEWS', 'write', r.target.path)
    const editable = canWrite && (r.status !== 'PUBLISHED' || canValidate) && r.status !== 'ARCHIVED'
    return {
      id: r.id,
      title: r.title,
      kind: r.kind,
      kindLabel: PUBLICATION_KIND_LABEL[r.kind],
      body: r.body,
      status: r.status,
      statusLabel: STATUS_LABEL[r.status],
      target: { id: r.target.id, name: r.target.name },
      group: r.group,
      audience: r.group?.name ?? 'Tous les fidèles',
      notify: r.notify,
      isPublic: r.isPublic,
      imageKey: r.imageKey,
      imageUrl: mediaUrl('img', r.imageKey),
      author: r.author,
      validatedBy: r.validatedBy?.fullName ?? null,
      returnNote: r.returnNote,
      readCount: r.readCount,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
      can: { edit: editable, submit: editable && !canValidate && ['DRAFT', 'RETURNED'].includes(r.status), publish: canValidate && r.status !== 'PUBLISHED' && r.status !== 'ARCHIVED', return: canValidate && r.status === 'SUBMITTED', archive: canWrite && r.status === 'PUBLISHED' },
    }
  }

  private async load(p: Principal, id: string, action: 'read' | 'write' | 'validate') {
    const r = await this.prisma.publication.findUnique({ where: { id }, include: pubInclude })
    if (!r) throw NotFound('Publication')
    this.scope.access.assert(p, 'NEWS', action, r.target.path, 'Publication')
    return r
  }

  @Get()
  async list(@CurrentUser() p: Principal, @Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) {
    const target = await this.scope.whereWithin(p, 'NEWS', q.structureId)
    const where: Prisma.PublicationWhereInput = {
      target,
      ...(q.status ? { status: q.status } : { status: { not: 'ARCHIVED' } }),
      ...(q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {}),
    }
    const [rows, counts] = await Promise.all([
      this.prisma.publication.findMany({ where, include: pubInclude, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], ...cursorArgs(q.cursor) }),
      this.prisma.publication.groupBy({ by: ['status'], where: { target }, _count: true }),
    ])
    const r = page(rows)
    return { items: r.items.map((x) => this.dto(p, x)), nextCursor: r.nextCursor, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) }
  }

  @Get(':id')
  async one(@CurrentUser() p: Principal, @Param('id') id: string) {
    const r = await this.load(p, id, 'read')
    const recipients = await this.audience.count(r.targetStructureId, r.groupId)
    return { ...this.dto(p, r), recipients }
  }

  @Post()
  async create(@CurrentUser() p: Principal, @Body(new ZodPipe(adminPublicationSchema)) body: z.infer<typeof adminPublicationSchema>, @ClientIp() ip: string | null) {
    const s = await this.scope.structure(p, 'NEWS', 'write', body.targetStructureId)
    if (body.groupId) await this.audience.assertGroup(body.groupId, s.path)
    if (body.imageKey) assertImageKey(body.imageKey)
    const r = await this.prisma.$transaction(async (tx) => {
      const r = await tx.publication.create({ data: { ...body, confessionId: s.confessionId, authorId: p.userId, status: 'DRAFT' }, include: pubInclude })
      await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A rédigé « ${r.title} »`, entityType: 'Publication', entityId: r.id, structureId: s.id, structurePath: s.path }, tx)
      return r
    })
    return this.dto(p, r)
  }

  @Patch(':id')
  async update(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(updatePublicationSchema)) body: z.infer<typeof updatePublicationSchema>) {
    const r = await this.load(p, id, 'write')
    if (r.status === 'ARCHIVED') throw Conflict('ARCHIVED', 'Une publication archivée ne se modifie plus.')
    // Un texte déjà publié ne change que par quelqu'un qui pouvait le publier
    if (r.status === 'PUBLISHED') this.scope.access.assert(p, 'NEWS', 'validate', r.target.path, 'Publication')
    let path = r.target.path
    if (body.targetStructureId && body.targetStructureId !== r.targetStructureId) {
      const s = await this.scope.structure(p, 'NEWS', 'write', body.targetStructureId)
      path = s.path
    }
    const groupId = body.groupId === undefined ? r.groupId : body.groupId
    if (groupId) await this.audience.assertGroup(groupId, path)
    if (body.imageKey) assertImageKey(body.imageKey)
    // Une modification après renvoi ou soumission repasse en brouillon pour l'auteur sans droit de validation
    const canValidate = this.scope.access.can(p, 'NEWS', 'validate', path)
    const status: ContentStatus = r.status === 'SUBMITTED' && !canValidate ? 'DRAFT' : r.status
    const u = await this.prisma.publication.update({ where: { id }, data: { ...body, status }, include: pubInclude })
    return this.dto(p, u)
  }

  /** La communication soumet ; le pasteur (ou un niveau supérieur) publie ou renvoie. */
  @Post(':id/submit')
  @HttpCode(200)
  async submit(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const r = await this.load(p, id, 'write')
    const moved = await this.prisma.publication.updateMany({ where: { id, status: { in: ['DRAFT', 'RETURNED'] } }, data: { status: 'SUBMITTED', returnNote: null } })
    if (moved.count !== 1) throw Conflict('BAD_STATUS', 'Seul un brouillon peut être soumis.')
    await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A soumis « ${r.title} » à validation`, entityType: 'Publication', entityId: id, structureId: r.target.id, structurePath: r.target.path })
    return this.dto(p, await this.prisma.publication.findUniqueOrThrow({ where: { id }, include: pubInclude }))
  }

  @Post(':id/publish')
  @HttpCode(200)
  async publish(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const r = await this.load(p, id, 'validate')
    if (r.body.trim().length < 3) throw new AppError(400, 'EMPTY_BODY', 'Rédigez le texte avant de publier.')
    const now = new Date()
    const recipients = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.publication.updateMany({ where: { id, status: { in: ['DRAFT', 'SUBMITTED', 'RETURNED'] } }, data: { status: 'PUBLISHED', publishedAt: now, validatedById: p.userId, returnNote: null } })
      if (moved.count !== 1) throw Conflict('BAD_STATUS', 'Cette publication est déjà publiée ou archivée.')
      await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A publié « ${r.title} »`, entityType: 'Publication', entityId: id, structureId: r.target.id, structurePath: r.target.path }, tx)
      return r.notify ? await this.audience.users(r.targetStructureId, r.groupId) : []
    })
    if (recipients.length) {
      const ids = recipients.map((u) => u.id)
      const title = `Nouvelle ${PUBLICATION_KIND_LABEL[r.kind].toLowerCase()} : ${r.target.name}`
      await this.audience.inbox(ids, { kind: 'ANNOUNCEMENT', title, body: r.title, link: { screen: 'newsD', id } })
      await this.push.send(ids, title, r.title, { screen: 'newsD', id })
    }
    return { ...this.dto(p, await this.prisma.publication.findUniqueOrThrow({ where: { id }, include: pubInclude })), notified: recipients.length }
  }

  @Post(':id/return')
  @HttpCode(200)
  async sendBack(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(returnSchema)) body: z.infer<typeof returnSchema>, @ClientIp() ip: string | null) {
    const r = await this.load(p, id, 'validate')
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.publication.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'RETURNED', returnNote: body.note } })
      if (moved.count !== 1) throw Conflict('BAD_STATUS', "Seule une publication à valider peut être renvoyée à l'auteur.")
      await tx.notification.create({ data: { userId: r.authorId, kind: 'SYSTEM', title: 'Publication à revoir', body: `« ${r.title} » : ${body.note}`.slice(0, 300) } })
      await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A renvoyé « ${r.title} » à ${r.author.fullName}`, entityType: 'Publication', entityId: id, structureId: r.target.id, structurePath: r.target.path }, tx)
    })
    return this.dto(p, await this.prisma.publication.findUniqueOrThrow({ where: { id }, include: pubInclude }))
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const r = await this.load(p, id, 'write')
    const moved = await this.prisma.publication.updateMany({ where: { id, status: 'PUBLISHED' }, data: { status: 'ARCHIVED' } })
    if (moved.count !== 1) throw Conflict('BAD_STATUS', 'Seule une publication en ligne peut être archivée.')
    await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A archivé « ${r.title} »`, entityType: 'Publication', entityId: id, structureId: r.target.id, structurePath: r.target.path })
    return { id, status: 'ARCHIVED' }
  }

  /** Suppression d'un brouillon jamais publié ; une publication en ligne s'archive. */
  @Delete(':id')
  async remove(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const r = await this.load(p, id, 'write')
    if (!['DRAFT', 'RETURNED'].includes(r.status)) throw Conflict('BAD_STATUS', 'Seul un brouillon peut être supprimé. Archivez une publication en ligne.')
    if (r.authorId !== p.userId && !this.scope.access.can(p, 'NEWS', 'validate', r.target.path)) throw Forbidden("Seul l'auteur peut supprimer ce brouillon.")
    await this.prisma.$transaction(async (tx) => {
      await tx.publication.delete({ where: { id } })
      await this.audit.record({ ...actor(p, ip), category: 'SUPPRESSION', action: `A supprimé le brouillon « ${r.title} »`, entityType: 'Publication', entityId: id, structureId: r.target.id, structurePath: r.target.path }, tx)
    })
    return { id, deleted: true }
  }
}

/**
 * Une image s'utilise par sa clé de dépôt (img/…), jamais par une adresse externe : une image hébergée
 * ailleurs servirait de pixel de suivi des fidèles qui ouvrent l'app.
 */
export function assertImageKey(key: string) {
  if (!/^img\/[\w\-/.]+$/.test(key) || key.includes('..')) {
    throw new AppError(400, 'VALIDATION', 'Image invalide', { imageKey: 'Déposez l’image avant de l’utiliser' })
  }
}
