import { spawn } from 'node:child_process';

import { env } from '../../config/env.config.js';
import { AppError } from '../../common/errors/app-error.js';
import { logger } from '../logger/logger.js';

export interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  sample_rate?: string;
  channels?: number;
}

export interface FfprobeResult {
  format?: {
    duration?: string;
    size?: string;
    format_name?: string;
  };
  streams?: FfprobeStream[];
}

export interface MediaProbeSummary {
  durationMs: number;
  width: number;
  height: number;
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec?: string;
  audioCodec?: string;
}

export async function runFfprobe(filePath: string): Promise<MediaProbeSummary> {
  return runFfprobeSource(filePath);
}

export async function runFfprobeSource(source: string): Promise<MediaProbeSummary> {
  const raw = await runProcess(env.FFPROBE_PATH, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    source,
  ]);

  let parsed: FfprobeResult;

  try {
    parsed = JSON.parse(raw.stdout) as FfprobeResult;
  } catch {
    throw new AppError('ffprobe returned invalid JSON.', 500, {
      code: 'REEL_INVALID_MEDIA',
    });
  }

  const videoStream = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const audioStream = parsed.streams?.find((stream) => stream.codec_type === 'audio');
  const durationSeconds = Number(parsed.format?.duration ?? videoStream?.duration ?? 0);
  const width = videoStream?.width ?? 0;
  const height = videoStream?.height ?? 0;

  if (!videoStream || !width || !height || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new AppError('Media probe could not verify video streams.', 422, {
      code: 'REEL_INVALID_MEDIA',
    });
  }

  return {
    durationMs: Math.round(durationSeconds * 1_000),
    width,
    height,
    hasVideo: true,
    hasAudio: Boolean(audioStream),
    ...(videoStream.codec_name ? { videoCodec: videoStream.codec_name } : {}),
    ...(audioStream?.codec_name ? { audioCodec: audioStream.codec_name } : {}),
  };
}

export interface RunFfmpegOptions {
  args: readonly string[];
  timeoutMs: number;
  onStderrChunk?: ((chunk: string) => void) | undefined;
}

export async function runFfmpeg(options: RunFfmpegOptions): Promise<void> {
  console.log('[FFMPEG] start', {
    binary: env.FFMPEG_PATH,
    args: options.args,
    timeoutMs: options.timeoutMs,
  });

  const result = await runProcess(env.FFMPEG_PATH, options.args, {
    timeoutMs: options.timeoutMs,
    onStderrChunk: options.onStderrChunk,
  });

  if (result.exitCode !== 0) {
    console.error('[FFMPEG] failed', {
      exitCode: result.exitCode,
      stderrTail: result.stderr.slice(-4_000),
      args: options.args,
    });
    logger.warn(
      {
        exitCode: result.exitCode,
        stderrTail: result.stderr.slice(-1_000),
      },
      'FFmpeg process failed',
    );
    throw new AppError('FFmpeg processing failed.', 500, {
      code: 'REEL_PROCESSING_FAILED',
      details: {
        exitCode: result.exitCode,
        stderrTail: result.stderr.slice(-4_000),
        args: options.args,
      },
    });
  }

  console.log('[FFMPEG] success', {
    stderrTail: result.stderr.slice(-1_000),
  });
}

interface RunProcessOptions {
  timeoutMs?: number | undefined;
  onStderrChunk?: ((chunk: string) => void) | undefined;
}

interface RunProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function runProcess(
  binary: string,
  args: readonly string[],
  options: RunProcessOptions = {},
): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            child.kill('SIGKILL');
            settleReject(
              new AppError('Media process timed out.', 500, {
                code: 'REEL_PROCESSING_TIMEOUT',
              }),
            );
          }, options.timeoutMs)
        : undefined;

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 2_000_000) {
        stdout = stdout.slice(-1_000_000);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr += text;
      if (stderr.length > 2_000_000) {
        stderr = stderr.slice(-1_000_000);
      }
      options.onStderrChunk?.(text);
    });

    child.on('error', (error) => {
      console.error('[MEDIA_PROCESS] failed to start', {
        binary,
        args,
        message: error.message,
      });
      settleReject(
        new AppError(`Failed to start ${binary}.`, 500, {
          code: 'REEL_PROCESSING_FAILED',
          details: { reason: error.message },
        }),
      );
    });

    child.on('close', (exitCode) => {
      settleResolve({ stdout, stderr, exitCode });
    });

    function settleResolve(value: RunProcessResult): void {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(value);
    }

    function settleReject(error: Error): void {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      reject(error);
    }
  });
}
