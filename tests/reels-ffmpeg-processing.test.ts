import { describe, expect, it } from 'vitest';
import { createReelBodySchema, createReelVideoEditSchema, createReelAudioSchema } from '../src/modules/reels/reel.validation.js';
import { buildReelFfmpegGraph } from '../src/infrastructure/media/reel-ffmpeg-graph.js';
import { ReelFilter } from '../src/modules/reels/reel.constants.js';

describe('Server-Side FFmpeg Video Edit Processing Pipeline', () => {
  it('normalizes client JSON payload (startSec/endSec, xPercent/yPercent, soundUri, addedVolume, Vivid filter)', () => {
    const rawClientPayload = {
      mediaAssetId: '640000000000000000000101',
      caption: 'Testing server FFmpeg video edit',
      videoEdit: {
        trim: { startSec: 2.5, endSec: 15.0 },
        filter: 'Vivid',
        effect: 'Zoom',
        textOverlay: { text: 'Hello World', xPercent: 50, yPercent: 40, fontSize: 32 },
      },
      audio: {
        soundUri: 'https://cdn.example.com/audio.mp3',
        trimStartSec: 0,
        trimEndSec: 12,
        originalVolume: 30,
        addedVolume: 80,
      },
    };

    const parsed = createReelBodySchema.parse(rawClientPayload);

    expect(parsed.videoEdit.trim).toEqual({ startMs: 2500, endMs: 15000 });
    expect(parsed.videoEdit.filter).toBe(ReelFilter.VIVID);
    expect(parsed.videoEdit.overlayText).toMatchObject({
      text: 'Hello World',
      x: 0.5,
      y: 0.4,
      fontSize: 32,
    });
    expect(parsed.audio.originalVolume).toBe(30);
    expect(parsed.audio.musicVolume).toBe(80);
    expect(parsed.audio.soundUri).toBe('https://cdn.example.com/audio.mp3');
  });

  it('builds FFmpeg argv filter graph with trim, eq/colorchannelmixer, drawtext, and amix audio filters', () => {
    const mockReel: any = {
      _id: '640000000000000000000101',
      ownerId: 'user123',
      videoEdit: {
        trimStartMs: 2500,
        trimEndMs: 15000,
        filter: ReelFilter.VIVID,
        effect: 'none',
        exposure: 50,
        contrast: 50,
        overlayText: {
          text: 'Hello World',
          x: 0.5,
          y: 0.4,
          fontSize: 32,
        },
      },
      audioEdit: {
        originalVolume: 30,
        musicVolume: 80,
        soundUri: 'https://cdn.example.com/audio.mp3',
      },
    };

    const graph = buildReelFfmpegGraph({
      reel: mockReel,
      rawVideoPath: '/tmp/raw.mp4',
      musicPath: '/tmp/music.mp3',
      hasOriginalAudio: true,
      outputVideoPath: '/tmp/output.mp4',
    });

    const filterArg = graph.args[graph.args.indexOf('-filter_complex') + 1];

    expect(filterArg).toContain('trim=start=2.500:duration=12.500');
    expect(filterArg).toContain('eq=saturation=1.5:contrast=1.2');
    expect(filterArg).toContain('drawtext=text=\'Hello World\'');
    expect(filterArg).toContain('amix=inputs=2');
  });
});
