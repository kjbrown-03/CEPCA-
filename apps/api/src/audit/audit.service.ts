import { Global, Injectable, Logger, Module } from '@nestjs/common'
import type { AuditCategory, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface AuditEntry {
  actorId?: string | null
  actorLabel: string
  category: AuditCategory
  action: string
  entityType?: string
  entityId?: string
  structureId?: string | null
  structurePath?: string | null
  ip?: string | null
  success?: boolean
  /** Jamais de secret, de code OTP ni de numéro complet ici. */
  metadata?: Prisma.InputJsonValue
}

type Tx = Prisma.TransactionClient | PrismaService

@Injectable()
export class AuditService {
  private readonly log = new Logger('Audit')
  constructor(private readonly prisma: PrismaService) {}

  /** Écrit dans la transaction fournie quand l'action en a une, pour que l'action et sa trace soient indissociables. */
  async record(e: AuditEntry, tx: Tx = this.prisma) {
    try {
      await tx.auditLog.create({
        data: {
          actorId: e.actorId ?? null,
          actorLabel: e.actorLabel,
          category: e.category,
          action: e.action,
          entityType: e.entityType,
          entityId: e.entityId,
          structureId: e.structureId ?? null,
          structurePath: e.structurePath ?? null,
          ip: e.ip ?? null,
          success: e.success ?? true,
          metadata: e.metadata,
        },
      })
    } catch (err) {
      // Hors transaction, un échec d'écriture du journal ne doit pas passer inaperçu
      this.log.error(`Écriture du journal impossible : ${(err as Error).message}`)
      if (tx !== this.prisma) throw err
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
