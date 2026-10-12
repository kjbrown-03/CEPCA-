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
import { OtpService } from './auth/otp.service'
import { MailService } from './mail/mail.service'
import { TokensService } from './auth/tokens.service'
import { MemberContextService } from './member/member-context.service'
import { FeedController, MemberActionsController } from './member/feed.controller'
import { DirectoryController, MeController } from './member/me.controller'
import { FilesController } from './storage/files.controller'
import { ContributionsService } from './payments/contributions.service'
import { ContributionsController, RecurringController, WebhooksController } from './payments/contributions.controller'
import { FapshiProvider, SandboxProvider } from './payments/providers'
import { ContactController } from './public/contact.controller'
import { PortalController } from './public/portal.controller'
import { AdminScope, StaffGuard } from './admin/admin-common'
import { AudienceService, PushService } from './admin/audience.service'
import { ReportsService } from './admin/reports.service'
import { AdminCampaignsController, CampaignsService } from './admin/campaigns.controller'
import { AdminEventsController } from './admin/events.controller'
import { AdminFinanceController } from './admin/finance.controller'
import { AdminMediaController } from './admin/media.controller'
import { AdminProjectsController } from './admin/projects.controller'
import { AdminPublicationsController } from './admin/publications.controller'
import { AdminRolesController } from './admin/roles.controller'
import { AdminConfessionsController, AdminStructuresController } from './admin/structures.controller'
import { AdminUsersController } from './admin/users.controller'
import { AdminDashboardController } from './admin/dashboard.controller'
import { AdminReportsController } from './admin/reports.controller'
import { AdminSettingsController } from './admin/settings.controller'

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
    PortalController,
    // Back-office
    AdminRolesController,
    AdminDashboardController,
    AdminStructuresController,
    AdminConfessionsController,
    AdminUsersController,
    AdminPublicationsController,
    AdminEventsController,
    AdminMediaController,
    AdminCampaignsController,
    AdminProjectsController,
    AdminFinanceController,
    AdminReportsController,
    AdminSettingsController,
  ],
  providers: [
    AccessService,
    TokensService,
    OtpService,
    MailService,
    MemberContextService,
    SandboxProvider,
    FapshiProvider,
    ContributionsService,
    StaffGuard,
    AdminScope,
    PushService,
    AudienceService,
    CampaignsService,
    ReportsService,
    // Ordre : limiteur avant authentification, pour qu'une rafale coûte le moins possible
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
