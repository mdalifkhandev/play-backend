import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { setupProfileBodySchema } from '../src/modules/auth/auth.validation.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mongodb://127.0.0.1:27017/jesusname7_test';
process.env.CORS_ORIGINS = 'https://app.example.com';
delete process.env.REDIS_URL;

let app: Express;

beforeAll(async () => {
  ({ app } = await import('../src/app.js'));
});

describe('auth API security contract', () => {
  it('normalizes valid profile contact details', () => {
    const result = setupProfileBodySchema.parse({
      phoneNumber: '+880 1712-345678',
      dateOfBirth: '1998-05-17',
    });

    expect(result).toMatchObject({
      phoneNumber: '+8801712345678',
      dateOfBirth: '1998-05-17',
    });
  });

  it('rejects invalid profile contact details', () => {
    const result = setupProfileBodySchema.safeParse({
      phoneNumber: '01712345678',
      dateOfBirth: '2024-02-31',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['phoneNumber'] }),
        expect.objectContaining({ path: ['dateOfBirth'] }),
      ]),
    );
  });

  it('returns field-specific signup validation errors', async () => {
    const response = await request(app)
      .post('/api/v1/auth/sign-up')
      .send({
        email: 'invalid-email',
        password: 'weak',
        confirmPassword: 'different',
        acceptTerms: false,
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.requestId).toEqual(expect.any(String));
    expect(response.body.error.fieldErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
        expect.objectContaining({ field: 'password' }),
        expect.objectContaining({ field: 'acceptTerms' }),
      ]),
    );
  });

  it('rejects an untrusted browser origin', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://malicious.example')
      .send({ email: 'person@example.com', password: 'Password1' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(response.body.error.requestId).toEqual(expect.any(String));
  });

  it('rejects cookie-authenticated mutations without a trusted origin', async () => {
    const response = await request(app)
      .patch('/api/v1/auth/setup-profile')
      .set('Cookie', 'refreshToken=test-refresh-token')
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
  });

  it('uses the global error contract for unknown routes', async () => {
    const response = await request(app).get('/api/v1/unknown');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
      },
    });
    expect(response.body.error.requestId).toEqual(expect.any(String));
  });
});
