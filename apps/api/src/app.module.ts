import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { env } from './config/env'
import { AllExceptionsFilter } from './common/http'
import { PrismaModule } from './prisma/prisma.service'
import { AuditModule } from './audit/audit.service'
import { StorageModule } from './storage/storage.service'
import { AccessService } from './access/access.service'
import { AuthController } from './auth/auth.controller'
import { AuthGuard } from './auth/auth.guard'
import { ConsoleSmsGateway, OtpService } from './auth/otp.service'
import { TokensService } from './auth/tokens.service'
import { MemberContextService } from './member/member-context.service'
import { FeedController, MemberActionsController } from './member/feed.controller'
import { DirectoryController, MeController } from './member/me.controller'
import { FilesController } from './storage/files.controller'
import { ContributionsService } from './payments/contributions.service'
import { ContributionsController, RecurringController, WebhooksController } from './payments/contributions.controller'
import { MtnMomoProvider, OrangeMoneyProvider, SandboxProvider } from './payments/providers'
import { ContactController } from './public/contact.controller'

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    StorageModule,
    ScheduleModule.forRoot(),
    // Limiteur général : 120 requêtes par minute et par IP. Les routes sensibles ont le leur (@Throttle).
    // Désactivé en test : toutes les specs partent de la même IP.
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60 * 1000, limit: 120 }], skipIf: () => env.NODE_ENV === 'test' }),
  ],
  controllers: [
    AuthController,
    MeController,
    DirectoryController,
    FeedController,
    MemberActionsController,
    FilesController,
    ContributionsController,
    RecurringController,
    WebhooksController,
    ContactController,
  ],
  providers: [
    AccessService,
    TokensService,
    OtpService,
    ConsoleSmsGateway,
    MemberContextService,
    SandboxProvider,
    MtnMomoProvider,
    OrangeMoneyProvider,
    ContributionsService,
    // Ordre : limiteur avant authentification, pour qu'une rafale coûte le moins possible
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
