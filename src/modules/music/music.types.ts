export const MUSIC_ORDER_VALUES = [
  'popularity_total',
  'popularity_month',
  'popularity_week',
  'releasedate',
  'name',
  'duration',
  'artist_name',
  'album_name',
] as const;

export type MusicOrder = (typeof MUSIC_ORDER_VALUES)[number];

export interface MusicSearchQuery {
  search?: string | undefined;
  page: number;
  limit: number;
  order?: MusicOrder | undefined;
}

export interface MusicTrack {
  provider: 'jamendo';
  providerTrackId: string;
  title: string;
  artistName: string;
  albumName: string | null;
  coverImageUrl: string | null;
  audioPreviewUrl: string;
  durationSeconds: number;
  shareUrl: string | null;
  licenseUrl: string | null;
  downloadAllowed: boolean;
  downloadUrl: string | null;
}

export interface MusicSearchResult {
  tracks: MusicTrack[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNextPage: boolean;
  };
}

