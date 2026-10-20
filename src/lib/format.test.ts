import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatNumber, formatRelative } from './format';

const now = new Date('2026-10-13T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('formatDate', () => {
  it("écrit le jour, le mois abrégé et l'année", () => {
    expect(formatDate(new Date('2026-10-12T10:00:00Z'))).toBe('12 oct. 2026');
  });

  it('compte le jour à Paris, pas en UTC', () => {
    expect(formatDate(new Date('2026-10-12T23:30:00Z'))).toBe('13 oct. 2026');
  });
});

describe('formatDateTime', () => {
  it("ajoute l'heure de Paris", () => {
    expect(formatDateTime(new Date('2026-09-02T12:12:00Z'))).toBe('2 sept. 2026, 14:12');
  });
});

describe('formatRelative', () => {
  it("dit « à l'instant » sous une minute", () => {
    expect(formatRelative(ago(30_000), now)).toBe("à l'instant");
  });

  it('compte les minutes', () => {
    expect(formatRelative(ago(4 * MINUTE), now)).toBe('il y a 4 min');
  });

  it('compte les heures', () => {
    expect(formatRelative(ago(2 * HOUR), now)).toBe('il y a 2 h');
  });

  it('dit « hier » entre 24 et 48 heures', () => {
    expect(formatRelative(ago(30 * HOUR), now)).toBe('hier');
  });

  it('dit « hier » pour la veille en jour civil à Paris, pas pour l’avant-veille', () => {
    // 8 h à Paris ; 23 h 30 l'avant-veille, 32 h 30 plus tôt.
    const morning = new Date('2026-10-13T06:00:00Z');
    expect(formatRelative(new Date('2026-10-11T21:30:00Z'), morning)).toBe('11 oct. 2026');
    // 23 h à Paris ; 0 h 30 la veille, 46 h 30 plus tôt.
    const evening = new Date('2026-10-13T21:00:00Z');
    expect(formatRelative(new Date('2026-10-11T22:30:00Z'), evening)).toBe('hier');
  });

  it('donne la date au-delà', () => {
    expect(formatRelative(ago(72 * HOUR), now)).toBe('10 oct. 2026');
  });
});

describe('formatNumber', () => {
  it('sépare les milliers à la française', () => {
    expect(formatNumber(42_000)).toMatch(/^42\s000$/);
  });
});
