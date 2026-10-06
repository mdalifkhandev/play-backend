import mongoose from 'mongoose';

import { LIVE_STREAM_FEED_TAB, LIVE_STREAM_STATUS, type LiveStreamFeedTab } from './live-stream.constants.js';
import { LiveStreamCommentModel, type ILiveStreamComment } from './live-stream-comment.model.js';
import { LiveStreamModel, type ILiveStream } from './live-stream.model.js';

export class LiveStreamRepository {
  async create(data: Partial<ILiveStream>): Promise<ILiveStream> {
    return LiveStreamModel.create(data);
  }

  async findById(id: string): Promise<ILiveStream | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return LiveStreamModel.findById(id).populate('hostId', 'profile email isVerified');
  }

  async findActiveByHostId(hostId: string): Promise<ILiveStream | null> {
    if (!mongoose.Types.ObjectId.isValid(hostId)) return null;

    return LiveStreamModel.findOne({
      hostId: new mongoose.Types.ObjectId(hostId),
      status: { $in: [LIVE_STREAM_STATUS.LIVE, LIVE_STREAM_STATUS.SCHEDULED] },
    })
      .sort({ status: 1, createdAt: -1 })
      .populate('hostId', 'profile email isVerified')
      .exec();
  }

  async findActiveStreamsByHostId(hostId: string, excludeStreamId?: string): Promise<ILiveStream[]> {
    if (!mongoose.Types.ObjectId.isValid(hostId)) return [];

    const filter: Record<string, unknown> = {
      hostId: new mongoose.Types.ObjectId(hostId),
      status: { $in: [LIVE_STREAM_STATUS.LIVE, LIVE_STREAM_STATUS.SCHEDULED] },
    };

    if (excludeStreamId && mongoose.Types.ObjectId.isValid(excludeStreamId)) {
      filter._id = { $ne: new mongoose.Types.ObjectId(excludeStreamId) };
    }

    return LiveStreamModel.find(filter)
      .sort({ createdAt: -1 })
      .populate('hostId', 'profile email isVerified')
      .exec();
  }

  async findByIds(ids: string[]): Promise<ILiveStream[]> {
    const objectIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (objectIds.length === 0) return [];

    return LiveStreamModel.find({ _id: { $in: objectIds } })
      .populate('hostId', 'profile email isVerified')
      .exec();
  }

  async findForAdmin(options: {
    status?: (typeof LIVE_STREAM_STATUS)[keyof typeof LIVE_STREAM_STATUS];
    page: number;
    limit: number;
  }): Promise<{ streams: ILiveStream[]; total: number }> {
    const skip = (options.page - 1) * options.limit;
    const filter: Record<string, unknown> = {};
    if (options.status) filter.status = options.status;

    const [streams, total] = await Promise.all([
      LiveStreamModel.find(filter)
        .sort({ startedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(options.limit)
        .populate('hostId', 'profile email isVerified')
        .exec(),
      LiveStreamModel.countDocuments(filter),
    ]);

    return { streams, total };
  }

  async findRecordedForAdmin(options: {
    page: number;
    limit: number;
  }): Promise<{ streams: ILiveStream[]; total: number }> {
    const skip = (options.page - 1) * options.limit;
    const filter: Record<string, unknown> = {
      status: LIVE_STREAM_STATUS.ENDED,
      'recording.status': { $exists: true },
    };

    const [streams, total] = await Promise.all([
      LiveStreamModel.find(filter)
        .sort({ endedAt: -1, startedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(options.limit)
        .populate('hostId', 'profile email isVerified')
        .exec(),
      LiveStreamModel.countDocuments(filter),
    ]);

    return { streams, total };
  }

  async findFeedStreams(options: {
    tab?: LiveStreamFeedTab;
    category?: string;
    page: number;
    limit: number;
  }): Promise<{ streams: ILiveStream[]; total: number }> {
    const { tab = LIVE_STREAM_FEED_TAB.ALL, category, page, limit } = options;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (category) {
      filter.category = category;
    }

    let sort: Record<string, 1 | -1> = { startedAt: -1 };

    switch (tab) {
      case LIVE_STREAM_FEED_TAB.LIVE:
        filter.status = LIVE_STREAM_STATUS.LIVE;
        sort = { viewerCount: -1, startedAt: -1 };
        break;
      case LIVE_STREAM_FEED_TAB.WATCH:
        filter.status = { $in: [LIVE_STREAM_STATUS.LIVE, LIVE_STREAM_STATUS.ENDED] };
        sort = { startedAt: -1 };
        break;
      case LIVE_STREAM_FEED_TAB.RECENT:
        filter.status = { $in: [LIVE_STREAM_STATUS.LIVE, LIVE_STREAM_STATUS.ENDED] };
        sort = { updatedAt: -1 };
        break;
      case LIVE_STREAM_FEED_TAB.TOP_LIKE:
        filter.status = LIVE_STREAM_STATUS.LIVE;
        sort = { likesCount: -1, viewerCount: -1 };
        break;
      case LIVE_STREAM_FEED_TAB.ALL:
      default:
        filter.status = { $in: [LIVE_STREAM_STATUS.LIVE, LIVE_STREAM_STATUS.SCHEDULED] };
        sort = { status: 1, viewerCount: -1, startedAt: -1 };
        break;
    }

    const [streams, total] = await Promise.all([
      LiveStreamModel.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('hostId', 'profile email isVerified')
        .exec(),
      LiveStreamModel.countDocuments(filter),
    ]);

    return { streams, total };
  }

  async searchStreams(query: string, page: number, limit: number): Promise<{ streams: ILiveStream[]; total: number }> {
    const skip = (page - 1) * limit;
    const searchRegex = new RegExp(query, 'i');
    const filter = {
      $or: [
        { title: searchRegex },
        { category: searchRegex }
      ]
    };

    const [streams, total] = await Promise.all([
      LiveStreamModel.find(filter)
        .sort({ status: 1, viewerCount: -1, startedAt: -1 }) // Prioritize LIVE, then view count
        .skip(skip)
        .limit(limit)
        .populate('hostId', 'profile email isVerified')
        .exec(),
      LiveStreamModel.countDocuments(filter),
    ]);

    return { streams, total };
  }

  async updateStatus(
    id: string,
    status: (typeof LIVE_STREAM_STATUS)[keyof typeof LIVE_STREAM_STATUS],
    additionalFields: Partial<ILiveStream> = {},
  ): Promise<ILiveStream | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    return LiveStreamModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status,
          ...additionalFields,
        },
      },
      { new: true },
    ).populate('hostId', 'profile email isVerified');
  }

  async updateRecordingState(
    id: string,
    recording: NonNullable<ILiveStream['recording']>,
  ): Promise<ILiveStream | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    return LiveStreamModel.findByIdAndUpdate(
      id,
      {
        $set: {
          recording,
        },
      },
      { new: true },
    ).populate('hostId', 'profile email isVerified');
  }

  async updateCoverImage(id: string, coverImage: string): Promise<ILiveStream | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    return LiveStreamModel.findByIdAndUpdate(
      id,
      {
        $set: {
          coverImage,
        },
      },
      { new: true },
    ).populate('hostId', 'profile email isVerified');
  }

  async incrementViewerCount(id: string): Promise<ILiveStream | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    const stream = await LiveStreamModel.findOneAndUpdate(
      { _id: id, status: LIVE_STREAM_STATUS.LIVE },
      { $inc: { viewerCount: 1 } },
      { new: true },
    );
    
    if (stream && stream.viewerCount > (stream.peakViewerCount || 0)) {
      stream.peakViewerCount = stream.viewerCount;
      await stream.save();
    }
    
    return stream;
  }

  async addActiveViewer(id: string, userId: string): Promise<ILiveStream | null> {
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) return null;

    const stream = await LiveStreamModel.findOne({ _id: id, status: LIVE_STREAM_STATUS.LIVE });
    if (!stream) return null;

    const viewerObjectId = new mongoose.Types.ObjectId(userId);
    const alreadyActive = (stream.activeViewerIds || []).some((viewerId) => viewerId.equals(viewerObjectId));

    if (!alreadyActive) {
      stream.activeViewerIds = [...(stream.activeViewerIds || []), viewerObjectId] as any;
      stream.viewerCount = stream.activeViewerIds.length;
      if (stream.viewerCount > (stream.peakViewerCount || 0)) {
        stream.peakViewerCount = stream.viewerCount;
      }
      await stream.save();
    }

    return stream;
  }

  async decrementViewerCount(id: string): Promise<ILiveStream | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    const stream = await LiveStreamModel.findByIdAndUpdate(
      id,
      { $inc: { viewerCount: -1 } },
      { new: true },
    );
    
    if (stream && stream.viewerCount < 0) {
      stream.viewerCount = 0;
      await stream.save();
    }
    
    return stream;
  }

  async removeActiveViewer(id: string, userId: string): Promise<ILiveStream | null> {
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) return null;

    const stream = await LiveStreamModel.findById(id);
    if (!stream) return null;

    const viewerObjectId = new mongoose.Types.ObjectId(userId);
    stream.activeViewerIds = (stream.activeViewerIds || []).filter((viewerId) => !viewerId.equals(viewerObjectId)) as any;
    stream.viewerCount = stream.activeViewerIds.length;
    await stream.save();

    return stream;
  }

  async incrementLikesCount(id: string): Promise<ILiveStream | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    return LiveStreamModel.findByIdAndUpdate(
      id,
      {
        $inc: { likesCount: 1 },
      },
      { new: true },
    );
  }

  async incrementSharesCount(id: string): Promise<ILiveStream | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    return LiveStreamModel.findByIdAndUpdate(
      id,
      {
        $inc: { sharesCount: 1 },
      },
      { new: true },
    );
  }

  async addComment(streamId: string, userId: string, text: string): Promise<ILiveStreamComment> {
    const comment = await LiveStreamCommentModel.create({
      streamId: new mongoose.Types.ObjectId(streamId),
      userId: new mongoose.Types.ObjectId(userId),
      text,
    });

    await LiveStreamModel.findByIdAndUpdate(streamId, {
      $inc: { commentsCount: 1 },
    }).exec();

    return comment.populate('userId', 'profile email isVerified');
  }

  async getRecentComments(streamId: string, limit = 50): Promise<ILiveStreamComment[]> {
    if (!mongoose.Types.ObjectId.isValid(streamId)) return [];

    return LiveStreamCommentModel.find({ streamId: new mongoose.Types.ObjectId(streamId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'profile email isVerified')
      .exec();
  }
}

export const liveStreamRepository = new LiveStreamRepository();
