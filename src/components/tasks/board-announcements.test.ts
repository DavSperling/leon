import { describe, expect, it } from 'vitest';
import { boardAnnouncements } from './board-announcements';

const COLUMNS = { backlog: ['t1', 't2'], started: ['t3'] };
const NAMES = {
  card: (id: string) => ({ t1: 'LEO-1', t2: 'LEO-2', t3: 'LEO-3' })[id] ?? '',
  column: (key: string) => ({ backlog: 'Backlog', started: 'En cours' })[key] ?? '',
};
const announce = boardAnnouncements(COLUMNS, NAMES);
const active = { id: 't1' } as never;

describe('boardAnnouncements', () => {
  it('dit quelle carte est saisie et dans quelle colonne', () => {
    expect(announce.onDragStart({ active })).toBe(
      'Carte LEO-1 saisie dans la colonne « Backlog ».',
    );
  });

  it('dit la colonne survolée, qu’on survole une carte ou la colonne elle-même', () => {
    expect(announce.onDragOver({ active, over: { id: 't3' } as never })).toBe(
      'Carte LEO-1 dans la colonne « En cours ».',
    );
    expect(announce.onDragOver({ active, over: { id: 'started' } as never })).toBe(
      'Carte LEO-1 dans la colonne « En cours ».',
    );
  });

  it('dit quand la carte est hors de toute colonne', () => {
    expect(announce.onDragOver({ active, over: null })).toBe("Carte LEO-1 hors d'une colonne.");
  });

  it('dit où la carte est déposée, ou qu’elle est remise à sa place', () => {
    expect(announce.onDragEnd({ active, over: { id: 'started' } as never })).toBe(
      'Carte LEO-1 déposée dans la colonne « En cours ».',
    );
    expect(announce.onDragEnd({ active, over: null })).toBe('Carte LEO-1 remise à sa place.');
  });

  it('annonce l’annulation', () => {
    expect(announce.onDragCancel({ active, over: null })).toBe(
      'Déplacement annulé. Carte LEO-1 remise à sa place.',
    );
  });
});
