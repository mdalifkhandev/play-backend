import { AppError } from '../../../common/errors/app-error.js';
import { env } from '../../../config/env.config.js';
import { logger } from '../../../infrastructure/logger/logger.js';
import { mapJamendoTrack, type JamendoTrackPayload } from '../music.mapper.js';
import type { MusicSearchQuery, MusicTrack } from '../music.types.js';

const JAMENDO_BASE_URL = 'https://api.jamendo.com/v3.0';
const DEFAULT_TIMEOUT_MS = 8_000;

interface JamendoResponseBody {
  headers?: {
    status?: unknown;
    code?: unknown;
    error_message?: unknown;
    results_count?: unknown;
    results_fullcount?: unknown;
  };
  results?: unknown;
}

interface JamendoProviderOptions {
  clientId?: string | undefined;
  fetchImplementation?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
}

export interface JamendoSearchResult {
  tracks: MusicTrack[];
  total: number;
}

export class JamendoProvider {
  private readonly clientId: string | undefined;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: JamendoProviderOptions = {}) {
    this.clientId = options.clientId ?? env.JAMENDO_CLIENT_ID;
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async searchTracks(query: MusicSearchQuery): Promise<JamendoSearchResult> {
    const offset = (query.page - 1) * query.limit;
    const parameters = new URLSearchParams({
      format: 'json',
      limit: String(query.limit),
      offset: String(offset),
      include: 'licenses',
      audioformat: 'mp32',
      imagesize: '300',
    });

    if (query.search) {
      parameters.set('search', query.search);
    }

    if (query.order) {
      parameters.set('order', query.order);
    }

    const body = await this.request('/tracks/', parameters);
    const results = requireResults(body);
    const tracks = results.map((track) => mapJamendoTrack(track));
    const total = nonNegativeNumber(body.headers?.results_fullcount)
      ?? nonNegativeNumber(body.headers?.results_count)
      ?? tracks.length;

    return { tracks, total };
  }

  async getTrackById(providerTrackId: string): Promise<MusicTrack | null> {
    const parameters = new URLSearchParams({
      format: 'json',
      id: providerTrackId,
      limit: '1',
      include: 'licenses',
      audioformat: 'mp32',
      imagesize: '300',
    });
    const results = requireResults(await this.request('/tracks/', parameters));
    return results[0] ? mapJamendoTrack(results[0]) : null;
  }

  private async request(path: string, parameters: URLSearchParams): Promise<JamendoResponseBody> {
    if (!this.clientId || this.clientId === 'your_new_client_id') {
      throw new AppError('Music provider is not configured.', 503, {
        code: 'MUSIC_PROVIDER_NOT_CONFIGURED',
      });
    }

    parameters.set('client_id', this.clientId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(`${JAMENDO_BASE_URL}${path}?${parameters}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.warn({ provider: 'jamendo', upstreamStatus: response.status }, 'Music provider request failed');
        throw new AppError('Music provider is temporarily unavailable.', 502, {
          code: response.status === 429 ? 'MUSIC_PROVIDER_RATE_LIMITED' : 'MUSIC_PROVIDER_UNAVAILABLE',
        });
      }

      const body = await parseResponse(response);
      assertJamendoSuccess(body);
      return body;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (isAbortError(error)) {
        logger.warn({ provider: 'jamendo' }, 'Music provider request timed out');
        throw new AppError('Music provider request timed out.', 504, {
          code: 'MUSIC_PROVIDER_TIMEOUT',
        });
      }

      logger.warn(
        { provider: 'jamendo', errorType: error instanceof Error ? error.name : 'UnknownError' },
        'Music provider network request failed',
      );
      throw new AppError('Music provider is temporarily unavailable.', 502, {
        code: 'MUSIC_PROVIDER_UNAVAILABLE',
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function parseResponse(response: Response): Promise<JamendoResponseBody> {
  try {
    return (await response.json()) as JamendoResponseBody;
  } catch {
    throw new AppError('Music provider returned an invalid response.', 502, {
      code: 'MUSIC_PROVIDER_INVALID_RESPONSE',
    });
  }
}

function assertJamendoSuccess(body: JamendoResponseBody): void {
  const status = body.headers?.status;
  const code = body.headers?.code;
  const success = status === 'success' && (code === 0 || code === '0');

  if (!success) {
    logger.warn({ provider: 'jamendo', providerCode: code }, 'Music provider rejected request');
    throw new AppError('Music provider could not complete the request.', 502, {
      code: 'MUSIC_PROVIDER_ERROR',
    });
  }
}

function requireResults(body: JamendoResponseBody): JamendoTrackPayload[] {
  if (!Array.isArray(body.results)) {
    throw new AppError('Music provider returned an invalid response.', 502, {
      code: 'MUSIC_PROVIDER_INVALID_RESPONSE',
    });
  }

  return body.results as JamendoTrackPayload[];
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export const jamendoProvider = new JamendoProvider();
