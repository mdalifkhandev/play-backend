import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  decodeReelForYouCursor,
  encodeReelForYouCursor,
} from '../../src/modules/reels/reel-for-you-cursor.js';
import { reportReelBodySchema } from '../../src/modules/reels/reel.validation.js';

describe('For You Reel cursor', () => {
  it('round-trips stable ranking state', () => {
    const input = {
      asOf: new Date('2026-08-13T10:00:00.000Z'),
      score: 42.125,
      publishedAt: new Date('2026-08-12T10:00:00.000Z'),
      id: new Types.ObjectId('64f000000000000000000001'),
    };

    const output = decodeReelForYouCursor(encodeReelForYouCursor(input));

    expect(output.asOf).toEqual(input.asOf);
    expect(output.score).toBe(input.score);
    expect(output.publishedAt).toEqual(input.publishedAt);
    expect(output.id.toString()).toBe(input.id.toString());
  });

  it('rejects malformed cursors', () => {
    expect(() => decodeReelForYouCursor('not-a-cursor')).toThrow('For You cursor is invalid.');
  });
});

describe('Reel report validation', () => {
  it('accepts a supported reason', () => {
    expect(reportReelBodySchema.parse({ reason: 'spam' })).toEqual({ reason: 'spam' });
  });

  it('rejects unknown reasons', () => {
    expect(() => reportReelBodySchema.parse({ reason: 'dislike' })).toThrow();
  });
});
