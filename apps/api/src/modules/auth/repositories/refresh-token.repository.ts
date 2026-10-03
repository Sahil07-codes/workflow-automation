import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class RefreshTokenRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    user_id: string;
    family_id: string;
    token_hash: string;
    expires_at: Date;
    ip?: string;
    user_agent?: string;
  }) {
    return this.prisma.refreshToken.create({ data });
  }

  async findByHash(token_hash: string) {
    return this.prisma.refreshToken.findUnique({
      where: { token_hash },
      include: { user: true },
    });
  }

  async findById(id: string) {
    return this.prisma.refreshToken.findUnique({
      where: { id },
      include: { user: true },
    });
  }

  async markUsedIfUnused(id: string): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id, used_at: null, revoked_at: null },
      data: { used_at: new Date() },
    });
    return result.count === 1;
  }

  async revokeFamily(family_id: string) {
    return this.prisma.refreshToken.updateMany({
      where: { family_id },
      data: { revoked_at: new Date() },
    });
  }

  async revokeByUserId(user_id: string) {
    return this.prisma.refreshToken.updateMany({
      where: { user_id },
      data: { revoked_at: new Date() },
    });
  }
}
