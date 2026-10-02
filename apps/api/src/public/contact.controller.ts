import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import { contactSchema, type ContactInput } from '@cepca/shared'
import { Public, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'

/** Formulaire de contact du portail : limiteur dédié (15 / 10 min par IP). */
@Controller('public')
@Public()
export class ContactController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('contact')
  @HttpCode(201)
  @Throttle({ default: { limit: 15, ttl: 10 * 60 * 1000 } })
  async contact(@Body(new ZodPipe(contactSchema)) body: ContactInput, @Req() req: Request) {
    await this.prisma.contactMessage.create({ data: { ...body, ip: req.ip ?? null } })
    return { ok: true }
  }

  /** Sonde de l'orchestrateur : l'API répond et la base aussi. */
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`
    return { ok: true }
  }
}
