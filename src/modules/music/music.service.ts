import { cacheKeys } from '../../infrastructure/cache/cache-keys.js';
import { cacheService } from '../../infrastructure/cache/cache.service.js';
import { jamendoProvider, type JamendoProvider } from './providers/jamendo.provider.js';
import type { MusicSearchQuery, MusicSearchResult, MusicTrack } from './music.types.js';
import { SavedMusicModel } from './saved-music.model.js';
import { Types } from 'mongoose';

const MUSIC_SEARCH_CACHE_TTL_SECONDS = 5 * 60;

export class MusicService {
  constructor(private readonly provider: JamendoProvider = jamendoProvider) {}

  async searchTracks(query: MusicSearchQuery): Promise<MusicSearchResult> {
    const normalizedQuery: MusicSearchQuery = {
      ...query,
      search: query.search?.trim().toLocaleLowerCase('en-US'),
    };
    const cacheKey = cacheKeys.musicSearch(
      normalizedQuery.search ?? '',
      normalizedQuery.page,
      normalizedQuery.limit,
      normalizedQuery.order ?? '',
    );
    const cached = await cacheService.get<MusicSearchResult>(cacheKey);

    if (cached) {
      return cached;
    }

    const result = await this.provider.searchTracks(normalizedQuery);
    const response: MusicSearchResult = {
      tracks: result.tracks,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        hasNextPage: query.page * query.limit < result.total,
      },
    };

    await cacheService.set(cacheKey, response, MUSIC_SEARCH_CACHE_TTL_SECONDS);
    return response;
  }

  async getTrackById(providerTrackId: string): Promise<MusicTrack | null> {
    return this.provider.getTrackById(providerTrackId);
  }

  async toggleSaveTrack(userId: string | Types.ObjectId, trackData: Omit<MusicTrack, 'provider' | 'albumName' | 'shareUrl' | 'licenseUrl' | 'downloadAllowed' | 'downloadUrl'>) {
    const existing = await SavedMusicModel.findOne({
      userId,
      providerTrackId: trackData.providerTrackId,
    });

    if (existing) {
      await existing.deleteOne();
      return { saved: false, trackId: trackData.providerTrackId };
    }

    await SavedMusicModel.create({
      userId,
      providerTrackId: trackData.providerTrackId,
      title: trackData.title,
      artistName: trackData.artistName,
      coverImageUrl: trackData.coverImageUrl,
      audioPreviewUrl: trackData.audioPreviewUrl,
      durationSeconds: trackData.durationSeconds,
    });

    return { saved: true, trackId: trackData.providerTrackId };
  }

  async getSavedTracks(userId: string | Types.ObjectId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [tracks, total] = await Promise.all([
      SavedMusicModel.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SavedMusicModel.countDocuments({ userId }),
    ]);

    return {
      tracks: tracks.map((t) => ({
        providerTrackId: t.providerTrackId,
        title: t.title,
        artistName: t.artistName,
        coverImageUrl: t.coverImageUrl,
        audioPreviewUrl: t.audioPreviewUrl,
        durationSeconds: t.durationSeconds,
        savedAt: t.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        hasNextPage: page * limit < total,
      },
    };
  }
}

export const musicService = new MusicService();
