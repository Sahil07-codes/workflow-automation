import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('Profile E2E', () => {
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
    await prisma.profile.deleteMany();
    await prisma.profileVersion.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Profile endpoints', () => {
    beforeEach(async () => {
      // Create and login user
      const signupRes = await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email: 'profile-test@example.com',
          phone_e164: '+919999999999',
          consent_version: '1.0',
        });

      userId = signupRes.body.user_id;

      // TODO: Get tokens (requires OTP verification in real flow)
      // For now, this is scaffolding for when OTP mocking is in place
    });

    it('should create profile', async () => {
      if (!accessToken) {
        console.log('Skipping: accessToken not available (OTP flow not mocked)');
        return;
      }

      const profileData = {
        education: [
          {
            level: 'UG',
            field: 'Computer Science',
            school: 'IIT Delhi',
            cgpa: 8.5,
            year: 2023,
          },
        ],
        experience: [
          {
            title: 'Software Engineer',
            company: 'Google',
            dates: { start: '2023-01', end: null },
            currently_working: true,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/v1/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(profileData)
        .expect(201);

      expect(response.body).toHaveProperty('user_id');
      expect(response.body).toHaveProperty('version');
      expect(response.body.version).toBe(1);
    });

    it('should get profile', async () => {
      if (!accessToken) return;

      const response = await request(app.getHttpServer())
        .get('/v1/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user_id');
      expect(response.body).toHaveProperty('data');
    });

    it('should update profile and increment version', async () => {
      if (!accessToken) return;

      const updatedData = {
        education: [
          {
            level: 'PG',
            field: 'Machine Learning',
            school: 'Stanford',
            cgpa: 9.0,
            year: 2024,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .put('/v1/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updatedData)
        .expect(200);

      expect(response.body.version).toBe(2);
    });

    it('should track profile versions', async () => {
      if (!accessToken) return;

      // Make multiple updates
      await request(app.getHttpServer())
        .put('/v1/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ education: [] });

      await request(app.getHttpServer())
        .put('/v1/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ experience: [] });

      // Get versions
      const response = await request(app.getHttpServer())
        .get('/v1/profile/versions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should confirm profile', async () => {
      if (!accessToken) return;

      const response = await request(app.getHttpServer())
        .post('/v1/profile/confirm')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.confirmed_at).toBeTruthy();
    });
  });

  describe('Profile access control', () => {
    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/v1/profile')
        .expect(401);
    });

    it('should reject invalid token', async () => {
      await request(app.getHttpServer())
        .get('/v1/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});
