import { ConfigService } from '@nestjs/config';
import { EntitlementService } from './entitlement.service';

describe('EntitlementService', () => {
  it('allows application preparation without checking a subscription while bypass is enabled', async () => {
    const subscriptionRepository = { findByUserId: jest.fn() };
    const prisma = { application: { count: jest.fn() } };
    const config = { get: jest.fn().mockReturnValue(true) };
    const service = new EntitlementService(
      subscriptionRepository as never,
      prisma as never,
      config as unknown as ConfigService,
    );

    await expect(service.canSubmitApplication('user-id')).resolves.toEqual({ allowed: true });
    expect(subscriptionRepository.findByUserId).not.toHaveBeenCalled();
    expect(prisma.application.count).not.toHaveBeenCalled();
  });

  it('restores subscription checks when bypass is disabled', async () => {
    const subscriptionRepository = { findByUserId: jest.fn().mockResolvedValue(null) };
    const prisma = { application: { count: jest.fn() } };
    const config = { get: jest.fn().mockReturnValue(false) };
    const service = new EntitlementService(
      subscriptionRepository as never,
      prisma as never,
      config as unknown as ConfigService,
    );

    await expect(service.canSubmitApplication('user-id')).resolves.toEqual({
      allowed: false,
      reason: 'No active subscription',
    });
    expect(subscriptionRepository.findByUserId).toHaveBeenCalledWith('user-id');
  });
});
