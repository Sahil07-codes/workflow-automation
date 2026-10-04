import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApplicationState, UserStatus } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

const PAGE_SIZE = 50;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getOverview() {
    const [
      totalUsers,
      activeUsers,
      activeSubscriptions,
      subscriptionRecords,
      totalApplications,
      applicationStates,
      totalReferrals,
      qualifiedReferrals,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.subscription.count({
        where: { status: { equals: 'ACTIVE', mode: 'insensitive' } },
      }),
      this.prisma.subscription.findMany({
        where: { status: { equals: 'ACTIVE', mode: 'insensitive' } },
        select: { plan: { select: { pricePaise: true } } },
      }),
      this.prisma.application.count(),
      this.prisma.application.groupBy({
        by: ['state'],
        _count: { _all: true },
      }),
      this.prisma.referrals.count(),
      this.prisma.referrals.count({
        where: { status: { equals: 'QUALIFIED', mode: 'insensitive' } },
      }),
    ]);

    const monthlyRevenuePaise = subscriptionRecords.reduce(
      (total, subscription) => total + subscription.plan.pricePaise,
      0,
    );

    return {
      metrics: {
        total_users: totalUsers,
        active_users: activeUsers,
        active_subscriptions: activeSubscriptions,
        monthly_recurring_revenue: monthlyRevenuePaise / 100,
        total_applications: totalApplications,
        qualified_referrals: qualifiedReferrals,
        total_referrals: totalReferrals,
      },
      application_funnel: applicationStates.map(({ state, _count }) => ({
        stage: state,
        count: _count._all,
      })),
      system_health: { database: { status: 'healthy' } },
      alerts: [],
    };
  }

  async getUsers(query?: string, status?: string, cursor?: string) {
    const parsedStatus = this.parseUserStatus(status);
    const q = query?.trim();
    const rows = await this.prisma.user.findMany({
      where: {
        ...(parsedStatus ? { status: parsedStatus } : {}),
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: 'insensitive' as const } },
                { phone_e164: { contains: q } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        phone_e164: true,
        role: true,
        status: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: this.parseCursor(cursor) }, skip: 1 } : {}),
    });
    return this.page(rows);
  }

  async getApplications(query?: string, status?: string, cursor?: string) {
    const parsedStatus = this.parseApplicationState(status);
    const q = query?.trim();
    const rows = await this.prisma.application.findMany({
      where: {
        ...(parsedStatus ? { state: parsedStatus } : {}),
        ...(q
          ? {
              OR: [
                { companyName: { contains: q, mode: 'insensitive' as const } },
                { jobTitle: { contains: q, mode: 'insensitive' as const } },
                { user: { email: { contains: q, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        userId: true,
        state: true,
        companyName: true,
        jobTitle: true,
        matchScore: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: this.parseCursor(cursor) }, skip: 1 } : {}),
    });
    return this.page(rows);
  }

  async getSubscriptions(query?: string, status?: string, cursor?: string) {
    const q = query?.trim();
    const rows = await this.prisma.subscription.findMany({
      where: {
        ...(status
          ? { status: { equals: status, mode: 'insensitive' as const } }
          : {}),
        ...(q
          ? {
              OR: [
                { user: { email: { contains: q, mode: 'insensitive' as const } } },
                { plan: { name: { contains: q, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        status: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        updatedAt: true,
        user: { select: { email: true } },
        plan: { select: { id: true, name: true, pricePaise: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: this.parseCursor(cursor) }, skip: 1 } : {}),
    });
    return this.page(rows);
  }

  async getReferrals(query?: string, status?: string, cursor?: string) {
    const q = query?.trim();
    const rows = await this.prisma.referrals.findMany({
      where: {
        ...(status
          ? { status: { equals: status, mode: 'insensitive' as const } }
          : {}),
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: 'insensitive' as const } },
                {
                  referrer: {
                    email: { contains: q, mode: 'insensitive' as const },
                  },
                },
                {
                  referee: {
                    email: { contains: q, mode: 'insensitive' as const },
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        code: true,
        status: true,
        referred_at: true,
        qualified_at: true,
        referrer: { select: { email: true } },
        referee: { select: { email: true } },
      },
      orderBy: { referred_at: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: this.parseCursor(cursor) }, skip: 1 } : {}),
    });
    return this.page(rows);
  }

  getAdapters() {
    const adapters = [
      ['Greenhouse', this.config.get<string>('greenhouse_board_tokens', '')],
      ['Lever', this.config.get<string>('lever_company_ids', '')],
      ['Ashby', this.config.get<string>('ashby_company_ids', '')],
    ];
    return {
      items: adapters.map(([name, configured]) => ({
        name,
        configured: Boolean(configured.trim()),
        status: configured.trim() ? 'CONFIGURED' : 'NOT_CONFIGURED',
      })),
    };
  }

  getFlags() {
    return {
      items: [
        {
          name: 'LLM_SCORING_ENABLED',
          enabled: this.config.get<boolean>('llm_scoring_enabled', false),
          source: 'environment',
          mutable: false,
        },
      ],
    };
  }

  async getAuditLog(cursor?: string) {
    const rows = await this.prisma.applicationEvent.findMany({
      select: {
        id: true,
        eventType: true,
        createdAt: true,
        application: {
          select: {
            id: true,
            companyName: true,
            jobTitle: true,
            state: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: this.parseCursor(cursor) }, skip: 1 } : {}),
    });
    return this.page(rows);
  }

  private parseUserStatus(status?: string): UserStatus | undefined {
    if (!status) return undefined;
    const normalized = status.toUpperCase();
    if (!Object.values(UserStatus).includes(normalized as UserStatus)) {
      throw new BadRequestException('Invalid user status filter.');
    }
    return normalized as UserStatus;
  }

  private parseApplicationState(
    status?: string,
  ): ApplicationState | undefined {
    if (!status) return undefined;
    const normalized = status.toUpperCase();
    if (!Object.values(ApplicationState).includes(normalized as ApplicationState)) {
      throw new BadRequestException('Invalid application status filter.');
    }
    return normalized as ApplicationState;
  }

  private parseCursor(cursor: string): string {
    if (!UUID_PATTERN.test(cursor)) {
      throw new BadRequestException('Invalid pagination cursor.');
    }
    return cursor;
  }

  private page<T extends { id: string }>(rows: T[]) {
    const hasMore = rows.length > PAGE_SIZE;
    const items = rows.slice(0, PAGE_SIZE);
    return {
      items,
      pagination: {
        next_cursor: hasMore ? items[items.length - 1]?.id ?? null : null,
        previous_cursor: null,
      },
    };
  }
}
