import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { platformSettingService } from './platform-setting.service.js';
import type { UpdatePlatformSettingsInput } from './platform-setting.validation.js';

export class PlatformSettingController {
  getAdminSettings = asyncHandler(async (_request: Request, response: Response) => {
    const result = await platformSettingService.getAdminSettings();
    return sendSuccess(response, 200, 'Platform settings retrieved.', result);
  });

  getPublicSettings = asyncHandler(async (_request: Request, response: Response) => {
    const result = await platformSettingService.getPublicSettings();
    return sendSuccess(response, 200, 'Platform settings retrieved.', result);
  });

  updateAdminSettings = asyncHandler(async (request: Request, response: Response) => {
    const result = await platformSettingService.updateAdminSettings(
      request.user!.userId,
      request.body as UpdatePlatformSettingsInput,
    );
    return sendSuccess(response, 200, 'Platform settings updated.', result);
  });
}

export const platformSettingController = new PlatformSettingController();
