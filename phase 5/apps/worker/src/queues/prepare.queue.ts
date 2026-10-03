import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrepareProcessor } from '../processors/prepare.processor';
import { FormDetectorService } from '../services/form-detector.service';
import { PlaywrightManagerService } from '../services/playwright-manager.service';
import { ApplicationRepository } from '../../applications/repositories/application.repository';
import { FormDetectionCacheRepository } from '../../applications/repositories/form-detection-cache.repository';
import { PrismaService } from '../../../database/prisma.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'prepare',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
  ],
  providers: [
    PrepareProcessor,
    FormDetectorService,
    PlaywrightManagerService,
    ApplicationRepository,
    FormDetectionCacheRepository,
    PrismaService,
  ],
  exports: [BullModule],
})
export class PrepareQueueModule {}
