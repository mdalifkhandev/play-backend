import type { ClientSession, Types, UpdateQuery } from 'mongoose';

import { ContentPageModel, type ContentPage, type ContentPageDocument } from './content-page.model.js';
import { ContentPageStatus, type ContentPageType } from './content-page.constants.js';
import type {
  CreateContentPageInput,
  ListContentPagesQuery,
  UpdateContentPageInput,
} from './content-page.validation.js';

export class ContentPageRepository {
  async nextVersion(pageType: ContentPageType): Promise<number> {
    const latest = await ContentPageModel.findOne({ pageType })
      .sort({ version: -1 })
      .select({ version: 1 })
      .lean()
      .exec();

    return (latest?.version ?? 0) + 1;
  }

  async create(
    input: CreateContentPageInput,
    actorUserId: string,
    version: number,
  ): Promise<ContentPageDocument> {
    return ContentPageModel.create({
      pageType: input.pageType,
      title: input.title,
      sections: input.sections,
      ...(input.changeSummary ? { changeSummary: input.changeSummary } : {}),
      ...(input.effectiveAt ? { effectiveAt: input.effectiveAt } : {}),
      version,
      status: ContentPageStatus.DRAFT,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    });
  }

  async findPublished(pageType: ContentPageType): Promise<ContentPage | null> {
    return ContentPageModel.findOne({ pageType, status: ContentPageStatus.PUBLISHED })
      .select({ createdBy: 0, updatedBy: 0 })
      .lean<ContentPage>()
      .exec();
  }

  async findById(id: string, session?: ClientSession): Promise<ContentPageDocument | null> {
    const query = ContentPageModel.findById(id);

    if (session) {
      query.session(session);
    }

    return query.exec();
  }

  async list(query: ListContentPagesQuery): Promise<{ items: ContentPage[]; total: number }> {
    const filter = {
      ...(query.pageType ? { pageType: query.pageType } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      ContentPageModel.find(filter)
        .sort({ pageType: 1, version: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean<ContentPage[]>()
        .exec(),
      ContentPageModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async updateDraft(
    id: string,
    input: UpdateContentPageInput,
    actorUserId: string,
  ): Promise<ContentPageDocument | null> {
    const update: UpdateQuery<ContentPage> = {
      $set: {
        ...input,
        updatedBy: actorUserId,
      },
    };

    return ContentPageModel.findOneAndUpdate(
      { _id: id, status: ContentPageStatus.DRAFT },
      update,
      { returnDocument: 'after', runValidators: true },
    ).exec();
  }

  async archivePublished(pageType: ContentPageType, session: ClientSession): Promise<void> {
    await ContentPageModel.updateMany(
      { pageType, status: ContentPageStatus.PUBLISHED },
      { $set: { status: ContentPageStatus.ARCHIVED } },
      { session },
    ).exec();
  }

  async publishDraft(
    id: string | Types.ObjectId,
    actorUserId: string,
    effectiveAt: Date,
    session: ClientSession,
  ): Promise<ContentPageDocument | null> {
    return ContentPageModel.findOneAndUpdate(
      { _id: id, status: ContentPageStatus.DRAFT },
      {
        $set: {
          status: ContentPageStatus.PUBLISHED,
          effectiveAt,
          publishedAt: new Date(),
          publishedBy: actorUserId,
          updatedBy: actorUserId,
        },
      },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }

  async deleteDraft(id: string): Promise<ContentPageDocument | null> {
    return ContentPageModel.findOneAndDelete({
      _id: id,
      status: ContentPageStatus.DRAFT,
    }).exec();
  }
}

export const contentPageRepository = new ContentPageRepository();
