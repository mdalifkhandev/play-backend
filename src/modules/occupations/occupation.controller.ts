import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { occupationService } from './occupation.service.js';
import type { CreateOccupationInput, ListOccupationsQuery } from './occupation.validation.js';

export class OccupationController {
  list = asyncHandler(async (request: Request, response: Response) => {
    const result = await occupationService.list(request.query as unknown as ListOccupationsQuery);
    return sendSuccess(response, 200, 'Occupations retrieved successfully.', result);
  });

  create = asyncHandler(async (request: Request, response: Response) => {
    const result = await occupationService.create(request.user!.userId, request.body as CreateOccupationInput);
    return sendSuccess(response, 201, 'Occupation saved successfully.', result);
  });
}

export const occupationController = new OccupationController();
