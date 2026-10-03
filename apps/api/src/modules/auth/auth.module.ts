import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OtpService } from './services/otp.service';
import { TokenService } from './services/token.service';
import { PasswordService } from './services/password.service';
import { OtpChallengeRepository } from './repositories/otp-challenge.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { UserRepository } from './repositories/user.repository';
import { PrismaService } from '@/database/prisma.service';
import { RedisService } from '@/common/services/redis.service';
import { OtpDelivery } from './services/otp-delivery';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [
    ReferralsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const configuredExpiry = configService.get<string>('jwt_expiry', '15m');
        const expiresIn = /^\d+$/.test(configuredExpiry)
          ? Number(configuredExpiry)
          : configuredExpiry;

        return {
          privateKey: configService
            .getOrThrow<string>('jwt_private_key')
            .replace(/\\n/g, '\n'),
          publicKey: configService
            .getOrThrow<string>('jwt_public_key')
            .replace(/\\n/g, '\n'),
          signOptions: {
            expiresIn: expiresIn as NonNullable<
              JwtModuleOptions['signOptions']
            >['expiresIn'],
            algorithm: 'RS256',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    OtpDelivery,
    RedisService,
    TokenService,
    PasswordService,
    OtpChallengeRepository,
    RefreshTokenRepository,
    UserRepository,
    PrismaService,
  ],
  exports: [TokenService, AuthService],
})
export class AuthModule {}
