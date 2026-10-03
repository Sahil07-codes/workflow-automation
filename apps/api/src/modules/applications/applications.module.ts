import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { ProfileModule } from '../profile/profile.module';
import { UsersModule } from '../users/users.module';
import { PrismaService } from '../../database/prisma.service';
import { ApplicationsController } from './applications.controller';
import { ApprovalController } from './controllers/approval.controller';
import { ApplicationsService } from './services/applications.service';
import { PayloadEncryptionService } from './services/payload-encryption.service';
import { ApprovalTokenService } from './services/approval-token.service';
import { ApplicationRepository } from './repositories/application.repository';
import { ApprovalTokenRepository } from './repositories/approval-token.repository';
import { ApplicationQueueService } from './services/application-queue.service';
import { ApplicationScreenshotService } from './services/application-screenshot.service';

@Module({
  imports: [BillingModule, ProfileModule, UsersModule],
  controllers: [ApplicationsController, ApprovalController],
  providers: [
    ApplicationsService,
    ApplicationQueueService,
    ApplicationScreenshotService,
    PayloadEncryptionService,
    ApprovalTokenService,
    ApplicationRepository,
    ApprovalTokenRepository,
    PrismaService,
  ],
  exports: [ApplicationsService, ApplicationRepository],
})
export class ApplicationsModule {}
