import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createContentPageBodySchema } from '../src/modules/content-pages/content-page.validation.js';
import { acceptLegalConsentBodySchema } from '../src/modules/legal-consents/legal-consent.validation.js';
import {
  createSupportRequestBodySchema,
  updateSupportRequestBodySchema,
} from '../src/modules/support-requests/support-request.validation.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mongodb://127.0.0.1:27017/jesusname7_test';
process.env.CORS_ORIGINS = 'https://app.example.com';
delete process.env.REDIS_URL;

let app: Express;

beforeAll(async () => {
  ({ app } = await import('../src/app.js'));
});

describe('content, legal consent and support API contracts', () => {
  it('accepts a structured content page draft', () => {
    const parsed = createContentPageBodySchema.parse({
      pageType: 'privacy-policy',
      title: 'Privacy Policy',
      sections: [{ heading: 'Information we collect', content: 'Account data.', order: 0 }],
      effectiveAt: '2026-08-01T00:00:00.000Z',
    });

    expect(parsed.pageType).toBe('privacy-policy');
    expect(parsed.effectiveAt).toBeInstanceOf(Date);
  });

  it('only allows versioned privacy and terms consent', () => {
    expect(
      acceptLegalConsentBodySchema.safeParse({ documentType: 'about-us', version: 1 }).success,
    ).toBe(false);
    expect(
      acceptLegalConsentBodySchema.safeParse({
        documentType: 'terms-conditions',
        version: 1,
      }).success,
    ).toBe(true);
  });

  it('validates support requests and admin updates', () => {
    expect(
      createSupportRequestBodySchema.safeParse({
        category: 'technical',
        subject: 'Login issue',
        message: 'short',
      }).success,
    ).toBe(false);
    expect(updateSupportRequestBodySchema.safeParse({}).success).toBe(false);
    expect(
      updateSupportRequestBodySchema.safeParse({ status: 'in_progress', priority: 'high' })
        .success,
    ).toBe(true);
  });

  it('rejects invalid public content page types before querying storage', async () => {
    const response = await request(app).get('/api/v1/content-pages/not-a-page');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fieldErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'pageType' })]),
    );
  });

  it('protects admin content and support routes', async () => {
    const [contentResponse, supportResponse] = await Promise.all([
      request(app).get('/api/v1/admin/content-pages'),
      request(app).get('/api/v1/admin/support-requests'),
    ]);

    expect(contentResponse.status).toBe(401);
    expect(contentResponse.body.error.code).toBe('ACCESS_TOKEN_REQUIRED');
    expect(supportResponse.status).toBe(401);
    expect(supportResponse.body.error.code).toBe('ACCESS_TOKEN_REQUIRED');
  });
});
