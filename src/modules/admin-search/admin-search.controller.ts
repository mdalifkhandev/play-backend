import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { adminSearchService } from './admin-search.service.js';
import type { AdminSearchQuery } from './admin-search.validation.js';

export class AdminSearchController {
  search = asyncHandler(async (request: Request, response: Response) => {
    const result = await adminSearchService.search(request.query as unknown as AdminSearchQuery);
    return sendSuccess(response, 200, 'Admin search results retrieved successfully.', result);
  });
}

export const adminSearchController = new AdminSearchController();
