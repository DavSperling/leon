import { describe, expect, it } from 'vitest';
import {
  ANSWER_NOT_ENOUGH,
  ANSWER_PATH,
  answerUrl,
  createAnswerEventReader,
  parseAnswerEvent,
} from './answer-events';

describe('contrat de la réponse en tête', () => {
  it('sert la route de C8 et la phrase exacte du « pas assez »', () => {
    expect(ANSWER_PATH).toBe('/api/v1/recherche/reponse');
    expect(ANSWER_NOT_ENOUGH).toBe('Les résultats ne suffisent pas pour répondre.');
  });

  it('met la requête dans l’adresse, encodée', () => {
    expect(answerUrl('contrat & "OVH"')).toBe('/api/v1/recherche/reponse?q=contrat+%26+%22OVH%22');
  });
});

describe('parseAnswerEvent', () => {
  it('lit les trois évènements', () => {
    expect(parseAnswerEvent('{"type":"texte","delta":"Le contrat"}')).toEqual({
      type: 'texte',
      delta: 'Le contrat',
    });
    expect(parseAnswerEvent('{"type":"fin"}')).toEqual({ type: 'fin' });
    expect(parseAnswerEvent('{"type":"indisponible"}')).toEqual({ type: 'indisponible' });
  });

  it('refuse ce qui n’est pas un évènement connu, sans lever', () => {
    expect(parseAnswerEvent('pas du json')).toBeNull();
    expect(parseAnswerEvent('null')).toBeNull();
    expect(parseAnswerEvent('{"type":"inconnu"}')).toBeNull();
    expect(parseAnswerEvent('{"type":"texte","delta":3}')).toBeNull();
  });

  it('ne garde que les champs du contrat', () => {
    expect(parseAnswerEvent('{"type":"texte","delta":"a","html":"<b>"}')).toEqual({
      type: 'texte',
      delta: 'a',
    });
  });
});

describe('createAnswerEventReader', () => {
  it('rend les évènements complets d’un morceau, dans l’ordre', () => {
    const reader = createAnswerEventReader();

    expect(reader.push('data: {"type":"texte","delta":"a"}\n\ndata: {"type":"fin"}\n\n')).toEqual([
      { type: 'texte', delta: 'a' },
      { type: 'fin' },
    ]);
  });

  it('garde un évènement coupé entre deux morceaux jusqu’à sa fin', () => {
    const reader = createAnswerEventReader();

    expect(reader.push('data: {"type":"tex')).toEqual([]);
    expect(reader.push('te","delta":"b"}\n')).toEqual([]);
    expect(reader.push('\n')).toEqual([{ type: 'texte', delta: 'b' }]);
  });

  it('accepte les fins de ligne CRLF et ignore les commentaires et les champs inconnus', () => {
    const reader = createAnswerEventReader();

    expect(
      reader.push(': maintien\r\n\r\nevent: x\r\nid: 1\r\ndata: {"type":"fin"}\r\n\r\n'),
    ).toEqual([{ type: 'fin' }]);
  });

  it('écarte un évènement illisible sans perdre les suivants', () => {
    const reader = createAnswerEventReader();

    expect(reader.push('data: {cassé\n\ndata: {"type":"indisponible"}\n\n')).toEqual([
      { type: 'indisponible' },
    ]);
  });
});
