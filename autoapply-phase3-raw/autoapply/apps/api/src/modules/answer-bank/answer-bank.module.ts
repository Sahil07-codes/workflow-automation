import { Module } from '@nestjs/common';
import { AnswerBankService } from './answer-bank.service';
import { AnswerBankController } from './answer-bank.controller';
import { PrismaService } from '@/database/prisma.service';

@Module({
  controllers: [AnswerBankController],
  providers: [AnswerBankService, PrismaService],
  exports: [AnswerBankService],
})
export class AnswerBankModule {}
