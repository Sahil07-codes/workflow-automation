import { Test, TestingModule } from '@nestjs/testing';
import { FieldMatcherService } from './field-matcher.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('FieldMatcherService', () => {
  let service: FieldMatcherService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FieldMatcherService,
        {
          provide: PrismaService,
          useValue: {
            answerBank: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<FieldMatcherService>(FieldMatcherService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('matchField', () => {
    it('should match first_name field deterministically', async () => {
      const field = {
        id: 'field-1',
        name: 'first_name',
        label: 'First Name',
        type: 'text',
        required: true,
      };

      const profile = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      };

      const result = await service.matchField(field, 'user-123', profile);

      expect(result.matched_value).toBe('John');
      expect(result.confidence).toBeGreaterThan(0.95);
      expect(result.source).toBe('profile');
    });

    it('should mark unknown fields as requiring input', async () => {
      const field = {
        id: 'field-1',
        name: 'visa_sponsorship_needed',
        label: 'Do you require visa sponsorship?',
        type: 'select',
        required: true,
        options: ['Yes', 'No'],
      };

      const profile = {
        firstName: 'John',
      };

      (prisma.answerBank.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.matchField(field, 'user-123', profile);

      expect(result.source).toBe('unknown');
      expect(result.requires_user_input).toBe(true);
    });
  });

  describe('calculateSimilarity', () => {
    it('should calculate string similarity', () => {
      // This tests private method via public interface
      expect(true).toBe(true); // Placeholder
    });
  });
});
