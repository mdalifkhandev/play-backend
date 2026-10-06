import type { ClientSession, Types } from 'mongoose';

import { StoryStatus, StoryVisibility } from './story.constants.js';
import type { StoryCursor } from './story-cursor.js';
import type { StoryWithOwner } from './story.mapper.js';
import {
  StoryModel,
  type CreateStoryRecord,
  type StoryDocument,
} from './story.model.js';
import { StoryViewModel } from './story-view.model.js';

const OWNER_PROJECTION = '_id profile.displayName profile.username profile.photoUrl';

export class StoryRepository {
  async create(input: CreateStoryRecord, session: ClientSession): Promise<StoryDocument> {
    const created = await StoryModel.create([input], { session });
    const story = created[0];

    if (!story) {
      throw new Error('Story creation did not return a document.');
    }

    return story;
  }

  async findByIdempotencyKey(
    ownerId: string,
    idempotencyKey: string,
    session?: ClientSession,
  ): Promise<StoryDocument | null> {
    const query = StoryModel.findOne({ ownerId, idempotencyKey }).select(
      '+idempotencyKey +requestHash',
    );
    if (session) query.session(session);
    return query.exec();
  }

  async findActiveDocumentById(
    storyId: string,
    now: Date,
    session?: ClientSession,
  ): Promise<StoryDocument | null> {
    const query = StoryModel.findOne({
      _id: storyId,
      visibility: StoryVisibility.PUBLIC,
      status: StoryStatus.ACTIVE,
      expiresAt: { $gt: now },
      deletedAt: { $exists: false },
    });
    if (session) query.session(session);
    return query.exec();
  }

  async findByIdForMutation(
    storyId: string,
    session: ClientSession,
  ): Promise<StoryDocument | null> {
    return StoryModel.findById(storyId).session(session).exec();
  }

  async findActivePublicById(storyId: string, now: Date): Promise<StoryWithOwner | null> {
    return StoryModel.findOne({
      _id: storyId,
      visibility: StoryVisibility.PUBLIC,
      status: StoryStatus.ACTIVE,
      expiresAt: { $gt: now },
      deletedAt: { $exists: false },
    })
      .populate({ path: 'ownerId', select: OWNER_PROJECTION })
      .lean<StoryWithOwner>()
      .exec();
  }

  async listActivePublic(
    now: Date,
    limit: number,
    cursor?: StoryCursor,
  ): Promise<StoryWithOwner[]> {
    const filter = {
      visibility: StoryVisibility.PUBLIC,
      status: StoryStatus.ACTIVE,
      expiresAt: { $gt: now },
      deletedAt: { $exists: false },
      ...(cursor
        ? {
            $or: [
              { publishedAt: { $lt: cursor.publishedAt } },
              { publishedAt: cursor.publishedAt, _id: { $lt: cursor.id } },
            ],
          }
        : {}),
    };

    return StoryModel.find(filter)
      .sort({ publishedAt: -1, _id: -1 })
      .limit(limit)
      .populate({ path: 'ownerId', select: OWNER_PROJECTION })
      .lean<StoryWithOwner[]>()
      .exec();
  }

  async markDeleted(storyId: Types.ObjectId, deletedAt: Date, session: ClientSession): Promise<void> {
    await StoryModel.updateOne(
      { _id: storyId, status: StoryStatus.ACTIVE },
      { $set: { status: StoryStatus.DELETED, deletedAt } },
      { session },
    ).exec();
  }

  async createViewIfAbsent(
    storyId: Types.ObjectId,
    viewerId: string,
    expiresAt: Date,
    session: ClientSession,
  ): Promise<boolean> {
    const result = await StoryViewModel.updateOne(
      { storyId, viewerId },
      {
        $setOnInsert: {
          storyId,
          viewerId,
          viewedAt: new Date(),
          expiresAt,
        },
      },
      { upsert: true, session },
    ).exec();

    return result.upsertedCount === 1;
  }

  async incrementViewCount(
    storyId: Types.ObjectId,
    session: ClientSession,
  ): Promise<number> {
    const story = await StoryModel.findByIdAndUpdate(
      storyId,
      { $inc: { viewCount: 1 } },
      { returnDocument: 'after', session },
    ).exec();
    return story?.viewCount ?? 0;
  }
}

export const storyRepository = new StoryRepository();
