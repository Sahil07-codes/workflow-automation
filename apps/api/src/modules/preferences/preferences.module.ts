import { Module } from '@nestjs/common';
import { PreferencesService } from './preferences.service';
import { PreferencesController } from './preferences.controller';
import { PrismaService } from '@/database/prisma.service';

@Module({
  controllers: [PreferencesController],
  providers: [PreferencesService, PrismaService],
  exports: [PreferencesService],
})
export class PreferencesModule {}
