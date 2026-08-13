import { env } from '../../config/env.config.js';
import {
  mapContrastToFfmpeg,
  mapExposureToFfmpeg,
  REEL_FILTER_FFMPEG,
  ReelFilter,
  ReelEffect,
  volumePercentToMultiplier,
} from '../../modules/reels/reel.constants.js';
import type { ReelDocument } from '../../modules/reels/reel.model.js';

export interface FfmpegGraphInput {
  reel: ReelDocument;
  rawVideoPath: string;
  musicPath?: string | undefined;
  hasOriginalAudio: boolean;
  outputVideoPath: string;
  fontFile?: string | undefined;
}

export interface FfmpegGraph {
  args: string[];
}

/**
 * Builds a deterministic FFmpeg argv array for Reel processing.
 * Never uses shell string interpolation of client text.
 *
 * Scaling policy: fit inside REEL_OUTPUT_MAX_WIDTH x REEL_OUTPUT_MAX_HEIGHT
 * while preserving aspect ratio. Never upscale above source dimensions.
 */
export function buildReelFfmpegGraph(input: FfmpegGraphInput): FfmpegGraph {
  const { reel, rawVideoPath, musicPath, hasOriginalAudio, outputVideoPath } = input;
  const trimStartMs = reel.videoEdit.trimStartMs;
  const trimEndMs = reel.videoEdit.trimEndMs;
  const durationMs = trimEndMs - trimStartMs;
  const durationSeconds = (durationMs / 1_000).toFixed(3);
  const startSeconds = (trimStartMs / 1_000).toFixed(3);
  const originalVolume = volumePercentToMultiplier(reel.audioEdit.originalVolume);
  const musicVolume = volumePercentToMultiplier(reel.audioEdit.musicVolume);
  const brightness = mapExposureToFfmpeg(reel.videoEdit.exposure);
  const contrast = mapContrastToFfmpeg(reel.videoEdit.contrast);
  const styleFilter = REEL_FILTER_FFMPEG[reel.videoEdit.filter] ?? null;

  const videoFilters: string[] = [
    `trim=start=${startSeconds}:duration=${durationSeconds}`,
    'setpts=PTS-STARTPTS',
    buildScaleFilter(),
    `eq=brightness=${brightness}:contrast=${contrast}`,
  ];

  if (styleFilter && reel.videoEdit.filter !== ReelFilter.NONE) {
    videoFilters.push(styleFilter);
  }

  const effectFilter = buildEffectFilter(reel.videoEdit.effect);
  if (effectFilter) {
    videoFilters.push(effectFilter);
  }

  const filterComplex: string[] = [`[0:v]${videoFilters.join(',')}[vout]`];
  const args: string[] = ['-y', '-i', rawVideoPath];

  if (musicPath) {
    args.push('-i', musicPath);
  }

  const music = reel.audioEdit.music;
  const useMusic = Boolean(musicPath && musicVolume > 0);
  const useOriginal = hasOriginalAudio && originalVolume > 0;
  const musicStart = ((music?.trimStartMs ?? 0) / 1_000).toFixed(3);

  if (useOriginal && useMusic) {
    filterComplex.push(
      `[0:a]atrim=start=${startSeconds}:duration=${durationSeconds},asetpts=PTS-STARTPTS,volume=${originalVolume}[aori]`,
      `[1:a]atrim=start=${musicStart}:duration=${durationSeconds},asetpts=PTS-STARTPTS,volume=${musicVolume}[amus]`,
      `[aori][amus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`,
    );
  } else if (useOriginal) {
    filterComplex.push(
      `[0:a]atrim=start=${startSeconds}:duration=${durationSeconds},asetpts=PTS-STARTPTS,volume=${originalVolume}[aout]`,
    );
  } else if (useMusic) {
    filterComplex.push(
      `[1:a]atrim=start=${musicStart}:duration=${durationSeconds},asetpts=PTS-STARTPTS,volume=${musicVolume},aformat=sample_rates=48000:channel_layouts=stereo[aout]`,
    );
  } else {
    filterComplex.push(
      `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${durationSeconds},asetpts=PTS-STARTPTS[aout]`,
    );
  }

  args.push(
    '-filter_complex',
    filterComplex.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'main',
    '-b:v',
    env.REEL_OUTPUT_VIDEO_BITRATE,
    '-c:a',
    'aac',
    '-b:a',
    env.REEL_OUTPUT_AUDIO_BITRATE,
    '-ar',
    '48000',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    '-t',
    durationSeconds,
    outputVideoPath,
  );

  return { args };
}

export function buildThumbnailFfmpegArgs(
  videoPath: string,
  thumbnailPath: string,
): string[] {
  return [
    '-y',
    '-ss',
    '0.1',
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    thumbnailPath,
  ];
}

export function buildPhotoSourceVideoFfmpegArgs(
  imagePath: string,
  outputVideoPath: string,
  durationMs: number,
): string[] {
  const durationSeconds = (Math.max(1_000, durationMs) / 1_000).toFixed(3);
  const maxW = env.REEL_OUTPUT_MAX_WIDTH;
  const maxH = env.REEL_OUTPUT_MAX_HEIGHT;

  return [
    '-y',
    '-loop',
    '1',
    '-framerate',
    '30',
    '-t',
    durationSeconds,
    '-i',
    imagePath,
    '-f',
    'lavfi',
    '-t',
    durationSeconds,
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-vf',
    `scale=${maxW}:${maxH}:force_original_aspect_ratio=decrease,pad=${maxW}:${maxH}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p`,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'main',
    '-b:v',
    env.REEL_OUTPUT_VIDEO_BITRATE,
    '-r',
    '30',
    '-c:a',
    'aac',
    '-b:a',
    env.REEL_OUTPUT_AUDIO_BITRATE,
    '-ar',
    '48000',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    '-shortest',
    outputVideoPath,
  ];
}

function buildScaleFilter(): string {
  const maxW = env.REEL_OUTPUT_MAX_WIDTH;
  const maxH = env.REEL_OUTPUT_MAX_HEIGHT;
  // Fit inside maxW x maxH, preserve aspect ratio, never upscale, force even dimensions.
  return `scale='min(iw,min(${maxW},floor(${maxW}*ih/${maxH})))':'-2':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
}

function buildEffectFilter(effect: ReelEffect): string | null {
  switch (effect) {
    case ReelEffect.ZOOM:
      return 'scale=trunc(iw*1.08/2)*2:trunc(ih*1.08/2)*2,crop=trunc(iw/1.08/2)*2:trunc(ih/1.08/2)*2';
    case ReelEffect.GLITCH:
      return 'eq=saturation=1.25:contrast=1.08';
    case ReelEffect.FLASH:
      return 'eq=brightness=0.12:saturation=1.08';
    case ReelEffect.VHS:
      return 'noise=alls=8:allf=t,hue=s=0.85';
    case ReelEffect.SPARKLE:
      return 'eq=brightness=0.08:saturation=1.35:contrast=1.08';
    default:
      return null;
  }
}
