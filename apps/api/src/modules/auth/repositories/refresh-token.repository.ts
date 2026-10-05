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
    const token = await this.prisma.refreshToken.findUnique({
      where: { token_hash },
      include: { user: true },
    });
    if (!token) return null;

    const [activity] = await this.prisma.$queryRaw<Array<{ last_activity_at: Date }>>`
      SELECT last_activity_at
      FROM refresh_tokens
      WHERE id = ${token.id}::uuid
    `;
    return { ...token, last_activity_at: activity?.last_activity_at ?? token.created_at };
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

  async touchActiveSession(
    family_id: string,
    now: Date,
    idleCutoff: Date,
    expiresAt: Date,
  ): Promise<boolean> {
    const affected = await this.prisma.$executeRaw`
      UPDATE refresh_tokens
      SET last_activity_at = ${now}, expires_at = ${expiresAt}
      WHERE family_id = ${family_id}::uuid
        AND used_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > ${now}
        AND last_activity_at > ${idleCutoff}
    `;
    return affected > 0;
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
