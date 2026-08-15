import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { KidsAgeGroup } from '../src/modules/kids-mode/kids-mode.model.js';
import { KidsModeService } from '../src/modules/kids-mode/kids-mode.service.js';
import { setupKidsModeBodySchema } from '../src/modules/kids-mode/kids-mode.validation.js';
import { ReelService } from '../src/modules/reels/reel.service.js';
import { createReelBodySchema } from '../src/modules/reels/reel.validation.js';

describe('Kids Mode validation', () => {
  it('requires a matching six-digit parental PIN', () => {
    expect(
      setupKidsModeBodySchema.parse({
        pin: '123456',
        confirmPin: '123456',
        ageGroup: '7-9',
        dailyLimitMinutes: 61,
      }),
    ).toMatchObject({ pin: '123456', ageGroup: KidsAgeGroup.SEVEN_TO_NINE });

    expect(
      setupKidsModeBodySchema.safeParse({
        pin: '1234',
        confirmPin: '9999',
        ageGroup: '7-9',
        dailyLimitMinutes: 60,
      }).success,
    ).toBe(false);
  });

  it('accepts the upload-facing kids boolean and maps it to the stored field', () => {
    const parsed = createReelBodySchema.parse({
      mediaAssetId: new Types.ObjectId().toString(),
      kids: true,
    });

    expect(parsed.forKids).toBe(true);
  });
});

describe('Kids Mode service', () => {
  it('activates on setup, requires the PIN to exit, and enforces daily screen time', async () => {
    const userId = new Types.ObjectId();
    let current = new Date('2026-08-14T10:00:00.000Z');
    let document: any = null;
    const repository = {
      findByUserId: vi.fn(async () => document),
      create: vi.fn(async (input) => {
        document = {
          ...input,
          _id: new Types.ObjectId(),
          createdAt: current,
          updatedAt: current,
        };
        return document;
      }),
      update: vi.fn(),
      save: vi.fn(async (value) => value),
    };
    const service = new KidsModeService(repository as never, () => current);

    const setup = await service.setup(userId.toString(), {
      pin: '123456',
      confirmPin: '123456',
      childNickname: 'Rokey',
      ageGroup: KidsAgeGroup.SEVEN_TO_NINE,
      dailyLimitMinutes: 1,
    });

    expect(setup).toMatchObject({ configured: true, isActive: true, canWatch: true, remainingSeconds: 60 });
    await expect(service.exit(userId.toString(), { pin: '000000' })).rejects.toMatchObject({
      code: 'KIDS_PIN_INVALID',
    });

    current = new Date('2026-08-14T10:01:01.000Z');
    const expired = await service.getStatus(userId.toString());
    expect(expired).toMatchObject({ isActive: true, canWatch: false, limitReached: true, remainingSeconds: 0 });
  });

  it('requires the correct PIN to re-enter Kids Mode', async () => {
    const userId = new Types.ObjectId();
    const current = new Date('2026-08-14T10:00:00.000Z');
    let document: any = null;
    const repository = {
      findByUserId: vi.fn(async () => document),
      create: vi.fn(async (input) => {
        document = { ...input, _id: new Types.ObjectId(), createdAt: current, updatedAt: current };
        return document;
      }),
      update: vi.fn(),
      save: vi.fn(async (value) => value),
    };
    const service = new KidsModeService(repository as never, () => current);
    await service.setup(userId.toString(), {
      pin: '654321',
      confirmPin: '654321',
      ageGroup: KidsAgeGroup.THREE_TO_SIX,
      dailyLimitMinutes: 60,
    });
    await service.exit(userId.toString(), { pin: '654321' });

    await expect(service.enter(userId.toString(), { pin: '111111' })).rejects.toMatchObject({
      code: 'KIDS_PIN_INVALID',
    });
    await expect(service.enter(userId.toString(), { pin: '654321' })).resolves.toMatchObject({
      isActive: true,
    });
  });
});

describe('Kids Reel feed', () => {
  it('requests only kids-ready videos and excludes reels reported by the viewer', async () => {
    const reportedId = new Types.ObjectId();
    const reels = { listKidsReadyPublic: vi.fn().mockResolvedValue([]) };
    const reports = { listReelIdsReportedBy: vi.fn().mockResolvedValue([reportedId]) };
    const service = new ReelService(
      reels as never,
      {} as never,
      {} as never,
      vi.fn() as never,
      vi.fn(),
      vi.fn(),
      reports as never,
    );

    const result = await service.getKidsFeed({ limit: 20 }, new Types.ObjectId().toString());

    expect(reels.listKidsReadyPublic).toHaveBeenCalledWith(
      21,
      undefined,
      undefined,
      [reportedId],
    );
    expect(result.items).toEqual([]);
  });
});
