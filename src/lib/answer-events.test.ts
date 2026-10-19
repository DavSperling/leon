import { describe, expect, it } from 'vitest';
import {
  ANSWER_NOT_ENOUGH,
  ANSWER_PATH,
  ANSWER_RESULTS_PARAM,
  answerUrl,
  createAnswerEventReader,
  parseAnswerEvent,
  parseAnswerResults,
} from './answer-events';
import { PAGE_SIZE } from './search-limits';

const ID_A = '0b6c1f0e-8a52-4c0e-9d8e-3f1b2a4c5d6e';
const ID_B = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ids = (count: number) =>
  Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  );

describe('contrat de la réponse en tête', () => {
  it('sert la route de C8 et la phrase exacte du « pas assez »', () => {
    expect(ANSWER_PATH).toBe('/api/v1/recherche/reponse');
    expect(ANSWER_NOT_ENOUGH).toBe('Les résultats ne suffisent pas pour répondre.');
  });

  it('met dans l’adresse la requête, encodée, et les résultats de la page dans leur ordre', () => {
    expect(ANSWER_RESULTS_PARAM).toBe('r');
    expect(answerUrl('contrat & "OVH"', [ID_B, ID_A])).toBe(
      `/api/v1/recherche/reponse?q=contrat+%26+%22OVH%22&r=${ID_B}%2C${ID_A}`,
    );
  });
});

// [n] de la réponse renvoie au n-ième résultat affiché : la page donne à la route la liste de ses résultats.
describe('parseAnswerResults', () => {
  it('rend les identifiants dans l’ordre de la page', () => {
    expect(parseAnswerResults(`${ID_B},${ID_A}`)).toEqual([ID_B, ID_A]);
    // Aller-retour par l'adresse que l'encadré appelle.
    const sent = new URL(answerUrl('x', [ID_A, ID_B]), 'https://leon.test').searchParams;
    expect(parseAnswerResults(sent.get(ANSWER_RESULTS_PARAM) ?? undefined)).toEqual([ID_A, ID_B]);
    // En minuscules, comme les rend la base : la route les compare aux résultats de sa recherche.
    expect(parseAnswerResults(ID_A.toUpperCase())).toEqual([ID_A]);
  });

  it(`accepte ${PAGE_SIZE} résultats, la taille d’une page, et pas plus`, () => {
    expect(parseAnswerResults(ids(PAGE_SIZE).join(','))).toEqual(ids(PAGE_SIZE));
    expect(parseAnswerResults(ids(PAGE_SIZE + 1).join(','))).toBeNull();
  });

  it('refuse une liste absente, vide, mal écrite ou qui répète un résultat', () => {
    expect(parseAnswerResults(undefined)).toBeNull();
    expect(parseAnswerResults('')).toBeNull();
    expect(parseAnswerResults(`${ID_A},`)).toBeNull();
    expect(parseAnswerResults(`${ID_A},pas-un-identifiant`)).toBeNull();
    expect(parseAnswerResults(`${ID_A}' or 1=1`)).toBeNull();
    expect(parseAnswerResults(`${ID_A},${ID_A}`)).toBeNull();
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
