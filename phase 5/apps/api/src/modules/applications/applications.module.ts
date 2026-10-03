import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './services/applications.service';
import { ApplicationRepository } from './repositories/application.repository';
import { FormDetectionCacheRepository } from './repositories/form-detection-cache.repository';
import { PrismaService } from '../../database/prisma.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'prepare',
    }),
  ],
  controllers: [ApplicationsController],
  providers: [
    ApplicationsService,
    ApplicationRepository,
    FormDetectionCacheRepository,
    PrismaService,
  ],
  exports: [ApplicationsService, ApplicationRepository],
})
export class ApplicationsModule {}
