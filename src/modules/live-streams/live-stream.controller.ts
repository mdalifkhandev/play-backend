import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { liveStreamService, LiveStreamService } from './live-stream.service.js';

export class LiveStreamController {
  constructor(private readonly service: LiveStreamService = liveStreamService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const stream = await this.service.createStream(userId, req.body);
    sendSuccess(res, 201, 'Live stream created successfully.', stream);
  };

  start = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { id } = req.params;
    const stream = await this.service.startStream(id as string, userId);
    sendSuccess(res, 200, 'Live stream started.', stream);
  };

  end = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { id } = req.params;
    const stream = await this.service.endStream(id as string, userId);
    sendSuccess(res, 200, 'Live stream ended.', stream);
  };

  getToken = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { id } = req.params;
    const tokenInfo = await this.service.getStreamToken(id as string, userId);
    sendSuccess(res, 200, 'Stream token generated.', tokenInfo);
  };

  getFeed = async (req: Request, res: Response): Promise<void> => {
    const feed = await this.service.getFeed(req.query as any);
    sendSuccess(res, 200, 'Live stream feed retrieved.', feed);
  };

  search = async (req: Request, res: Response): Promise<void> => {
    const { q, page, limit } = req.query as any;
    const result = await this.service.searchLiveStreams(q, page, limit);
    sendSuccess(res, 200, 'Live streams searched.', result);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const stream = await this.service.getStreamById(id as string);
    sendSuccess(res, 200, 'Live stream details retrieved.', stream);
  };

  join = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const stream = await this.service.joinStream(id as string);
    sendSuccess(res, 200, 'Joined live stream.', stream);
  };

  leave = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const stream = await this.service.leaveStream(id as string);
    sendSuccess(res, 200, 'Left live stream.', stream);
  };

  postComment = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { text } = req.body;
    const comment = await this.service.addComment(id as string, userId, text);
    sendSuccess(res, 201, 'Comment posted to live stream.', comment);
  };

  getComments = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const comments = await this.service.getRecentComments(id as string);
    sendSuccess(res, 200, 'Live stream comments retrieved.', comments);
  };

  like = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const result = await this.service.addLike(id as string);
    sendSuccess(res, 200, 'Reaction sent.', result);
  };

  share = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const result = await this.service.addShare(id as string);
    sendSuccess(res, 200, 'Live stream shared.', result);
  };


}

export const liveStreamController = new LiveStreamController();
