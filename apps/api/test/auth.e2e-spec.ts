import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { OtpDelivery } from '../src/modules/auth/services/otp-delivery';
import { FakeOtpDelivery } from './helpers/fake-otp-delivery';
import { createVerifiedUserAndLogin } from './helpers/authenticated-user';

describe('Auth E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let otpDelivery: FakeOtpDelivery;

  beforeAll(async () => {
    otpDelivery = new FakeOtpDelivery();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OtpDelivery)
      .useValue(otpDelivery)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean database
    await prisma.refreshToken.deleteMany();
    await prisma.otpChallenge.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('POST /v1/auth/signup', () => {
    it('should signup a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email: 'test@example.com',
          phone_e164: '+919999999999',
          consent_version: '1.0',
        })
        .expect(201);

      expect(response.body).toHaveProperty('user_id');
      expect(response.body.message).toContain('Signup successful');
    });

    it('should reject duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email: 'test@example.com',
          phone_e164: '+919999999999',
          consent_version: '1.0',
        });

      const response = await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email: 'test@example.com',
          phone_e164: '+919999999998',
          consent_version: '1.0',
        })
        .expect(409);

      expect(response.body.code).toBe('USER_EMAIL_TAKEN');
    });
  });

  describe('POST /v1/auth/otp/send', () => {
    it('should send OTP', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/otp/send')
        .send({
          target: 'test@example.com',
          channel: 'EMAIL',
        })
        .expect(200);

      expect(response.body).toHaveProperty('challenge_id');
    });
  });

  describe('Full auth flow', () => {
    it('should complete signup -> verify -> login -> refresh', async () => {
      const tokens = await createVerifiedUserAndLogin(
        app.getHttpServer(),
        otpDelivery,
        'flow@example.com',
        '+919999999999',
      );
      expect(tokens).toHaveProperty('access_token');
      expect(tokens).toHaveProperty('refresh_token');

      const refreshResponse = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refresh_token: tokens.refresh_token })
        .expect(200);
      expect(refreshResponse.body.access_token).not.toBe(tokens.access_token);

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refresh_token: tokens.refresh_token })
        .expect(401);
    });

    it('should revoke refresh tokens on logout', async () => {
      const tokens = await createVerifiedUserAndLogin(
        app.getHttpServer(),
        otpDelivery,
        'logout-test@example.com',
        '+919999999997',
      );

      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${tokens.access_token}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refresh_token: tokens.refresh_token })
        .expect(401);
    });
  });
});
