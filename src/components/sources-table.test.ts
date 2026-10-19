import { describe, expect, it } from 'vitest';
import { channelLine, failureMessage, pipelineStatus } from './sources-table';

const NOW = new Date('2026-10-13T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const channel = (lastCaptureAt: Date | null) => ({
  kind: 'claude_ai' as const,
  kindLabel: 'claude.ai',
  lastCaptureAt,
});

describe('channelLine', () => {
  it('dit la dernière capture, sans alerte, dans les dernières 24 h', () => {
    expect(channelLine(channel(ago(4 * MINUTE)), NOW)).toEqual({
      text: 'claude.ai : dernière capture il y a 4 min',
      late: false,
    });
  });

  it('passe en retard au-delà de 24 h et compte les jours', () => {
    expect(channelLine(channel(ago(3 * 24 * HOUR + HOUR)), NOW)).toEqual({
      text: 'claude.ai : aucune capture depuis 3 j',
      late: true,
    });
    expect(channelLine(channel(ago(25 * HOUR)), NOW)).toEqual({
      text: 'claude.ai : aucune capture depuis 1 j',
      late: true,
    });
  });

  it("n'alerte pas un canal qui n'a jamais capté", () => {
    expect(channelLine(channel(null), NOW)).toEqual({
      text: 'claude.ai : aucune capture',
      late: false,
    });
  });
});

describe('pipelineStatus', () => {
  const run = (status: 'queued' | 'running' | 'done' | 'failed') => ({
    status,
    step: 'index' as const,
    updatedAt: NOW,
  });

  it.each([
    ['queued', 'running'],
    ['running', 'running'],
    ['done', 'done'],
    ['failed', 'failed'],
  ] as const)("range l'état %s sous le badge %s", (status, badge) => {
    expect(pipelineStatus(run(status))).toBe(badge);
  });

  it("n'a pas de badge sans exécution", () => {
    expect(pipelineStatus(null)).toBeNull();
  });
});

describe('failureMessage', () => {
  it('dit que l’indexation a échoué, sans détail technique', () => {
    expect(failureMessage()).toBe('Échec de l’indexation.');
  });
});
