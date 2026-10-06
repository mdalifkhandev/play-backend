import { Types } from 'mongoose';

import { CreatorCategoryModel } from './creator-category.model.js';
import type {
  CreateCreatorCategoryInput,
  ListCreatorCategoriesQuery,
} from './creator-category.validation.js';

export class CreatorCategoryService {
  async list(query: ListCreatorCategoriesQuery) {
    const limit = query.limit ?? 20;
    const q = query.q?.trim();
    const filter = q
      ? {
          $or: [
            { name: { $regex: escapeRegex(q), $options: 'i' } },
            { normalizedName: { $regex: escapeRegex(normalizeCategoryName(q)), $options: 'i' } },
          ],
        }
      : {};

    const items = await CreatorCategoryModel.find(filter).sort({ name: 1 }).limit(limit).lean().exec();
    return { items: items.map(mapCategory) };
  }

  async create(userId: string, input: CreateCreatorCategoryInput) {
    const name = cleanCategoryName(input.name);
    const normalizedName = normalizeCategoryName(name);

    const category = await CreatorCategoryModel.findOneAndUpdate(
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

    return mapCategory(category);
  }
}

export const creatorCategoryService = new CreatorCategoryService();

function cleanCategoryName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeCategoryName(value: string) {
  return cleanCategoryName(value).toLowerCase();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapCategory(category: any) {
  return {
    id: category._id.toString(),
    name: category.name,
  };
}
