import { Types } from 'mongoose';

import { OccupationModel } from './occupation.model.js';
import type { CreateOccupationInput, ListOccupationsQuery } from './occupation.validation.js';

export class OccupationService {
  async list(query: ListOccupationsQuery) {
    const limit = query.limit ?? 20;
    const q = query.q?.trim();
    const filter = q
      ? {
          $or: [
            { name: { $regex: escapeRegex(q), $options: 'i' } },
            { normalizedName: { $regex: escapeRegex(normalizeOccupationName(q)), $options: 'i' } },
          ],
        }
      : {};

    const items = await OccupationModel.find(filter)
      .sort({ name: 1 })
      .limit(limit)
      .lean()
      .exec();

    return { items: items.map(mapOccupation) };
  }

  async create(userId: string, input: CreateOccupationInput) {
    const name = cleanOccupationName(input.name);
    const normalizedName = normalizeOccupationName(name);

    const occupation = await OccupationModel.findOneAndUpdate(
      { normalizedName },
      {
        $setOnInsert: {
          name,
          normalizedName,
          createdBy: new Types.ObjectId(userId),
        },
      },
      { new: true, upsert: true, runValidators: true },
    )
      .lean()
      .exec();

    return mapOccupation(occupation);
  }
}

export const occupationService = new OccupationService();

export function cleanOccupationName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeOccupationName(value: string) {
  return cleanOccupationName(value).toLowerCase();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapOccupation(occupation: any) {
  return {
    id: occupation._id.toString(),
    name: occupation.name,
  };
}
