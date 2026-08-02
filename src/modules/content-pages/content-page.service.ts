import { BadRequestError } from '../../common/errors/bad-request-error.js';
import { ConflictError } from '../../common/errors/conflict-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { cacheKeys } from '../../infrastructure/cache/cache-keys.js';
import { cacheService } from '../../infrastructure/cache/cache.service.js';
import { withDatabaseTransaction } from '../../infrastructure/database/transaction-manager.js';
import { auditService } from '../audit/audit.service.js';
import {
  ContentPageStatus,
  PUBLIC_CONTENT_CACHE_TTL_SECONDS,
  type ContentPageType,
} from './content-page.constants.js';
import { toContentPageDto, type ContentPageDto } from './content-page.mapper.js';
import { contentPageRepository } from './content-page.repository.js';
import type {
  CreateContentPageInput,
  ListContentPagesQuery,
  PublishContentPageInput,
  UpdateContentPageInput,
} from './content-page.validation.js';

export class ContentPageService {
  async getPublished(pageType: ContentPageType): Promise<ContentPageDto> {
    const cacheKey = cacheKeys.publishedContentPage(pageType);
    const cached = await cacheService.get<ContentPageDto>(cacheKey);

    if (cached) {
      return cached;
    }

    const page = await contentPageRepository.findPublished(pageType);

    if (!page) {
      throw new NotFoundError('Published content page was not found.', {
        code: 'CONTENT_PAGE_NOT_PUBLISHED',
      });
    }

    const result = toContentPageDto(page);
    await cacheService.set(cacheKey, result, PUBLIC_CONTENT_CACHE_TTL_SECONDS);
    return result;
  }

  async create(input: CreateContentPageInput, actorUserId: string): Promise<ContentPageDto> {
    const version = await contentPageRepository.nextVersion(input.pageType);
    const page = await contentPageRepository.create(input, actorUserId, version);
    await this.audit(actorUserId, 'content_page.create');
    return toContentPageDto(page);
  }

  async list(query: ListContentPagesQuery) {
    const result = await contentPageRepository.list(query);
    return {
      items: result.items.map(toContentPageDto),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async getById(id: string): Promise<ContentPageDto> {
    const page = await contentPageRepository.findById(id);

    if (!page) {
      throw this.notFoundError();
    }

    return toContentPageDto(page);
  }

  async updateDraft(
    id: string,
    input: UpdateContentPageInput,
    actorUserId: string,
  ): Promise<ContentPageDto> {
    const page = await contentPageRepository.updateDraft(id, input, actorUserId);

    if (!page) {
      await this.assertDraftExists(id);
      throw this.notFoundError();
    }

    await this.audit(actorUserId, 'content_page.update');
    return toContentPageDto(page);
  }

  async publish(
    id: string,
    input: PublishContentPageInput,
    actorUserId: string,
  ): Promise<ContentPageDto> {
    const published = await withDatabaseTransaction(async (session) => {
      const draft = await contentPageRepository.findById(id, session);

      if (!draft) {
        throw this.notFoundError();
      }

      if (draft.status !== ContentPageStatus.DRAFT) {
        throw new ConflictError('Only a draft content page can be published.', {
          code: 'CONTENT_PAGE_NOT_DRAFT',
        });
      }

      await contentPageRepository.archivePublished(draft.pageType, session);
      const result = await contentPageRepository.publishDraft(
        draft._id,
        actorUserId,
        input.effectiveAt ?? new Date(),
        session,
      );

      if (!result) {
        throw new ConflictError('Content page could not be published.', {
          code: 'CONTENT_PAGE_PUBLISH_CONFLICT',
        });
      }

      return result;
    });

    await cacheService.delete(cacheKeys.publishedContentPage(published.pageType));
    await this.audit(actorUserId, 'content_page.publish');
    return toContentPageDto(published);
  }

  async deleteDraft(id: string, actorUserId: string): Promise<{ deleted: true }> {
    const page = await contentPageRepository.deleteDraft(id);

    if (!page) {
      await this.assertDraftExists(id);
      throw this.notFoundError();
    }

    await this.audit(actorUserId, 'content_page.delete_draft');
    return { deleted: true };
  }

  private async assertDraftExists(id: string): Promise<void> {
    const existing = await contentPageRepository.findById(id);

    if (existing && existing.status !== ContentPageStatus.DRAFT) {
      throw new BadRequestError('Published or archived content cannot be modified or deleted.', {
        code: 'CONTENT_PAGE_IMMUTABLE',
      });
    }
  }

  private notFoundError(): NotFoundError {
    return new NotFoundError('Content page was not found.', {
      code: 'CONTENT_PAGE_NOT_FOUND',
    });
  }

  private async audit(actorUserId: string, action: string): Promise<void> {
    await auditService.record({ actorUserId, action, outcome: 'success' });
  }
}

export const contentPageService = new ContentPageService();
