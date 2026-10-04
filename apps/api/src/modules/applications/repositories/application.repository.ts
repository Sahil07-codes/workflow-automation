import { Injectable } from '@nestjs/common';
import { Application, ApplicationState, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ApplicationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Application | null> {
    return this.prisma.application.findUnique({ where: { id } });
  }

  findOwned(id: string, userId: string): Promise<Application | null> {
    return this.prisma.application.findFirst({ where: { id, userId } });
  }

  findByUserAndJob(userId: string, jobId: string): Promise<Application | null> {
    return this.prisma.application.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });
  }

  create(data: {
    userId: string;
    jobId: string;
    companyName: string;
    jobTitle: string;
    matchScore?: number;
  }): Promise<Application> {
    return this.prisma.application.create({
      data: { ...data, state: 'PREPARING' },
    });
  }

  findByUserId(
    userId: string,
    state: ApplicationState | undefined,
    limit: number,
    query?: string,
  ): Promise<Application[]> {
    return this.prisma.application.findMany({
      where: {
        userId,
        ...(state ? { state } : {}),
        ...(query?.trim()
          ? {
              OR: [
                {
                  companyName: {
                    contains: query.trim(),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  jobTitle: {
                    contains: query.trim(),
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async updateOwned(
    id: string,
    userId: string,
    state: ApplicationState,
    data: Prisma.ApplicationUpdateManyMutationInput,
  ): Promise<boolean> {
    const result = await this.prisma.application.updateMany({
      where: { id, userId, state },
      data,
    });
    return result.count === 1;
  }

  createEvent(
    applicationId: string,
    eventType: string,
    payload?: Prisma.InputJsonValue,
  ) {
    return this.prisma.applicationEvent.create({
      data: { applicationId, eventType, payload },
    });
  }
}
