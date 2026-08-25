import type { NextFunction, Request, Response } from 'express';

import { ForbiddenError } from '../../common/errors/forbidden-error.js';
import type { PlatformFeatureFlags } from './platform-setting.model.js';
import { platformSettingService } from './platform-setting.service.js';

export function requirePlatformFeature(feature: keyof PlatformFeatureFlags) {
  return async (_request: Request, _response: Response, next: NextFunction) => {
    const enabled = await platformSettingService.isFeatureEnabled(feature);

    if (!enabled) {
      return next(
        new ForbiddenError('This feature is currently disabled by admin.', {
          code: 'FEATURE_DISABLED',
          details: { feature },
        }),
      );
    }

    return next();
  };
}
