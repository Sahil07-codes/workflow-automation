import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { openBuffer, sealBuffer } from '@autoapply/crypto';
import { PrismaService } from '../../../database/prisma.service';
import { UserKeyService } from '../../users/user-key.service';

@Injectable()
export class AnswerBankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userKeyService: UserKeyService,
  ) {}

  async addAnswer(userId: string, questionText: string, answer: string) {
    const normalizedQuestion = this.normalize(questionText);
    if (!normalizedQuestion || !answer.trim()) {
      throw new Error('Question and answer must not be empty');
    }
    const questionHash = createHash('sha256')
      .update(normalizedQuestion)
      .digest('hex');
    const dek = await this.userKeyService.getDek(userId);
    const answerEnc = sealBuffer(answer, dek, userId);
    return this.prisma.answerBank.upsert({
      where: { user_id_question_hash: { user_id: userId, question_hash: questionHash } },
      create: {
        user_id: userId,
        question_hash: questionHash,
        question_text: questionText,
        answer_enc: answerEnc,
      },
      update: { question_text: questionText, answer_enc: answerEnc },
    });
  }

  async findSimilarAnswers(userId: string, query: string, limit = 5) {
    const answers = await this.prisma.answerBank.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(limit, 1), 20),
    });
    const queryWords = this.words(query);
    const dek = await this.userKeyService.getDek(userId);
    const matches = answers
      .map((entry) => {
        const words = this.words(entry.question_text);
        const sharedWords = [...queryWords].filter((word) => words.has(word)).length;
        const score =
          queryWords.size === 0 || words.size === 0
            ? 0
            : (2 * sharedWords) / (queryWords.size + words.size);
        return { entry, score };
      })
      .filter(({ score }) => score >= 0.75)
      .sort((left, right) => right.score - left.score)
      .map(({ entry, score }) => ({
        questionText: entry.question_text,
        answer: openBuffer(entry.answer_enc, dek, userId).toString('utf8'),
        confidence: score,
      }));
    return matches;
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private words(value: string): Set<string> {
    return new Set(this.normalize(value).split(/\s+/).filter(Boolean));
  }
}
