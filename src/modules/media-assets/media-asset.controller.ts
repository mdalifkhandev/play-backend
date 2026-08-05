import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { mediaAssetService } from './media-asset.service.js';
import type {
  CompleteUploadInput,
  PrepareUploadInput,
} from './media-asset.validation.js';

export class MediaAssetController {
  prepare = asyncHandler(async (request: Request, response: Response) => {
    const result = await mediaAssetService.prepare(
      request.user!.userId,
      request.body as PrepareUploadInput,
    );
    return sendSuccess(response, 201, 'Upload prepared successfully.', result);
  });

  complete = asyncHandler(async (request: Request, response: Response) => {
    const { uploadId } = request.body as CompleteUploadInput;
    const result = await mediaAssetService.complete(request.user!.userId, uploadId);
    return sendSuccess(response, 200, 'Upload verified successfully.', result);
  });

  status = asyncHandler(async (request: Request, response: Response) => {
    const { uploadId } = request.params as { uploadId: string };
    const result = await mediaAssetService.getStatus(
      request.user!.userId,
      uploadId,
    );
    return sendSuccess(response, 200, 'Upload status retrieved successfully.', result);
  });
}

export const mediaAssetController = new MediaAssetController();
