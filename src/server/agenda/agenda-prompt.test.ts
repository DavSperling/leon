import { describe, expect, it } from 'vitest';
import { type AgendaMail, buildAgendaPrompt, parseAgendaAnswer } from './agenda-prompt';

const mails: AgendaMail[] = [
  { sourceId: 'a', title: 'Invitation', author: null, at: '2026-11-14T09:00', text: '…' },
  { sourceId: 'b', title: 'Entretien', author: null, at: '2026-11-15T09:00', text: '…' },
];
const period = { first: '2026-11-16', last: '2026-11-29' };

describe('buildAgendaPrompt : la langue des titres', () => {
  const MAIL = '- titre : quelques mots, dans la langue du mail. avec : ';
  const titleRule = (system: string) =>
    system.split('\n').filter((line) => line.startsWith('- titre : '));

  it('sans langue choisie pour son compte, rien ne change : la langue du mail', () => {
    const prompt = buildAgendaPrompt(mails, period);

    expect(buildAgendaPrompt(mails, period, null)).toEqual(prompt);
    expect(prompt.system).toContain(MAIL);
  });

  it('la langue choisie pour son compte l’emporte sur celle du mail', () => {
    const without = buildAgendaPrompt(mails, period);
    const french = buildAgendaPrompt(mails, period, 'fr');

    expect(titleRule(french.system)).toEqual([
      "- titre : quelques mots, en français : c'est la langue de son compte, même quand le mail est dans une autre (un nom propre reste tel quel). avec : les noms des autres personnes, jamais d'adresse e-mail.",
    ]);
    expect(titleRule(buildAgendaPrompt(mails, period, 'en').system)[0]).toContain(
      "- titre : quelques mots, en anglais : c'est la langue de son compte, ",
    );
    // Cette seule règle change : ni le message, ni la forme de la réponse, dont les clés restent celles qu'on lit.
    expect(french.messages).toEqual(without.messages);
    expect(french.system.replace(titleRule(french.system)[0] ?? '', '')).toBe(
      without.system.replace(titleRule(without.system)[0] ?? '', ''),
    );
  });
});

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
