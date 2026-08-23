import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { creatorCategoryService } from './creator-category.service.js';
import type {
  CreateCreatorCategoryInput,
  ListCreatorCategoriesQuery,
} from './creator-category.validation.js';

export class CreatorCategoryController {
  list = asyncHandler(async (request: Request, response: Response) => {
    const result = await creatorCategoryService.list(request.query as unknown as ListCreatorCategoriesQuery);
    return sendSuccess(response, 200, 'Creator categories retrieved successfully.', result);
  });

  create = asyncHandler(async (request: Request, response: Response) => {
    const result = await creatorCategoryService.create(request.user!.userId, request.body as CreateCreatorCategoryInput);
    return sendSuccess(response, 201, 'Creator category saved successfully.', result);
  });
}

export const creatorCategoryController = new CreatorCategoryController();
