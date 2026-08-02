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
}

export const musicController = new MusicController();

