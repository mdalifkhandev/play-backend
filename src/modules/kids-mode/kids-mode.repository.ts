import type { UpdateQuery } from 'mongoose';

import { KidsModeModel, type KidsMode, type KidsModeDocument } from './kids-mode.model.js';

export class KidsModeRepository {
  findByUserId(userId: string, includePin = false): Promise<KidsModeDocument | null> {
    const query = KidsModeModel.findOne({ userId });
    if (includePin) query.select('+pinHash');
    return query.exec();
  }

  async save(document: KidsModeDocument): Promise<KidsModeDocument> {
    return document.save();
  }

  async create(input: Omit<KidsMode, '_id' | 'createdAt' | 'updatedAt'>): Promise<KidsModeDocument> {
    return KidsModeModel.create(input);
  }

  async update(userId: string, update: UpdateQuery<KidsMode>): Promise<KidsModeDocument | null> {
    return KidsModeModel.findOneAndUpdate({ userId }, update, { returnDocument: 'after' }).exec();
  }
}

export const kidsModeRepository = new KidsModeRepository();
