import { ForbiddenError } from '../../common/errors/forbidden-error.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { kidsModeService } from './kids-mode.service.js';

export function blockDuringKidsMode(feature: 'comments' | 'messaging' | 'live-streaming') {
  return asyncHandler(async (request, _response, next) => {
    if (!request.user) {
      next();
      return;
    }

    const status = await kidsModeService.getStatus(request.user.userId);
    if (status.isActive) {
      throw new ForbiddenError(`${feature} is disabled while Kids Mode is active.`, {
        code: 'KIDS_FEATURE_DISABLED',
        details: { feature },
      });
    }

    next();
  });
}

export const blockCommentsDuringKidsMode = blockDuringKidsMode('comments');
export const blockMessagingDuringKidsMode = blockDuringKidsMode('messaging');
export const blockLiveStreamingDuringKidsMode = blockDuringKidsMode('live-streaming');
