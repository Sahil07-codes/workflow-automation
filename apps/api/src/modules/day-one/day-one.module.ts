import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { UsersModule } from '../users/users.module';
import { DayOneController } from './day-one.controller';
import { DayOneService } from './day-one.service';

@Module({
  imports: [ConfigModule, UsersModule],
  controllers: [DayOneController],
  providers: [DayOneService, PrismaService],
  exports: [DayOneService],
})
export class DayOneModule {}
