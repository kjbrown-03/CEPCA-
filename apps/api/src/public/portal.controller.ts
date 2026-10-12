import { Controller, Get, Param, Query } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { PUBLICATION_KIND_LABEL } from '@cepca/shared'
import { NotFound, Public, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { mediaUrl } from '../storage/storage.service'

const newsQuery = z.strictObject({
  confession: z.string().regex(/^[A-Z0-9]{2,12}$/).optional(),
  kind: z.enum(['ACTUALITE', 'COMMUNIQUE']).optional(),
  take: z.coerce.number().int().min(1).max(24).default(7),
  cursor: z.string().max(40).optional(),
})

const newsSelect = {
  id: true,
  kind: true,
  title: true,
  body: true,
  imageKey: true,
  publishedAt: true,
  target: { select: { name: true, depth: true, confession: { select: { code: true } } } },
} as const satisfies Prisma.PublicationSelect
type NewsRow = Prisma.PublicationGetPayload<{ select: typeof newsSelect }>

/** Le portail ne montre que les nouvelles publiques des Églises membres : actualités et communiqués, sans groupe ciblé. */
const PUBLIC_NEWS: Prisma.PublicationWhereInput = { status: 'PUBLISHED', isPublic: true, groupId: null, kind: { in: ['ACTUALITE', 'COMMUNIQUE'] } }

function excerpt(body: string, max = 220): string {
  const text = body.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…'
}

function toNews(r: NewsRow) {
  return {
    id: r.id,
    kind: r.kind,
    kindLabel: PUBLICATION_KIND_LABEL[r.kind],
    title: r.title,
    excerpt: excerpt(r.body),
    source: r.target.depth === 0 ? 'CEPCA' : (r.target.confession?.code ?? 'CEPCA'),
    origin: r.target.name,
    imageUrl: mediaUrl('img', r.imageKey),
    publishedAt: r.publishedAt?.toISOString() ?? null,
  }
}

/** Portail public (maquette 1) : Églises membres et actualités, sans compte. */
@Controller('public')
@Public()
export class PortalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('confessions')
  async confessions() {
    const rows = await this.prisma.confession.findMany({ where: { status: { not: 'SUSPENDED' } }, select: { code: true, name: true, website: true }, orderBy: { code: 'asc' } })
    return rows
  }

  /** Actualités du CEPCA et, si une confession est choisie, les siennes ; sinon celles de toutes. */
  @Get('news')
  async news(@Query(new ZodPipe(newsQuery)) q: z.infer<typeof newsQuery>) {
    const where: Prisma.PublicationWhereInput = {
      ...PUBLIC_NEWS,
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.confession ? { OR: [{ target: { depth: 0 } }, { target: { confession: { code: q.confession } } }] } : {}),
    }
    const rows = await this.prisma.publication.findMany({
      where,
      select: newsSelect,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: q.take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    })
    const items = rows.slice(0, q.take)
    return { items: items.map(toNews), nextCursor: rows.length > q.take ? items[items.length - 1].id : null }
  }

  @Get('news/:id')
  async article(@Param('id') id: string) {
    const r = await this.prisma.publication.findFirst({ where: { ...PUBLIC_NEWS, id: String(id).slice(0, 40) }, select: newsSelect })
    if (!r) throw NotFound('Article')
    return { ...toNews(r), body: r.body }
  }
}
