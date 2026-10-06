import { beforeEach, describe, expect, it, vi } from 'vitest';

import { kidsModeService } from '../src/modules/kids-mode/kids-mode.service.js';
import { liveStreamService } from '../src/modules/live-streams/live-stream.service.js';
import { registerLiveStreamSocketHandlers } from '../src/sockets/handlers/live-stream.socket.js';
import { SOCKET_EVENTS } from '../src/sockets/socket-events.js';

describe('Live stream socket lifecycle', () => {
  beforeEach(() => {
    vi.spyOn(kidsModeService, 'getStatus').mockResolvedValue({
      configured: false,
      isActive: false,
      canWatch: false,
      childNickname: null,
      ageGroup: null,
      dailyLimitMinutes: null,
      usedSeconds: 0,
      remainingSeconds: 0,
      limitReached: false,
    });
  });

  it('counts a socket once and removes it when disconnected', async () => {
    const handlers = new Map<string, (...args: any[]) => any>();
    const socket = {
      id: 'socket-1',
      user: { id: 'user-1' },
      on: vi.fn((event: string, handler: (...args: any[]) => any) => handlers.set(event, handler)),
      join: vi.fn().mockResolvedValue(undefined),
      leave: vi.fn().mockResolvedValue(undefined),
      to: vi.fn(() => ({ emit: vi.fn() })),
      emit: vi.fn(),
    };
    const io = { to: vi.fn(() => ({ emit: vi.fn() })) };
    const join = vi.spyOn(liveStreamService, 'joinStream').mockResolvedValue({
      viewerCount: 1,
      peakViewerCount: 1,
    } as never);
    const leave = vi.spyOn(liveStreamService, 'leaveStream').mockResolvedValue({
      viewerCount: 0,
      peakViewerCount: 1,
    } as never);

    registerLiveStreamSocketHandlers(io, socket);
    await handlers.get(SOCKET_EVENTS.LIVE_JOIN)?.({ streamId: 'stream-1' });
    await handlers.get(SOCKET_EVENTS.LIVE_JOIN)?.({ streamId: 'stream-1' });

    expect(join).toHaveBeenCalledOnce();
    expect(socket.join).toHaveBeenCalledOnce();

    handlers.get('disconnect')?.();
    await vi.waitFor(() => expect(leave).toHaveBeenCalledOnce());
  });

  it('blocks live socket actions while Kids Mode is active', async () => {
    vi.mocked(kidsModeService.getStatus).mockResolvedValueOnce({
      configured: true,
      isActive: true,
      canWatch: true,
      childNickname: 'Kid',
      ageGroup: '7-9',
      dailyLimitMinutes: 60,
      usedSeconds: 0,
      remainingSeconds: 3_600,
      limitReached: false,
    });
    const handlers = new Map<string, (...args: any[]) => any>();
    const socket = {
      user: { id: 'user-1' },
      on: vi.fn((event: string, handler: (...args: any[]) => any) => handlers.set(event, handler)),
      emit: vi.fn(),
    };
    const join = vi.spyOn(liveStreamService, 'joinStream');

    registerLiveStreamSocketHandlers({ to: vi.fn() }, socket);
    await handlers.get(SOCKET_EVENTS.LIVE_JOIN)?.({ streamId: 'stream-1' });

    expect(join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      'live:error',
      expect.objectContaining({ code: 'KIDS_FEATURE_DISABLED' }),
    );
  });
});
