import { generateDek, wrapDek } from '@autoapply/crypto';
import { PrismaService } from '@/database/prisma.service';
import { UserKeyService } from './user-key.service';

describe('UserKeyService', () => {
  it('reuses the persisted wrapped DEK for a user', async () => {
    const dek = generateDek();
    const wrapped = await wrapDek(dek);
    const prisma = {
      userKey: {
        findUnique: jest.fn().mockResolvedValue({
          user_id: 'user-123',
          dek_wrapped: wrapped,
        }),
        create: jest.fn(),
      },
    } as any;
    const service = new UserKeyService(prisma as PrismaService);

    await expect(service.getDek('user-123')).resolves.toEqual(dek);
    await expect(service.getWrappedDek('user-123')).resolves.toEqual(wrapped);
    expect(prisma.userKey.create).not.toHaveBeenCalled();
  });

  it('creates and persists a wrapped DEK when the user has no key', async () => {
    const prisma = {
      userKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
    } as any;
    const service = new UserKeyService(prisma as PrismaService);

    const dek = await service.getDek('user-123');

    expect(dek).toHaveLength(32);
    expect(prisma.userKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'user-123',
        dek_wrapped: expect.any(Buffer),
      }),
    });
  });
});