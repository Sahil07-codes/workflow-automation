import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { AppException } from '@/common/exceptions/app.exception';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone_e164: true,
        role: true,
        status: true,
        email_verified_at: true,
        phone_verified_at: true,
        created_at: true,
      },
    });

    if (!user) {
      throw new AppException('USER_NOT_FOUND', 'User not found.', 404);
    }

    return user;
  }

  async getUserPublic(id: string) {
    return this.getUserById(id);
  }

  async updateUserStatus(id: string, status: string) {
    const validStatuses = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED'];
    
    if (!validStatuses.includes(status)) {
      throw new AppException('INVALID_STATUS', 'Invalid user status.', 400);
    }

    return this.prisma.user.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        email: true,
        status: true,
      },
    });
  }

  async listUsers(limit = 50, offset = 0) {
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        take: limit,
        skip: offset,
        select: {
          id: true,
          email: true,
          phone_e164: true,
          role: true,
          status: true,
          created_at: true,
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    return { users, total, limit, offset };
  }

  async deleteUser(id: string) {
    // Soft delete
    return this.prisma.user.update({
      where: { id },
      data: { status: 'DELETED' },
    });
  }
}
