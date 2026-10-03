import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class UserRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    email: string;
    phone_e164: string;
    password_hash?: string;
    referral_code: string;
    consent_version: string;
  }) {
    return this.prisma.user.create({
      data: {
        ...data,
        role: 'USER',
        status: 'PENDING',
        consent_at: new Date(),
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async findByPhone(phone_e164: string) {
    return this.prisma.user.findUnique({ where: { phone_e164 } });
  }

  async findByEmailOrPhone(email: string, phone_e164: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { phone_e164 },
        ],
      },
    });
  }

  async updateEmailVerified(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { email_verified_at: new Date() },
    });
  }

  async updatePhoneVerified(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { phone_verified_at: new Date() },
    });
  }

  async updateStatus(id: string, status: UserStatus) {
    return this.prisma.user.update({
      where: { id },
      data: { status },
    });
  }

  async updatePassword(id: string, password_hash: string) {
    return this.prisma.user.update({
      where: { id },
      data: { password_hash },
    });
  }
}
