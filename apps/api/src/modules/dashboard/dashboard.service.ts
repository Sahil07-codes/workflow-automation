import { Injectable } from '@nestjs/common';
import { ApplicationState } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string) {
    const applicationCounts = await this.prisma.application.groupBy({
      by: ['state'],
      where: { userId },
      _count: { _all: true },
    });
    const counts = new Map(
      applicationCounts.map(({ state, _count }) => [state, _count._all]),
    );

    return {
      awaiting_approval: counts.get(ApplicationState.AWAITING_APPROVAL) ?? 0,
      needs_input: counts.get(ApplicationState.NEEDS_INPUT) ?? 0,
      submitted:
        (counts.get(ApplicationState.SUBMITTED) ?? 0) +
        (counts.get(ApplicationState.SUBMITTING) ?? 0),
      confirmed: counts.get(ApplicationState.CONFIRMED) ?? 0,
      applications: applicationCounts.map(({ state, _count }) => ({
        state,
        count: _count._all,
      })),
    };
  }
}
