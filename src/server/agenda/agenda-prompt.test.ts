import { describe, expect, it } from 'vitest';
import { type AgendaMail, parseAgendaAnswer } from './agenda-prompt';

const mails: AgendaMail[] = [
  { sourceId: 'a', title: 'Invitation', author: null, at: '2026-11-14T09:00', text: '…' },
  { sourceId: 'b', title: 'Entretien', author: null, at: '2026-11-15T09:00', text: '…' },
];
const period = { first: '2026-11-16', last: '2026-11-29' };

describe('parseAgendaAnswer', () => {
  it('lit une liste mise en forme dans un bloc de code, et un objet qui en enveloppe d’autres', () => {
    const answer = [
      'Voici les rendez-vous :',
      '```json',
      '[',
      '  {',
      '    "n": "1",',
      '    "titre": "Point {projet}",',
      '    "debut": "2026-11-18 14:00:00"',
      '  }',
      ']',
      '```',
      '{"rendezVous": [{"n": 2, "titre": "Entretien", "debut": "2026-11-19T08:30:00Z", "fin": null}]}',
    ].join('\n');
    expect(parseAgendaAnswer(answer, mails, period)).toEqual([
      { titre: 'Point {projet}', debut: '2026-11-18T14:00', sourceId: 'a' },
      { titre: 'Entretien', debut: '2026-11-19T09:30', sourceId: 'b' },
    ]);
  });

  it('écarte une heure illisible, un mail inconnu et un doublon', () => {
    const answer = [
      '{"n": 1, "titre": "A", "debut": "jeudi 14 h"}',
      '{"n": 7, "titre": "B", "debut": "2026-11-18"}',
      '{"n": 2, "titre": "C", "debut": "2026-11-18", "avec": "Noa"}',
      '{"n": 2, "titre": "c", "debut": "2026-11-18"}',
    ].join('\n');
    expect(parseAgendaAnswer(answer, mails, period)).toEqual([
      { titre: 'C', debut: '2026-11-18', avec: 'Noa', sourceId: 'b' },
    ]);
  });
});
