import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from '@/database/prisma.service';
import { UserKeyService } from './user-key.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserKeyService, PrismaService],
  exports: [UsersService, UserKeyService],
})
export class UsersModule {}
