import { describe, expect, it } from 'vitest';
import {
  createDiscussionEventReader,
  DISCUSSION_EMPTY,
  DISCUSSION_LIMIT_NOTE,
  DISCUSSION_REFUSAL,
  discussionMessagesUrl,
  finalReplyText,
  parseDiscussionEvent,
} from './discussion-events';

const ID = '0b6c1f0e-8a52-4c0e-9d8e-3f1b2a4c5d6e';
const CITATION = {
  n: 2,
  sourceId: ID,
  passageId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  title: 'Call ACME',
  url: 'https://fathom.video/calls/1',
};

describe('contrat de la discussion', () => {
  it('sert la route de C8', () => {
    expect(discussionMessagesUrl(ID)).toBe(`/api/v1/discussions/${ID}/messages`);
  });

  it('encode un identifiant qui ne serait pas un uuid', () => {
    expect(discussionMessagesUrl('../a?b')).toBe('/api/v1/discussions/..%2Fa%3Fb/messages');
  });
});

describe('parseDiscussionEvent', () => {
  it('lit les cinq évènements', () => {
    expect(parseDiscussionEvent('{"type":"texte","delta":"Le contrat"}')).toEqual({
      type: 'texte',
      delta: 'Le contrat',
    });
    expect(parseDiscussionEvent('{"type":"outil","name":"chercher"}')).toEqual({
      type: 'outil',
      name: 'chercher',
    });
    expect(parseDiscussionEvent(JSON.stringify({ type: 'citations', items: [CITATION] }))).toEqual({
      type: 'citations',
      items: [CITATION],
    });
    expect(parseDiscussionEvent('{"type":"fin","reason":"limite"}')).toEqual({
      type: 'fin',
      reason: 'limite',
    });
    expect(parseDiscussionEvent('{"type":"indisponible"}')).toEqual({ type: 'indisponible' });
  });

  it('refuse ce qui n’est pas un évènement connu, sans lever', () => {
    expect(parseDiscussionEvent('pas du json')).toBeNull();
    expect(parseDiscussionEvent('null')).toBeNull();
    expect(parseDiscussionEvent('{"type":"inconnu"}')).toBeNull();
    expect(parseDiscussionEvent('{"type":"texte","delta":3}')).toBeNull();
    expect(parseDiscussionEvent('{"type":"outil"}')).toBeNull();
    expect(parseDiscussionEvent('{"type":"fin","reason":"autre"}')).toBeNull();
    expect(parseDiscussionEvent('{"type":"citations","items":"x"}')).toBeNull();
  });

  it('écarte une citation mal formée et ne garde que les champs du contrat', () => {
    const items = [
      { ...CITATION, html: '<b>' },
      { ...CITATION, n: 0 },
      { ...CITATION, n: 1.5 },
      { ...CITATION, sourceId: 3 },
      { ...CITATION, title: null, url: null },
      'x',
    ];

    expect(parseDiscussionEvent(JSON.stringify({ type: 'citations', items }))).toEqual({
      type: 'citations',
      items: [CITATION, { ...CITATION, title: null, url: null }],
    });
  });
});

describe('createDiscussionEventReader', () => {
  it('rassemble un évènement coupé entre deux morceaux', () => {
    const reader = createDiscussionEventReader();

    expect(reader.push('data: {"type":"outil","na')).toEqual([]);
    expect(reader.push('me":"lire"}\n\ndata: {"type":"fin","reason":"fini"}\n\n')).toEqual([
      { type: 'outil', name: 'lire' },
      { type: 'fin', reason: 'fini' },
    ]);
  });
});

// Le texte gardé et le texte affiché après la fin du flux : le serveur et la page appliquent la même règle.
describe('finalReplyText', () => {
  it('garde la réponse telle quelle quand le modèle a fini', () => {
    expect(finalReplyText('  La clause est acceptée [1].  ', 'fini')).toBe(
      'La clause est acceptée [1].',
    );
  });

  it('dit qu’il n’y a rien à répondre plutôt que de garder un message vide', () => {
    expect(finalReplyText(' ', 'fini')).toBe(DISCUSSION_EMPTY);
  });

  it('ajoute la note de limite au texte déjà écrit', () => {
    expect(finalReplyText('Début [1]', 'limite')).toBe(`Début [1]\n\n${DISCUSSION_LIMIT_NOTE}`);
    expect(finalReplyText('', 'limite')).toBe(DISCUSSION_LIMIT_NOTE);
  });

  it('remplace tout texte partiel par la phrase de refus', () => {
    expect(finalReplyText('Voici les mails', 'refus')).toBe(DISCUSSION_REFUSAL);
  });
});
