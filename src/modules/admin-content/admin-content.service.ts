import { Types } from 'mongoose';

import { AccountStatus } from '../../common/enums/account-status.enum.js';
import { BadRequestError } from '../../common/errors/bad-request-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { CommentModel } from '../engagement/comment/comment.model.js';
import { LiveStreamModel } from '../live-streams/live-stream.model.js';
import { LIVE_STREAM_STATUS } from '../live-streams/live-stream.constants.js';
import { ReelModel } from '../reels/reel.model.js';
import { ReelStatus } from '../reels/reel.constants.js';
import { UserModel } from '../users/user.model.js';

type AdminContentType = 'reels' | 'comments' | 'users' | 'profiles' | 'live-streams';

type ListInput = {
  type: AdminContentType;
  q?: string;
  status?: string;
  page: number;
  limit: number;
};

type ParamsInput = {
  type: AdminContentType;
  id: string;
};

type UpdateInput = {
  title?: string;
  description?: string | null;
  status?: string;
};

class AdminContentService {
  async list(input: ListInput) {
    const page = input.page;
    const limit = input.limit;
    const skip = (page - 1) * limit;

    if (input.type === 'reels') return this.listReels(input, skip);
    if (input.type === 'comments') return this.listComments(input, skip);
    if (input.type === 'users' || input.type === 'profiles') return this.listUsers(input, skip);
    if (input.type === 'live-streams') return this.listLiveStreams(input, skip);

    throw new BadRequestError('Unsupported content type.');
  }

  async update(params: ParamsInput, input: UpdateInput) {
    const id = this.objectId(params.id);

    if (params.type === 'reels') {
      const update: Record<string, unknown> = {};
      if (input.title !== undefined || input.description !== undefined) update.caption = input.title ?? input.description ?? '';
      if (input.status !== undefined) update.status = this.reelStatus(input.status);
      const reel = await ReelModel.findByIdAndUpdate(id, { $set: update }, { new: true }).populate('ownerId', 'email profile').lean().exec();
      if (!reel) throw new NotFoundError('Reel was not found.');
      return this.mapReel(reel);
    }

    if (params.type === 'comments') {
      const update: Record<string, unknown> = {};
      if (input.title !== undefined || input.description !== undefined) update.text = input.title ?? input.description ?? '';
      if (input.status !== undefined) update.status = this.commentStatus(input.status);
      if (update.status === 'deleted') update.deletedAt = new Date();
      if (update.status === 'active') update.deletedAt = undefined;
      const comment = await CommentModel.findByIdAndUpdate(id, { $set: update }, { new: true }).populate('authorId', 'email profile').lean().exec();
      if (!comment) throw new NotFoundError('Comment was not found.');
      return this.mapComment(comment);
    }

    if (params.type === 'users' || params.type === 'profiles') {
      const update: Record<string, unknown> = {};
      if (input.title !== undefined) update['profile.displayName'] = input.title;
      if (input.description !== undefined) update['profile.bio'] = input.description ?? '';
      if (input.status !== undefined) update.status = this.accountStatus(input.status);
      const user = await UserModel.findByIdAndUpdate(id, { $set: update }, { new: true }).lean().exec();
      if (!user) throw new NotFoundError('User was not found.');
      return this.mapUser(user);
    }

    if (params.type === 'live-streams') {
      const update: Record<string, unknown> = {};
      if (input.title !== undefined) update.title = input.title;
      if (input.description !== undefined) update.description = input.description ?? '';
      if (input.status !== undefined) update.status = this.liveStatus(input.status);
      const stream = await LiveStreamModel.findByIdAndUpdate(id, { $set: update }, { new: true }).populate('hostId', 'email profile').lean().exec();
      if (!stream) throw new NotFoundError('Live stream was not found.');
      return this.mapLiveStream(stream);
    }

    throw new BadRequestError('Unsupported content type.');
  }

  async remove(params: ParamsInput) {
    if (params.type === 'reels') return this.update(params, { status: ReelStatus.DELETED });
    if (params.type === 'comments') return this.update(params, { status: 'deleted' });
    if (params.type === 'users' || params.type === 'profiles') return this.update(params, { status: AccountStatus.SUSPENDED });
    if (params.type === 'live-streams') return this.update(params, { status: LIVE_STREAM_STATUS.CANCELLED });
    throw new BadRequestError('Unsupported content type.');
  }

  async restore(params: ParamsInput) {
    if (params.type === 'reels') return this.update(params, { status: ReelStatus.READY });
    if (params.type === 'comments') return this.update(params, { status: 'active' });
    if (params.type === 'users' || params.type === 'profiles') return this.update(params, { status: AccountStatus.ACTIVE });
    if (params.type === 'live-streams') return this.update(params, { status: LIVE_STREAM_STATUS.ENDED });
    throw new BadRequestError('Unsupported content type.');
  }

  private async listReels(input: ListInput, skip: number) {
    const filter: Record<string, unknown> = {};
    if (input.status) filter.status = input.status;
    if (input.q) filter.caption = { $regex: input.q, $options: 'i' };
    const [items, total] = await Promise.all([
      ReelModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(input.limit).populate('ownerId', 'email profile').lean().exec(),
      ReelModel.countDocuments(filter).exec(),
    ]);
    return this.paginate(items.map((item) => this.mapReel(item)), input, total);
  }

  private async listComments(input: ListInput, skip: number) {
    const filter: Record<string, unknown> = {};
    if (input.status) filter.status = input.status;
    if (input.q) filter.text = { $regex: input.q, $options: 'i' };
    const [items, total] = await Promise.all([
      CommentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(input.limit).populate('authorId', 'email profile').lean().exec(),
      CommentModel.countDocuments(filter).exec(),
    ]);
    return this.paginate(items.map((item) => this.mapComment(item)), input, total);
  }

  private async listUsers(input: ListInput, skip: number) {
    const filter: Record<string, unknown> = {};
    if (input.status) filter.status = input.status;
    if (input.q) {
      filter.$or = [
        { email: { $regex: input.q, $options: 'i' } },
        { 'profile.displayName': { $regex: input.q, $options: 'i' } },
        { 'profile.username': { $regex: input.q, $options: 'i' } },
      ];
    }
    const [items, total] = await Promise.all([
      UserModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(input.limit).lean().exec(),
      UserModel.countDocuments(filter).exec(),
    ]);
    return this.paginate(items.map((item) => this.mapUser(item)), input, total);
  }

  private async listLiveStreams(input: ListInput, skip: number) {
    const filter: Record<string, unknown> = {};
    if (input.status) filter.status = input.status;
    if (input.q) {
      filter.$or = [
        { title: { $regex: input.q, $options: 'i' } },
        { description: { $regex: input.q, $options: 'i' } },
      ];
    }
    const [items, total] = await Promise.all([
      LiveStreamModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(input.limit).populate('hostId', 'email profile').lean().exec(),
      LiveStreamModel.countDocuments(filter).exec(),
    ]);
    return this.paginate(items.map((item) => this.mapLiveStream(item)), input, total);
  }

  private paginate(items: unknown[], input: ListInput, total: number) {
    return {
      items,
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    };
  }

  private objectId(value: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestError('Invalid content id.');
    }
    return new Types.ObjectId(value);
  }

  private reelStatus(value: string) {
    if (!Object.values(ReelStatus).includes(value as ReelStatus)) throw new BadRequestError('Invalid reel status.');
    return value;
  }

  private commentStatus(value: string) {
    if (!['active', 'deleted'].includes(value)) throw new BadRequestError('Invalid comment status.');
    return value;
  }

  private accountStatus(value: string) {
    if (!Object.values(AccountStatus).includes(value as AccountStatus)) throw new BadRequestError('Invalid user status.');
    return value;
  }

  private liveStatus(value: string) {
    if (!Object.values(LIVE_STREAM_STATUS).includes(value as any)) throw new BadRequestError('Invalid live stream status.');
    return value;
  }

  private mapOwner(owner: any) {
    if (!owner) return undefined;
    return {
      id: String(owner._id),
      email: owner.email,
      displayName: owner.profile?.displayName,
      username: owner.profile?.username,
      photoUrl: owner.profile?.photoUrl,
    };
  }

  private mapReel(reel: any) {
    return {
      id: String(reel._id),
      type: 'reel',
      title: reel.caption || 'Reel',
      description: reel.caption || '',
      status: reel.status,
      mediaUrl: reel.processedMedia?.secureUrl || reel.rawMedia?.secureUrl || '',
      thumbnailUrl: reel.thumbnail?.secureUrl || reel.rawMedia?.secureUrl || '',
      owner: this.mapOwner(reel.ownerId),
      stats: { views: reel.viewCount, likes: reel.likeCount, comments: reel.commentCount, reports: reel.reportCount },
      createdAt: reel.createdAt,
      updatedAt: reel.updatedAt,
    };
  }

  private mapComment(comment: any) {
    return {
      id: String(comment._id),
      type: 'comment',
      title: comment.text,
      description: comment.text,
      status: comment.status,
      owner: this.mapOwner(comment.authorId),
      stats: { likes: comment.likeCount, replies: comment.replyCount },
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  private mapUser(user: any) {
    return {
      id: String(user._id),
      type: 'user',
      title: user.profile?.displayName || user.profile?.username || user.email,
      description: user.profile?.bio || '',
      status: user.status,
      thumbnailUrl: user.profile?.photoUrl,
      owner: this.mapOwner(user),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private mapLiveStream(stream: any) {
    return {
      id: String(stream._id),
      type: 'live_stream',
      title: stream.title,
      description: stream.description || '',
      status: stream.status,
      mediaUrl: stream.recording?.cloudinaryUrl,
      thumbnailUrl: stream.coverImage,
      owner: this.mapOwner(stream.hostId),
      stats: { viewers: stream.viewerCount, peakViewers: stream.peakViewerCount, likes: stream.likesCount, comments: stream.commentsCount },
      createdAt: stream.createdAt,
      updatedAt: stream.updatedAt,
    };
  }
}

export const adminContentService = new AdminContentService();
