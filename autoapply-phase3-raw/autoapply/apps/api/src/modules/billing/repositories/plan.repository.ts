import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class PlanRepository {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.plan.findMany({ where: { active: true } });
  }

  async findById(id: string) {
    return this.prisma.plan.findUnique({ where: { id } });
  }

  async create(data: any) {
    return this.prisma.plan.create({ data });
  }
}
