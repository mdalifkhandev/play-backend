import { Types } from 'mongoose';

import { BadRequestError } from '../../common/errors/bad-request-error.js';

export interface StoryCursor {
  publishedAt: Date;
  id: Types.ObjectId;
}

interface SerializedStoryCursor {
  publishedAt: string;
  id: string;
}

export function encodeStoryCursor(cursor: StoryCursor): string {
  const value: SerializedStoryCursor = {
    publishedAt: cursor.publishedAt.toISOString(),
    id: cursor.id.toString(),
  };
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeStoryCursor(value: string): StoryCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<SerializedStoryCursor>;
    const publishedAt = new Date(parsed.publishedAt ?? '');

    if (
      Number.isNaN(publishedAt.getTime()) ||
      !parsed.id ||
      !Types.ObjectId.isValid(parsed.id) ||
      parsed.id.length !== 24
    ) {
      throw new Error('Invalid cursor payload');
    }

    return { publishedAt, id: new Types.ObjectId(parsed.id) };
  } catch {
    throw new BadRequestError('Story cursor is invalid.', {
      code: 'STORY_INVALID_CURSOR',
      fieldErrors: [
        {
          field: 'cursor',
          message: 'Story cursor is invalid.',
          code: 'STORY_INVALID_CURSOR',
        },
      ],
    });
  }
}
