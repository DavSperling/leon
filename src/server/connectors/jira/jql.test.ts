import { describe, expect, it } from 'vitest';
import { updatedSinceJql } from './jql';

// Jira lit la date de la requête dans le fuseau du compte, à la minute.

describe('updatedSinceJql', () => {
  it('écrit la date dans le fuseau du compte, été comme hiver', () => {
    const summer = new Date('2026-09-15T00:00:00Z');
    const winter = new Date('2026-12-15T10:20:30.456Z');

    expect(updatedSinceJql(summer, 'Europe/Paris')).toBe(
      'updated >= "2026-09-15 02:00" ORDER BY updated ASC',
    );
    expect(updatedSinceJql(winter, 'Europe/Paris')).toBe(
      'updated >= "2026-12-15 11:20" ORDER BY updated ASC',
    );
  });

  it('suit les fuseaux à l’ouest et à l’est de Greenwich', () => {
    const instant = new Date('2026-10-15T10:30:12Z');

    expect(updatedSinceJql(instant, 'America/New_York')).toContain('"2026-10-15 06:30"');
    expect(updatedSinceJql(instant, 'Pacific/Auckland')).toContain('"2026-10-15 23:30"');
    expect(updatedSinceJql(instant, 'UTC')).toContain('"2026-10-15 10:30"');
  });

  it('écrit minuit 00:00 et jamais 24:00', () => {
    const instant = new Date('2026-10-15T22:00:00Z');

    expect(updatedSinceJql(instant, 'Europe/Paris')).toContain('"2026-10-16 00:00"');
  });

  it('recule de 12 heures, en UTC, quand le fuseau est inconnu ou absent', () => {
    const instant = new Date('2026-10-15T10:30:00Z');

    // Le fuseau le plus à l'ouest est UTC-12 : la date lue ne peut pas dépasser l'instant voulu.
    expect(updatedSinceJql(instant, 'Mars/Phobos')).toContain('"2026-10-14 22:30"');
    expect(updatedSinceJql(instant, undefined)).toContain('"2026-10-14 22:30"');
  });
});
