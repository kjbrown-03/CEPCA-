import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common'
import { z } from 'zod'
import { pushSubscriptionSchema, pushUnsubscribeSchema } from '@cepca/shared'
import { Public, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { CurrentUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { env } from '../config/env'

/** Abonnement d'un navigateur aux notifications push de l'application web (PWA). */
@Controller()
export class PushController {
  constructor(private readonly prisma: PrismaService) {}

  /** Clé publique VAPID dont le navigateur a besoin pour s'abonner ; null si le push n'est pas configuré. */
  @Get('push/key')
  @Public()
  key() {
    return { key: env.VAPID_PUBLIC_KEY || null }
  }

  /** Un abonnement appartient à un seul compte : sur un téléphone partagé, il suit la dernière personne connectée. */
  @Post('me/push-subscription')
  @HttpCode(200)
  async subscribe(@CurrentUser() p: Principal, @Body(new ZodPipe(pushSubscriptionSchema)) body: z.infer<typeof pushSubscriptionSchema>) {
    const data = { userId: p.userId, platform: 'web', p256dh: body.keys.p256dh, auth: body.keys.auth }
    await this.prisma.pushToken.upsert({ where: { token: body.endpoint }, create: { token: body.endpoint, ...data }, update: data })
    return { ok: true }
  }

  @Delete('me/push-subscription')
  async unsubscribe(@CurrentUser() p: Principal, @Body(new ZodPipe(pushUnsubscribeSchema)) body: z.infer<typeof pushUnsubscribeSchema>) {
    await this.prisma.pushToken.deleteMany({ where: { token: body.endpoint, userId: p.userId } })
    return { ok: true }
  }
}
