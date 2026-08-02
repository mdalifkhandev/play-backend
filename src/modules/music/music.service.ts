import { cacheKeys } from '../../infrastructure/cache/cache-keys.js';
import { cacheService } from '../../infrastructure/cache/cache.service.js';
import { jamendoProvider, type JamendoProvider } from './providers/jamendo.provider.js';
import type { MusicSearchQuery, MusicSearchResult } from './music.types.js';

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
}

export const musicService = new MusicService();
