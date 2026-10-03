import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { generateDek, unwrapDek, wrapDek } from '@autoapply/crypto';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class UserKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async getDek(userId: string): Promise<Buffer> {
    const userKey = await this.getOrCreateUserKey(userId);
    return unwrapDek(userKey.dek_wrapped);
  }

  async getWrappedDek(userId: string): Promise<Buffer> {
    const userKey = await this.getOrCreateUserKey(userId);
    return userKey.dek_wrapped;
  }

  private async getOrCreateUserKey(userId: string) {
    const existing = await this.prisma.userKey.findUnique({
      where: { user_id: userId },
    });
    if (existing) return existing;

    const dek = generateDek();
    const dekWrapped = await wrapDek(dek);
    try {
      return await this.prisma.userKey.create({
        data: { user_id: userId, dek_wrapped: dekWrapped },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const racedKey = await this.prisma.userKey.findUnique({
          where: { user_id: userId },
        });
        if (racedKey) return racedKey;
      }
      throw error;
    }
  }
}