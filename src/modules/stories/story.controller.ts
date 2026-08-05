import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { storyService } from './story.service.js';
import type { CreateStoryInput, StoryFeedQuery } from './story.validation.js';

export class StoryController {
  create = asyncHandler(async (request: Request, response: Response) => {
    const result = await storyService.create(
      request.user!.userId,
      request.header('Idempotency-Key'),
      request.body as CreateStoryInput,
    );

    return sendSuccess(
      response,
      result.replayed ? 200 : 201,
      result.replayed ? 'Story publish request replayed.' : 'Story published successfully.',
      result,
    );
  });

  feed = asyncHandler(async (request: Request, response: Response) => {
    const result = await storyService.getFeed(request.query as unknown as StoryFeedQuery);
    return sendSuccess(response, 200, 'Stories retrieved successfully.', result);
  });

  getById = asyncHandler(async (request: Request, response: Response) => {
    const { storyId } = request.params as { storyId: string };
    const result = await storyService.getById(storyId);
    return sendSuccess(response, 200, 'Story retrieved successfully.', result);
  });

  view = asyncHandler(async (request: Request, response: Response) => {
    const { storyId } = request.params as { storyId: string };
    const result = await storyService.recordView(
      storyId,
      request.user!.userId,
    );
    return sendSuccess(response, 200, 'Story view recorded successfully.', result);
  });

  delete = asyncHandler(async (request: Request, response: Response) => {
    const { storyId } = request.params as { storyId: string };
    await storyService.delete(storyId, request.user!.userId);
    return sendSuccess(response, 200, 'Story deleted successfully.', { deleted: true });
  });
}

export const storyController = new StoryController();
