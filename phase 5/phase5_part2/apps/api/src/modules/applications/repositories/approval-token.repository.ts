import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class ApprovalTokenRepository {
  constructor(private prisma: PrismaService) {}

  async findByApplicationId(applicationId: string) {
    return this.prisma.approvalToken.findUnique({
      where: { applicationId },
    });
  }

  async findByTokenHash(tokenHash: string) {
    return this.prisma.approvalToken.findFirst({
      where: { tokenHash },
    });
  }

  async create(data: any) {
    return this.prisma.approvalToken.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.approvalToken.update({
      where: { id },
      data,
    });
  }

  async markUsed(id: string, userIp: string, usedAt: Date) {
    return this.prisma.approvalToken.update({
      where: { id },
      data: {
        usedAt,
        usedByIp: userIp,
      },
    });
  }
}
