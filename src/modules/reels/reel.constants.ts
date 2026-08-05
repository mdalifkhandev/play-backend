export enum ReelStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
  DELETED = 'deleted',
}

export enum ReelVisibility {
  PUBLIC = 'public',
}

export enum ReelFilter {
  NONE = 'none',
  VIVID = 'vivid',
  WARM = 'warm',
  COOL = 'cool',
  GRAYSCALE = 'grayscale',
  SEPIA = 'sepia',
}

export enum ReelEffect {
  NONE = 'none',
  SPARKLE = 'sparkle',
}

export enum ReelQueueSubmissionState {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  FAILED = 'failed',
}

export const REEL_PROCESS_JOB_NAME = 'process-reel';
export const REEL_QUEUE_NAME = 'reel-processing';

export const REEL_PROGRESS = Object.freeze({
  QUEUED: 0,
  STARTED: 5,
  RAW_DOWNLOADED: 10,
  INSPECTED: 20,
  MUSIC_PREPARED: 30,
  FFMPEG_START: 40,
  FFMPEG_DONE: 80,
  THUMBNAIL_DONE: 85,
  UPLOAD_STARTED: 90,
  READY: 100,
});

export const REEL_SAFE_ERROR_CODES = Object.freeze({
  PROCESSING_FAILED: 'REEL_PROCESSING_FAILED',
  TIMEOUT: 'REEL_PROCESSING_TIMEOUT',
  INVALID_MEDIA: 'REEL_INVALID_MEDIA',
  MUSIC_DOWNLOAD_FAILED: 'REEL_MUSIC_DOWNLOAD_FAILED',
  UPLOAD_FAILED: 'REEL_OUTPUT_UPLOAD_FAILED',
  CANCELLED: 'REEL_CANCELLED',
});

/** Maps UI filter enum to a fixed FFmpeg video filter fragment. Never concatenate client input. */
export const REEL_FILTER_FFMPEG = Object.freeze({
  [ReelFilter.NONE]: null,
  [ReelFilter.VIVID]: 'eq=saturation=1.35:contrast=1.08',
  [ReelFilter.WARM]: 'colorbalance=rs=0.12:gs=0.02:bs=-0.08',
  [ReelFilter.COOL]: 'colorbalance=rs=-0.08:gs=0.02:bs=0.12',
  [ReelFilter.GRAYSCALE]: 'hue=s=0',
  [ReelFilter.SEPIA]: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
} as const);

/**
 * Exposure/contrast UI range is 0–100 with neutral at 50.
 * exposure → eq brightness in [-0.25, +0.25]
 * contrast → eq contrast in [0.7, 1.3]
 */
export function mapExposureToFfmpeg(exposure: number): number {
  return Number((((exposure - 50) / 50) * 0.25).toFixed(4));
}

export function mapContrastToFfmpeg(contrast: number): number {
  return Number((0.7 + (contrast / 100) * 0.6).toFixed(4));
}

export function volumePercentToMultiplier(volume: number): number {
  return volume / 100;
}

export function reelJobId(reelId: string): string {
  return `reel:${reelId}`;
}
