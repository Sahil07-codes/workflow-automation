import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class AnswerBankService {
  private logger = new Logger(AnswerBankService.name);

  constructor(private prisma: PrismaService) {}

  async addAnswer(
    userId: string,
    questionText: string,
    answer: string,
    source: 'user_input' | 'resume' | 'auto_filled',
  ) {
    const questionHash = this.hashQuestion(questionText);

    const existing = await this.prisma.answerBank.findFirst({
      where: { userId, questionHash },
    });

    if (existing) {
      return await this.prisma.answerBank.update({
        where: { id: existing.id },
        data: {
          answer,
          updatedAt: new Date(),
        },
      });
    }

    return await this.prisma.answerBank.create({
      data: {
        userId,
        questionText,
        questionHash,
        answer,
        source,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async findByUserId(userId: string) {
    return await this.prisma.answerBank.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findSimilarAnswers(userId: string, query: string, limit: number = 5) {
    return await this.prisma.answerBank.findMany({
      where: { userId },
      take: limit,
    });
  }

  private hashQuestion(question: string): string {
    return crypto
      .createHash('sha256')
      .update(question.toLowerCase())
      .digest('hex');
  }
}
