import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { OtpDelivery } from '../src/modules/auth/services/otp-delivery';
import { FakeOtpDelivery } from './helpers/fake-otp-delivery';
import { createVerifiedUserAndLogin } from './helpers/authenticated-user';

describe('Profile E2E', () => {
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
    await prisma.profile.deleteMany();
    await prisma.profileVersion.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Profile endpoints', () => {
    beforeEach(async () => {
      const tokens = await createVerifiedUserAndLogin(
        app.getHttpServer(),
        otpDelivery,
        'profile-test@example.com',
        '+919999999999',
      );
      accessToken = tokens.access_token;
    });

    async function createInitialProfile() {
      await request(app.getHttpServer())
        .post('/v1/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ education: [], experience: [] })
        .expect(201);
    }

    it('should create profile', async () => {
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
      await createInitialProfile();
      const response = await request(app.getHttpServer())
        .get('/v1/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user_id');
      expect(response.body).toHaveProperty('data');
    });

    it('should update profile and increment version', async () => {
      await createInitialProfile();
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
      await createInitialProfile();
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
      await createInitialProfile();
      await request(app.getHttpServer())
        .put('/v1/profile')
        .set('Authorization', ['Bearer', accessToken].join(' '))
        .send({
          full_name: 'Profile Test',
          location: 'New Delhi',
          linkedin_url: 'https://www.linkedin.com/in/profile-test',
          professional_status: 'experienced_professional',
          current_title: 'Software Engineer',
          years_experience: '3–5 years',
          current_company: 'Example Company',
          profile_visibility: 'private',
        })
        .expect(200);
      await request(app.getHttpServer())
        .put('/v1/preferences')
        .set('Authorization', ['Bearer', accessToken].join(' '))
        .send({
          roles: ['Software Engineer'],
          locations: ['New Delhi'],
          skills: ['TypeScript'],
          remote_preference: 'HYBRID',
        })
        .expect(200);

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
