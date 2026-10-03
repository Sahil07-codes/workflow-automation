import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/exception.filter';
import { PrismaService } from '../src/database/prisma.service';
import { OtpDelivery } from '../src/modules/auth/services/otp-delivery';
import { FakeOtpDelivery } from './helpers/fake-otp-delivery';
import { createVerifiedUserAndLogin } from './helpers/authenticated-user';

describe('Preferences E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken = '';
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
    app.useGlobalFilters(new GlobalExceptionFilter());
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean database
    await prisma.otpChallenge.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.jobPreferences.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Preferences endpoints', () => {
    beforeEach(async () => {
      const tokens = await createVerifiedUserAndLogin(
        app.getHttpServer(),
        otpDelivery,
        'prefs-test@example.com',
        '+918888888888',
      );
      accessToken = tokens.access_token;
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'prefs-test@example.com' },
        select: { id: true },
      });
      await prisma.jobPreferences.create({ data: { user_id: user.id } });
    });

    it('should get default preferences', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.min_match_score).toBe(60);
      expect(response.body.daily_cap).toBe(25);
    });

    it('should update preferences', async () => {
      const response = await request(app.getHttpServer())
        .put('/v1/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          roles: ['Senior Engineer', 'Lead Engineer'],
          locations: ['Bangalore', 'Hyderabad'],
          remote_preference: 'HYBRID',
          min_match_score: 75,
          daily_cap: 50,
        })
        .expect(200);

      expect(response.body.min_match_score).toBe(75);
      expect(response.body.daily_cap).toBe(50);
      expect(response.body.roles).toContain('Senior Engineer');
    });

    it('should validate match score range', async () => {
      await request(app.getHttpServer())
        .put('/v1/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ min_match_score: 150 })
        .expect(400);
    });

    it('should validate daily cap range', async () => {
      await request(app.getHttpServer())
        .put('/v1/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ daily_cap: 1000 })
        .expect(400);
    });

    it('should validate remote preference', async () => {
      await request(app.getHttpServer())
        .put('/v1/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ remote_preference: 'INVALID' })
        .expect(400);
    });

    it('should set auto-approve config', async () => {
      const autoApproveConfig = {
        enabled: true,
        conditions: {
          min_salary: 500000,
          excluded_companies: ['Company X'],
        },
      };

      const response = await request(app.getHttpServer())
        .post('/v1/preferences/auto-approve')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(autoApproveConfig)
        .expect(200);

      expect(response.body.auto_approve).toBeTruthy();
    });

    it('should reset preferences to defaults', async () => {
      // Update first
      await request(app.getHttpServer())
        .put('/v1/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          min_match_score: 90,
          daily_cap: 100,
        });

      // Reset
      const response = await request(app.getHttpServer())
        .post('/v1/preferences/reset')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.min_match_score).toBe(60);
      expect(response.body.daily_cap).toBe(25);
      expect(response.body.roles).toEqual([]);
    });
  });

  describe('Preferences access control', () => {
    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/v1/preferences')
        .expect(401);
    });

    it('should reject invalid token', async () => {
      await request(app.getHttpServer())
        .get('/v1/preferences')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});
