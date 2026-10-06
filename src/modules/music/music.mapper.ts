import { AppError } from '../../common/errors/app-error.js';
import type { MusicTrack } from './music.types.js';

export interface JamendoTrackPayload {
  id?: unknown;
  name?: unknown;
  artist_name?: unknown;
  album_name?: unknown;
  album_image?: unknown;
  image?: unknown;
  audio?: unknown;
  duration?: unknown;
  shareurl?: unknown;
  license_ccurl?: unknown;
  audiodownload_allowed?: unknown;
  audiodownload?: unknown;
}

export function mapJamendoTrack(track: JamendoTrackPayload): MusicTrack {
  const providerTrackId = requiredString(track.id);
  const title = requiredString(track.name);
  const artistName = requiredString(track.artist_name);
  const audioPreviewUrl = requiredUrl(track.audio);
  const durationSeconds = Number(track.duration);

  if (!providerTrackId || !title || !artistName || !audioPreviewUrl || !Number.isFinite(durationSeconds)) {
    throw invalidJamendoResponse();
  }

  const downloadAllowed = track.audiodownload_allowed === true;

  return {
    provider: 'jamendo',
    providerTrackId,
    title,
    artistName,
    albumName: optionalString(track.album_name),
    coverImageUrl: optionalUrl(track.album_image) ?? optionalUrl(track.image),
    audioPreviewUrl,
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    shareUrl: optionalUrl(track.shareurl),
    licenseUrl: optionalUrl(track.license_ccurl),
    downloadAllowed,
    downloadUrl: downloadAllowed ? optionalUrl(track.audiodownload) : null,
  };
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalString(value: unknown): string | null {
  return requiredString(value);
}

function requiredUrl(value: unknown): string | null {
  return optionalUrl(value);
}

function optionalUrl(value: unknown): string | null {
  const candidate = optionalString(value);

  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function invalidJamendoResponse(): AppError {
  return new AppError('Music provider returned an invalid response.', 502, {
    code: 'MUSIC_PROVIDER_INVALID_RESPONSE',
  });
}

