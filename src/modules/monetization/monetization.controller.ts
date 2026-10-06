import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { monetizationService } from './monetization.service.js';
import type {
  UpdateCreatorRequirementSettingsInput,
  UpdateMonetizationSettingsInput,
} from './monetization.validation.js';

export class MonetizationController {
  getDashboard = asyncHandler(async (_request: Request, response: Response) => {
    const result = await monetizationService.getDashboard();
    return sendSuccess(response, 200, 'Monetization dashboard retrieved.', result);
  });

  updateSettings = asyncHandler(async (request: Request, response: Response) => {
    const result = await monetizationService.updateSettings(
      request.user!.userId,
      request.body as UpdateMonetizationSettingsInput,
    );
    return sendSuccess(response, 200, 'Monetization settings updated.', result);
  });

  updateCreatorRequirements = asyncHandler(async (request: Request, response: Response) => {
    const result = await monetizationService.updateCreatorRequirements(
      request.user!.userId,
      request.body as UpdateCreatorRequirementSettingsInput,
    );
    return sendSuccess(response, 200, 'Creator requirement settings updated.', result);
  });

  releasePendingEarnings = asyncHandler(async (_request: Request, response: Response) => {
    const result = await monetizationService.releasePendingEarnings();
    return sendSuccess(response, 200, 'Pending creator earnings released.', result);
  });
}

export const monetizationController = new MonetizationController();
