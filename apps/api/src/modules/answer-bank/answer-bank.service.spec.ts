import { openBuffer } from '@autoapply/crypto';
import { AnswerBankService } from './answer-bank.service';
import { PrismaService } from '@/database/prisma.service';
import { UserKeyService } from '@/modules/users/user-key.service';

describe('AnswerBankService', () => {
  const dek = Buffer.alloc(32, 7);
  let prisma: any;
  let userKeyService: jest.Mocked<UserKeyService>;
  let service: AnswerBankService;

  beforeEach(() => {
    prisma = {
      answerBank: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    userKeyService = { getDek: jest.fn().mockResolvedValue(dek) } as any;
    service = new AnswerBankService(
      prisma as PrismaService,
      userKeyService,
    );
  });

  it('encrypts answers with the user key and binds ciphertext to the user', async () => {
    const answer = 'My plain-text answer';

    await service.saveAnswer('user-123', 'Why this role?', answer);

    const savedAnswer = prisma.answerBank.create.mock.calls[0][0].data.answer_enc;
    expect(savedAnswer).not.toEqual(Buffer.from(answer));
    expect(openBuffer(savedAnswer, dek, 'user-123').toString('utf8')).toBe(answer);
    expect(() => openBuffer(savedAnswer, dek, 'another-user')).toThrow();
  });

  it('decrypts answers only with the owning user key and AAD', async () => {
    const { sealBuffer } = await import('@autoapply/crypto');
    prisma.answerBank.findUnique.mockResolvedValueOnce({
      question_text: 'Why this role?',
      answer_enc: sealBuffer('My answer', dek, 'user-123'),
    });

    await expect(
      service.getAnswer('user-123', 'Why this role?'),
    ).resolves.toEqual({ question: 'Why this role?', answer: 'My answer' });
  });
});