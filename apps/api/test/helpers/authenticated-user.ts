import request = require('supertest');
import { FakeOtpDelivery } from './fake-otp-delivery';

export const E2E_PASSWORD = 'AutoApply-test-password-123!';

export async function createVerifiedUserAndLogin(
  server: any,
  otpDelivery: FakeOtpDelivery,
  email: string,
  phone: string,
) {
  await request(server)
    .post('/v1/auth/signup')
    .send({
      email,
      phone_e164: phone,
      password: E2E_PASSWORD,
      consent_version: '1.0',
    })
    .expect(201);

  await request(server)
    .post('/v1/auth/otp/verify')
    .send({ target: email, code: otpDelivery.getCode(email, 'EMAIL') })
    .expect(200);

  await request(server)
    .post('/v1/auth/otp/verify')
    .send({ target: phone, code: otpDelivery.getCode(phone, 'SMS') })
    .expect(200);

  const response = await request(server)
    .post('/v1/auth/login')
    .send({ email, method: 'PASSWORD', password: E2E_PASSWORD });
  if (response.status !== 200) {
    throw new Error(`Login failed (${response.status}): ${JSON.stringify(response.body)}`);
  }
  try {
    require('jsonwebtoken').verify(
      response.body.access_token,
      process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n'),
      { algorithms: ['RS256'] },
    );
  } catch (error) {
    throw new Error(`Issued token does not match test public key: ${(error as Error).message}`);
  }

  return response.body as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };
}