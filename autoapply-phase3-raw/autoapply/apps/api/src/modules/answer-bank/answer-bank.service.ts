import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { sha256Hex } from '@autoapply/crypto';
import { AppException } from '@/common/exceptions/app.exception';

@Injectable()
export class AnswerBankService {
  constructor(private prisma: PrismaService) {}

  private hashQuestion(question: string): string {
    const normalized = question.toLowerCase().trim();
    return sha256Hex(normalized);
  }

  async saveAnswer(userId: string, question: string, answer: string) {
    const questionHash = this.hashQuestion(question);

    // Check if answer already exists
    const existing = await this.prisma.answerBank.findUnique({
      where: {
        user_id_question_hash: {
          user_id: userId,
          question_hash: questionHash,
        },
      },
    });

    if (existing) {
      // Update existing answer
      return this.prisma.answerBank.update({
        where: {
          user_id_question_hash: {
            user_id: userId,
            question_hash: questionHash,
          },
        },
        data: {
          answer_enc: Buffer.from(answer), // In production, encrypt this
          question_text: question,
        },
        select: {
          user_id: true,
          question_hash: true,
          question_text: true,
        },
      });
    }

    // Create new answer
    return this.prisma.answerBank.create({
      data: {
        user_id: userId,
        question_hash: questionHash,
        question_text: question,
        answer_enc: Buffer.from(answer), // In production, encrypt this
      },
      select: {
        user_id: true,
        question_hash: true,
        question_text: true,
      },
    });
  }

  async getAnswer(userId: string, question: string) {
    const questionHash = this.hashQuestion(question);

    const entry = await this.prisma.answerBank.findUnique({
      where: {
        user_id_question_hash: {
          user_id: userId,
          question_hash: questionHash,
        },
      },
    });

    if (!entry) {
      throw new AppException('ANSWER_NOT_FOUND', 'Answer not found.', 404);
    }

    return {
      question: entry.question_text,
      answer: entry.answer_enc.toString(), // In production, decrypt this
    };
  }

  async getAllAnswers(userId: string) {
    const answers = await this.prisma.answerBank.findMany({
      where: { user_id: userId },
      select: {
        question_text: true,
        question_hash: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return answers;
  }

  async deleteAnswer(userId: string, question: string) {
    const questionHash = this.hashQuestion(question);

    return this.prisma.answerBank.delete({
      where: {
        user_id_question_hash: {
          user_id: userId,
          question_hash: questionHash,
        },
      },
    });
  }

  async searchAnswers(userId: string, query: string) {
    const answers = await this.prisma.answerBank.findMany({
      where: {
        user_id: userId,
        question_text: {
          contains: query,
          mode: 'insensitive',
        },
      },
      select: {
        question_text: true,
        question_hash: true,
        created_at: true,
      },
      take: 20,
    });

    return answers;
  }
}
