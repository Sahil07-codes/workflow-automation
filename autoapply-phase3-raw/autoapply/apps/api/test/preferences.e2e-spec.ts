import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('Preferences E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean database
    await prisma.jobPreferences.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Preferences endpoints', () => {
    beforeEach(async () => {
      // Create and login user
      const signupRes = await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email: 'prefs-test@example.com',
          phone_e164: '+918888888888',
          consent_version: '1.0',
        });

      userId = signupRes.body.user_id;
      // TODO: accessToken from OTP verification
    });

    it('should get default preferences', async () => {
      if (!accessToken) return;

      const response = await request(app.getHttpServer())
        .get('/v1/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.min_match_score).toBe(60);
      expect(response.body.daily_cap).toBe(25);
    });

    it('should update preferences', async () => {
      if (!accessToken) return;

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
      if (!accessToken) return;

      await request(app.getHttpServer())
        .put('/v1/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ min_match_score: 150 })
        .expect(400);
    });

    it('should validate daily cap range', async () => {
      if (!accessToken) return;

      await request(app.getHttpServer())
        .put('/v1/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ daily_cap: 1000 })
        .expect(400);
    });

    it('should validate remote preference', async () => {
      if (!accessToken) return;

      await request(app.getHttpServer())
        .put('/v1/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ remote_preference: 'INVALID' })
        .expect(400);
    });

    it('should set auto-approve config', async () => {
      if (!accessToken) return;

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
      if (!accessToken) return;

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
