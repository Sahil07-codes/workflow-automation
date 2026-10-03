import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ApplicationRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    userId: string;
    jobId: string;
    companyName: string;
    jobTitle: string;
  }) {
    return await this.prisma.application.create({
      data: {
        ...data,
        state: 'DISCOVERED',
      },
    });
  }

  async findById(id: string) {
    return await this.prisma.application.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: 'desc' } } },
    });
  }

  async findByUserAndJob(userId: string, jobId: string) {
    return await this.prisma.application.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });
  }

  async updateState(
    id: string,
    state: string,
    data?: Record<string, unknown>,
  ) {
    return await this.prisma.application.update({
      where: { id },
      data: {
        state: state as any,
        ...data,
      },
    });
  }

  async createEvent(
    applicationId: string,
    eventType: string,
    payload?: Record<string, unknown>,
  ) {
    return await this.prisma.applicationEvent.create({
      data: {
        applicationId,
        eventType,
        payload,
      },
    });
  }

  async findByUserId(userId: string, state?: string, limit = 50) {
    return await this.prisma.application.findMany({
      where: {
        userId,
        ...(state && { state: state as any }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
