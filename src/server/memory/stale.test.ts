import { describe, expect, it } from 'vitest';
import { STALE_AFTER_MS, staleChannels } from './stale';

const now = new Date('2026-10-22T12:00:00Z');
const channel = (lastCaptureAt: Date | null) => ({
  kind: 'claude_code' as const,
  kindLabel: 'Claude Code',
  lastCaptureAt,
});

describe('staleChannels', () => {
  it('ne signale pas un canal capturé il y a moins de 24 h', () => {
    expect(staleChannels([channel(new Date(now.getTime() - 60_000))], now)).toEqual([]);
  });

  it('signale un canal dont la dernière capture date de plus de 24 h', () => {
    const old = channel(new Date(now.getTime() - STALE_AFTER_MS - 1));
    expect(staleChannels([old], now)).toEqual([old]);
  });

  it('ne signale pas un canal jamais utilisé', () => {
    expect(staleChannels([channel(null)], now)).toEqual([]);
  });
});
