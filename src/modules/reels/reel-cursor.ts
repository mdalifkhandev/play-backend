import { Types } from 'mongoose';

import { AppError } from '../../common/errors/app-error.js';

export interface ReelCursor {
  publishedAt: Date;
  id: Types.ObjectId;
}

export function encodeReelCursor(cursor: ReelCursor): string {
  return Buffer.from(
    JSON.stringify({
      publishedAt: cursor.publishedAt.toISOString(),
      id: cursor.id.toString(),
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeReelCursor(value: string): ReelCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      publishedAt?: unknown;
      id?: unknown;
    };
    const publishedAt = new Date(String(parsed.publishedAt));
    const id = new Types.ObjectId(String(parsed.id));

    if (Number.isNaN(publishedAt.getTime()) || !Types.ObjectId.isValid(id)) {
      throw new Error('invalid');
    }

    return { publishedAt, id };
  } catch {
    throw new AppError('Reel cursor is invalid.', 400, { code: 'REEL_INVALID_CURSOR' });
  }
}
