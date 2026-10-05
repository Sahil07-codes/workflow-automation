import { PrismaClient } from '@prisma/client';
import {
  assertPublicHostname,
  ensureApplicationPreparation,
  formatJobIntakeFailure,
  getApplicationQuotaError,
  isGoogleFormsResponderUrl,
  isPublicIp,
  publicLookup,
} from './day-one.processor';

describe('isGoogleFormsResponderUrl', () => {
  it('accepts public responder links, including the account-prefixed path', () => {
    expect(isGoogleFormsResponderUrl(
      'https://docs.google.com/forms/d/e/form-id/viewform?usp=publish-editor',
    )).toBe(true);
    expect(isGoogleFormsResponderUrl(
      'https://docs.google.com/forms/u/0/d/e/form-id/viewform',
    )).toBe(true);
  });

  it('rejects editor links and other hosts', () => {
    expect(isGoogleFormsResponderUrl('https://docs.google.com/forms/d/form-id/edit')).toBe(false);
    expect(isGoogleFormsResponderUrl('https://example.com/forms/d/e/form-id/viewform')).toBe(false);
  });
});

describe('formatJobIntakeFailure', () => {
  it('explains that unauthorized pages need to be publicly accessible', () => {
    expect(formatJobIntakeFailure(new Error('Job site returned HTTP 401.'))).toContain(
      'It may require a signed-in account',
    );
  });

  it('explains when the page no longer exists', () => {
    expect(formatJobIntakeFailure(new Error('Job site returned HTTP 404.'))).toContain(
      'may have been removed or deactivated',
    );
  });

  it('does not expose low-level errors to users', () => {
    expect(formatJobIntakeFailure(new Error('socket hang up'))).toContain(
      'could not read this page',
    );
  });
});

describe('ensureApplicationPreparation', () => {
  it('creates an application and queues preparation when the user is entitled', async () => {
    const application = { id: 'application-id', state: 'PREPARING' };
    const transaction = {
      application: { create: jest.fn().mockResolvedValue(application) },
      applicationEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      application: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          currentPeriodEnd: null,
          plan: { dailyCap: 5, monthlyQuota: 20 },
          renewalOption: null,
        }),
      },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    const queue = { add: jest.fn().mockResolvedValue({}) };

    const result = await ensureApplicationPreparation(
      prisma,
      queue as never,
      'user-id',
      'job-id',
      'Example Co',
      'Engineer',
    );

    expect(result.application).toEqual(application);
    expect(result.quotaError).toBeNull();
    expect(transaction.application.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        jobId: 'job-id',
        companyName: 'Example Co',
        jobTitle: 'Engineer',
        matchScore: 0,
        state: 'PREPARING',
      },
    });
    expect(transaction.applicationEvent.create).toHaveBeenCalledWith({
      data: {
        applicationId: 'application-id',
        eventType: 'APPLICATION_STARTED',
        payload: { source: 'USER_SUBMITTED_LINK' },
      },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'prepare_application',
      { applicationId: 'application-id' },
      expect.objectContaining({ jobId: 'prepare-application-id' }),
    );
  });

  it('does not queue preparation again for an application already past preparation', async () => {
    const prisma = {
      application: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'application-id',
          state: 'AWAITING_APPROVAL',
        }),
      },
    } as unknown as PrismaClient;
    const queue = { add: jest.fn() };

    const result = await ensureApplicationPreparation(
      prisma,
      queue as never,
      'user-id',
      'job-id',
      'Example Co',
      'Engineer',
    );

    expect(result.application?.state).toBe('AWAITING_APPROVAL');
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('getApplicationQuotaError', () => {
  const originalBypass = process.env.SUBSCRIPTION_BYPASS;

  beforeEach(() => {
    process.env.SUBSCRIPTION_BYPASS = 'false';
  });

  afterAll(() => {
    if (originalBypass === undefined) delete process.env.SUBSCRIPTION_BYPASS;
    else process.env.SUBSCRIPTION_BYPASS = originalBypass;
  });

  it('bypasses subscription checks by default for all accounts', async () => {
    const original = process.env.SUBSCRIPTION_BYPASS;
    delete process.env.SUBSCRIPTION_BYPASS;
    const prisma = {
      subscription: { findFirst: jest.fn() },
    } as unknown as PrismaClient;

    await expect(getApplicationQuotaError(prisma, 'user-id')).resolves.toBeNull();
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
    if (original === undefined) delete process.env.SUBSCRIPTION_BYPASS;
    else process.env.SUBSCRIPTION_BYPASS = original;
  });

  it('explains when a user has no subscription after bypass is disabled', async () => {
    const prisma = {
      subscription: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    await expect(getApplicationQuotaError(prisma, 'user-id')).resolves.toBe(
      'No active subscription',
    );
  });

  it('respects the same daily and monthly caps as the application API', async () => {
    const prisma = {
      subscription: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          currentPeriodEnd: null,
          plan: { dailyCap: 2, monthlyQuota: 10 },
          renewalOption: { app_increase: 0 },
        }),
      },
      application: {
        count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(2),
      },
    } as unknown as PrismaClient;

    await expect(getApplicationQuotaError(prisma, 'user-id')).resolves.toBe(
      'Daily application limit reached',
    );
  });

  it('includes renewal quota when checking the monthly cap', async () => {
    const prisma = {
      subscription: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          currentPeriodEnd: null,
          plan: { dailyCap: 5, monthlyQuota: 10 },
          renewalOption: { app_increase: 2 },
        }),
      },
      application: {
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(12),
      },
    } as unknown as PrismaClient;

    await expect(getApplicationQuotaError(prisma, 'user-id')).resolves.toBe(
      'Monthly application quota reached',
    );
  });
});

describe('isPublicIp', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '169.254.169.254',
    '172.20.0.1',
    '192.168.1.1',
    '198.51.100.20',
    '203.0.113.10',
    '224.0.0.1',
    '::1',
    'fe80::1',
    'fd00::1',
    '2001:db8::1',
  ])('rejects restricted address %s', (address) => {
    expect(isPublicIp(address)).toBe(false);
  });

  describe('assertPublicHostname', () => {
    it('rejects local-only hostnames without resolving them', async () => {
      await expect(assertPublicHostname('localhost')).rejects.toThrow(
        'Local or internal host rejected.',
      );
    });

    it('rejects private literal addresses', async () => {
      await expect(assertPublicHostname('127.0.0.1')).rejects.toThrow(
        'Private or restricted host rejected.',
      );
    });

    it('accepts public literal addresses', async () => {
      await expect(assertPublicHostname('8.8.8.8')).resolves.toBeUndefined();
    });
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'accepts public address %s',
    (address) => {
      expect(isPublicIp(address)).toBe(true);
    },
  );

  it('returns an address array when Node requests all DNS results', (done) => {
    publicLookup('8.8.8.8', { all: true }, (error, result) => {
      expect(error).toBeNull();
      expect(result).toEqual([{ address: '8.8.8.8', family: 4 }]);
      done();
    });
  });

  it('returns a single address when Node requests the default lookup form', (done) => {
    publicLookup('8.8.8.8', {}, (error, address, family) => {
      expect(error).toBeNull();
      expect(address).toBe('8.8.8.8');
      expect(family).toBe(4);
      done();
    });
  });
});
