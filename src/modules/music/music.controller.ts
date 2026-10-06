import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import type { MusicSearchQuery } from './music.types.js';
import { musicService } from './music.service.js';

export class MusicController {
  searchTracks = asyncHandler(async (request: Request, response: Response) => {
    const result = await musicService.searchTracks(request.query as unknown as MusicSearchQuery);
    response.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=240');
    return sendSuccess(response, 200, 'Music tracks retrieved successfully.', result);
  });

  toggleSavedTrack = asyncHandler(async (request: Request, response: Response) => {
    // @ts-ignore
    const userId = request.user.userId;
    const result = await musicService.toggleSaveTrack(userId, request.body);
    return sendSuccess(response, 200, result.saved ? 'Track saved successfully.' : 'Track unsaved successfully.', result);
  });

  getSavedTracks = asyncHandler(async (request: Request, response: Response) => {
    // @ts-ignore
    const userId = request.user.userId;
    const { page, limit } = request.query as any;
    const result = await musicService.getSavedTracks(userId, Number(page), Number(limit));
    return sendSuccess(response, 200, 'Saved tracks retrieved successfully.', result);
  });
}

export const musicController = new MusicController();

