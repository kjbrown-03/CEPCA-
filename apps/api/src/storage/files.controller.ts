import { Controller, Get, Headers, Param, Res } from '@nestjs/common'
import type { Response } from 'express'
import { NotFound, OptionalAuth, Public } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { MaybeUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { MemberContextService } from '../member/member-context.service'
import { StorageService, asciiName } from './storage.service'

/**
 * Tous les fichiers passent par ici : droits vérifiés à chaque requête, stockage invisible depuis Internet.
 * Les images d'illustration (préfixe img/) sont publiques par nature ; prédications et documents
 * suivent les règles de diffusion du fidèle.
 */
@Controller('files')
@Public()
@OptionalAuth()
export class FilesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ctx: MemberContextService,
  ) {}

  @Get('img/:key')
  async image(@Param('key') key: string, @Res() res: Response) {
    if (!/^img\/[\w\-/.]+$/.test(key) || key.includes('..')) throw NotFound('Fichier')
    return this.pipe(res, key, undefined, { cache: 'public, max-age=86400', inline: true, name: key.split('/').pop()! })
  }

  @Get('sermon/:id')
  async sermon(@MaybeUser() p: Principal | null, @Param('id') id: string, @Headers('range') range: string | undefined, @Res() res: Response) {
    const c = await this.ctx.forPrincipal(p)
    const s = await this.prisma.spiritualContent.findFirst({ where: { id, status: 'PUBLISHED', mediaKey: { not: null }, structure: { path: { in: c.visiblePaths } }, ...(c.status !== 'ACTIVE' ? { isPublic: true } : {}) } })
    if (!s?.mediaKey) throw NotFound('Prédication')
    if (!range || range.startsWith('bytes=0-')) await this.prisma.spiritualContent.update({ where: { id }, data: { playCount: { increment: 1 } } })
    return this.pipe(res, s.mediaKey, range, { cache: 'private, max-age=600', inline: true, name: s.title })
  }

  @Get('doc/:id')
  async document(@MaybeUser() p: Principal | null, @Param('id') id: string, @Res() res: Response) {
    const c = await this.ctx.forPrincipal(p)
    const d = await this.prisma.document.findFirst({
      where: { id, archivedAt: null, structure: { path: { in: c.visiblePaths } }, visibility: c.status === 'ACTIVE' ? { in: ['PUBLIC', 'MEMBERS'] } : 'PUBLIC' },
    })
    if (!d) throw NotFound('Document')
    await this.prisma.document.update({ where: { id }, data: { downloads: { increment: 1 } } })
    return this.pipe(res, d.fileKey, undefined, { cache: 'private, max-age=600', inline: false, name: d.title + (d.mimeType === 'application/pdf' ? '.pdf' : '') })
  }

  private async pipe(res: Response, key: string, range: string | undefined, o: { cache: string; inline: boolean; name: string }) {
    let obj
    try {
      obj = await this.storage.stream(key, range && /^bytes=\d*-\d*$/.test(range) ? range : undefined)
    } catch {
      throw NotFound('Fichier')
    }
    res.setHeader('Content-Type', obj.contentType)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', o.cache)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', `${o.inline ? 'inline' : 'attachment'}; filename="${asciiName(o.name)}"`)
    if (obj.contentLength) res.setHeader('Content-Length', String(obj.contentLength))
    if (obj.contentRange) {
      res.status(206)
      res.setHeader('Content-Range', obj.contentRange)
    }
    obj.body.pipe(res)
  }
}
