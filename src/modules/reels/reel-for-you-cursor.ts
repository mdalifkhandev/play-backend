import { Types } from 'mongoose';

import { AppError } from '../../common/errors/app-error.js';

export interface ReelForYouCursor {
  asOf: Date;
  score: number;
  publishedAt: Date;
  id: Types.ObjectId;
}

export function encodeReelForYouCursor(cursor: ReelForYouCursor): string {
  return Buffer.from(
    JSON.stringify({
      asOf: cursor.asOf.toISOString(),
      score: cursor.score,
      publishedAt: cursor.publishedAt.toISOString(),
      id: cursor.id.toString(),
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeReelForYouCursor(value: string): ReelForYouCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      asOf?: unknown;
      score?: unknown;
      publishedAt?: unknown;
      id?: unknown;
    };
    const asOf = new Date(String(parsed.asOf));
    const score = Number(parsed.score);
    const publishedAt = new Date(String(parsed.publishedAt));
    const idValue = String(parsed.id);

    if (
      Number.isNaN(asOf.getTime()) ||
      !Number.isFinite(score) ||
      Number.isNaN(publishedAt.getTime()) ||
      !Types.ObjectId.isValid(idValue)
    ) {
      throw new Error('invalid');
    }

    return { asOf, score, publishedAt, id: new Types.ObjectId(idValue) };
  } catch {
    throw new AppError('For You cursor is invalid.', 400, {
      code: 'REEL_FOR_YOU_INVALID_CURSOR',
    });
  }
}
