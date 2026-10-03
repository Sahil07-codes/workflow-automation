import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { ProfileEncryptionService } from './services/profile-encryption.service';
import { PrismaService } from '@/database/prisma.service';
import { UsersModule } from '../users/users.module';
import { FieldMatcherService } from './services/field-matcher.service';
import { AnswerBankService } from './services/answer-bank.service';

@Module({
  imports: [UsersModule],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    ProfileEncryptionService,
    FieldMatcherService,
    AnswerBankService,
    PrismaService,
  ],
  exports: [ProfileService, FieldMatcherService, AnswerBankService],
})
export class ProfileModule {}
