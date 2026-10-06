import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { AppError } from '../src/common/errors/app-error.js';
import type { JamendoProvider as JamendoProviderType } from '../src/modules/music/providers/jamendo.provider.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mongodb://127.0.0.1:27017/jesusname7_test';
delete process.env.REDIS_URL;

let JamendoProvider: typeof JamendoProviderType;
let mapJamendoTrack: typeof import('../src/modules/music/music.mapper.js').mapJamendoTrack;
let musicSearchQuerySchema: typeof import('../src/modules/music/music.validation.js').musicSearchQuerySchema;

beforeAll(async () => {
  ({ JamendoProvider } = await import('../src/modules/music/providers/jamendo.provider.js'));
  ({ mapJamendoTrack } = await import('../src/modules/music/music.mapper.js'));
  ({ musicSearchQuerySchema } = await import('../src/modules/music/music.validation.js'));
});

const rawTrack = {
  id: '42',
  name: 'Morning Light',
  artist_name: 'Example Artist',
  album_name: 'Example Album',
  album_image: 'https://cdn.example.com/cover.jpg',
  audio: 'https://cdn.example.com/preview.mp3',
  duration: 180,
  shareurl: 'https://www.jamendo.com/track/42',
  license_ccurl: 'https://creativecommons.org/licenses/by/4.0/',
  audiodownload_allowed: true,
  audiodownload: 'https://cdn.example.com/download.mp3',
};

function jamendoResponse(results: unknown[], total = results.length): Response {
  return new Response(
    JSON.stringify({
      headers: { status: 'success', code: 0, results_count: results.length, results_fullcount: total },
      results,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('Jamendo music integration', () => {
  it('validates and defaults music search parameters', () => {
    expect(musicSearchQuerySchema.parse({ search: '  happy  ' })).toEqual({
      search: 'happy',
      page: 1,
      limit: 20,
    });
    expect(musicSearchQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(musicSearchQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(musicSearchQuerySchema.safeParse({ unexpected: 'value' }).success).toBe(false);
  });

  it('maps a Jamendo track to the public contract', () => {
    expect(mapJamendoTrack(rawTrack)).toMatchObject({
      provider: 'jamendo',
      providerTrackId: '42',
      title: 'Morning Light',
      artistName: 'Example Artist',
      durationSeconds: 180,
      downloadAllowed: true,
      downloadUrl: 'https://cdn.example.com/download.mp3',
    });
  });

  it('never returns a download URL when downloading is not allowed', () => {
    expect(
      mapJamendoTrack({ ...rawTrack, audiodownload_allowed: false }).downloadUrl,
    ).toBeNull();
  });

  it('returns normalized search results and safe pagination totals', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jamendoResponse([rawTrack], 25));
    const provider = new JamendoProvider({ clientId: 'test-client-id', fetchImplementation: fetchMock });
    const result = await provider.searchTracks({ search: 'happy', page: 1, limit: 20 });

    expect(result.total).toBe(25);
    expect(result.tracks).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v3.0/tracks/');
  });

  it('supports an empty result', async () => {
    const provider = new JamendoProvider({
      clientId: 'test-client-id',
      fetchImplementation: vi.fn().mockResolvedValue(jamendoResponse([], 0)),
    });

    await expect(provider.searchTracks({ page: 1, limit: 20 })).resolves.toEqual({ tracks: [], total: 0 });
  });

  it('maps upstream non-success responses to a clean application error', async () => {
    const provider = new JamendoProvider({
      clientId: 'secret-client-id',
      fetchImplementation: vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })),
    });

    const error = await provider.searchTracks({ page: 1, limit: 20 }).catch((value: unknown) => value as AppError);
    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('MUSIC_PROVIDER_UNAVAILABLE');
    expect(error.message).not.toContain('secret-client-id');
  });

  it('maps Jamendo-level failures to a clean application error', async () => {
    const body = new Response(
      JSON.stringify({ headers: { status: 'failed', code: 5, error_message: 'Private detail' }, results: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    const provider = new JamendoProvider({
      clientId: 'test-client-id',
      fetchImplementation: vi.fn().mockResolvedValue(body),
    });

    await expect(provider.searchTracks({ page: 1, limit: 20 })).rejects.toMatchObject({
      statusCode: 502,
      code: 'MUSIC_PROVIDER_ERROR',
    });
  });

  it('returns a gateway timeout when Jamendo does not respond', async () => {
    const fetchImplementation = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    const provider = new JamendoProvider({ clientId: 'test-client-id', fetchImplementation, timeoutMs: 5 });

    await expect(provider.searchTracks({ page: 1, limit: 20 })).rejects.toMatchObject({
      statusCode: 504,
      code: 'MUSIC_PROVIDER_TIMEOUT',
    });
  });
});

