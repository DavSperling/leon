import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import fr from '../../../messages/fr.json';
import { CONTENT_EN, CONTENT_FR } from './content';
import { isFilterQuery } from './parts';

// Le typecheck vérifie la forme des tables anglaises ; les identifiants, les adresses et les outils, eux, doivent
// être les mêmes qu'en français : une équipe absente casserait /use-cases/<équipe> en anglais.
const ids = <T, K extends keyof T>(rows: readonly T[], key: K) => rows.map((row) => row[key]);

describe('le site en anglais', () => {
  it('a les mêmes équipes, démos, situations et étapes qu’en français', () => {
    expect(ids(CONTENT_EN.teams, 'slug')).toEqual(ids(CONTENT_FR.teams, 'slug'));
    expect(ids(CONTENT_EN.teams, 'tools')).toEqual(ids(CONTENT_FR.teams, 'tools'));
    expect(ids(CONTENT_EN.teams, 'icon')).toEqual(ids(CONTENT_FR.teams, 'icon'));
    expect(CONTENT_EN.teams.map((t) => t.demo.id)).toEqual(CONTENT_FR.teams.map((t) => t.demo.id));
    expect(ids(CONTENT_EN.demos, 'id')).toEqual(ids(CONTENT_FR.demos, 'id'));
    expect(CONTENT_EN.demos.map((d) => d.sources.map((s) => s.tool))).toEqual(
      CONTENT_FR.demos.map((d) => d.sources.map((s) => s.tool)),
    );
    expect(ids(CONTENT_EN.situations, 'id')).toEqual(ids(CONTENT_FR.situations, 'id'));
    expect(ids(CONTENT_EN.situations, 'team')).toEqual(ids(CONTENT_FR.situations, 'team'));
    expect(ids(CONTENT_EN.situations, 'tools')).toEqual(ids(CONTENT_FR.situations, 'tools'));
    expect(ids(CONTENT_EN.pillars, 'id')).toEqual(ids(CONTENT_FR.pillars, 'id'));
    expect(ids(CONTENT_EN.navLinks, 'href')).toEqual(ids(CONTENT_FR.navLinks, 'href'));
  });

  it('écrit ses requêtes en filtres comme en français, et ses renvois [n] vers des sources qui existent', () => {
    const queries = (c: typeof CONTENT_FR) =>
      c.teams.flatMap((t) => t.questions).concat(c.demos.map((d) => d.query));
    expect(queries(CONTENT_EN).map(isFilterQuery)).toEqual(queries(CONTENT_FR).map(isFilterQuery));
    for (const demo of CONTENT_EN.demos) {
      const refs = [...demo.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
      expect(Math.max(...refs), demo.id).toBe(demo.sources.length);
    }
  });
});

// Le MCP s'ouvre en collant son adresse dans l'assistant puis en l'autorisant dans Leon, plus par un jeton personnel.
describe('la FAQ du site et le MCP distant', () => {
  it.each([
    ['fr', CONTENT_FR, /adresse/, /autoris/, /jeton/i],
    ['en', CONTENT_EN, /address/, /authorize/, /token/i],
  ] as const)(
    'en %s, la réponse sur l’interrogation depuis un assistant dit adresse collée puis autorisation, pas un jeton',
    (_locale, content, address, authorize, token) => {
      const answer = content.faq.find((entry) => /MCP/.test(entry.a))?.a ?? '';
      expect(answer).toMatch(address);
      expect(answer).toMatch(authorize);
      expect(answer).not.toMatch(token);
    },
  );
});

// Décision 3 d'Amos du 12/11 (T52) : une conversation d'IA, une session et une note se lisent par leur auteur et, sur le
// site, par ses managers en remontant (0057). Les anciennes phrases qui les disaient à l'auteur seul ne reviennent pas.
// Les discussions avec Leon, elles, restent privées.
const AUTHOR_ONLY = [
  /private to (?:its|their|the) author/i,
  /visible only to (?:its|their) author/i,
  /AI conversations[^.]*(?:private to you|visible only to them|with their author)/i,
  /Only he can see it/,
  /indexes them, privately/,
  /No one else sees it/,
  /privées à leur auteur/,
  /conversations d’IA (?:à vous seul|restent à vous)/,
  /(?:conversations d’IA|notes)[^.]*ne sont visibles que de/,
  /n’est visible que de lui/,
  /pour la personne qui l’a écrit\./,
  /pour vous seul, avec le reste/,
  /Vos conversations à vous/,
  /conversations d’IA et vos discussions restent privées/,
  /Personne d’autre ne le voit/,
  // Deuxième passe : le texte des boîtes mail, de Drive et de Slack, les documents « moi » et les promesses générales.
  /(?:stays?|is) private to whoever connect/i,
  /which stays private\./,
  /privés? à qui l(?:es|’a) branch/,
  /reste privé comme une conversation/,
  /stay with their owner\./,
  /restent à leur propriétaire\./,
  /emails, AI conversations, private documents/,
  /mails, conversations avec les IA, documents privés/,
  /^Private: not shared/,
  /^Privé : pas partagé/,
  /^Only me$/,
  /^Moi seul$/,
  /only be visible to their author, or/,
  /visibles que de leur auteur, ou/,
  /Private content never/,
  /ce qui est privé à son auteur ne remonte/,
  /Ce qui est à vous reste à vous/,
  /private AI conversations/,
  /conversations privées, clés/,
  /conversation d’une seule personne/,
  /shared with the team or private to you/,
  /ou de vous seul\./,
  /save a private note/,
  /garder une note, privée/,
  /stays private in Leon/,
  /reste privée dans Leon/,
  /what stays yours/,
  /ce qui reste à vous/,
  /Ce qui est privé le reste/,
  /sauf une boîte Outlook ;/,
  // Troisième passe : les phrases de la refonte « Papier » (#174), revenues par la fusion de main.
  /AI conversations stay yours/,
  /^À vous seul$/,
  /^Yours only$/,
  /assistants d’IA, privées, pour vous seul/,
  /AI assistants, private to you/,
  /^Privé, pour vous$/,
  /^Private to you$/,
  /Vous seul les? retrouvez\. Ils? (?:n’est|ne sont) pas partagés? avec l’équipe/,
  /Only you can find (?:it|them)\. (?:It isn’t|They aren’t) shared with the team/,
  /Seuls les membres de \{group\}/,
  /Only the members of \{group\}/,
  /moi \{pour vous\}/,
  /moi \{for you\}/,
  /^Seulement \{name\}$/,
  /^Only \{name\}$/,
  /garder des notes privées/,
  /keep private notes/,
  /conversations d’IA et notes lues par leur auteur et ses managers$/,
  /AI conversations and notes read by their author and their managers$/,
  /^Ce que lit une connexion est visible de toute l’équipe/,
  /^Content from a connection is shared with the whole team,/,
  /connexion est visible de toute l’équipe, sauf/,
  /connection’s content is shared with the whole team, except/,
  /^Ce que lisent les outils branchés est partagé/,
  /^Content from shared connections is visible to the team, except/,
  // La fiche d'une personne (Équipe) ne montre ni ses conversations d'IA, ni ses sessions, ni ses notes : seule la
  // recherche les lit.
  /conversations avec les IA[^.;]*, ici et dans la recherche/,
  /AI conversations[^.;]*, here and in search/,
];
const leaves = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : value !== null && typeof value === 'object'
      ? Object.values(value).flatMap(leaves)
      : [];

describe('qui lit les conversations d’IA et les notes, sur le site', () => {
  it.each([
    ['en', [CONTENT_EN, en]],
    ['fr', [CONTENT_FR, fr]],
  ] as const)('en %s, aucune phrase ne les dit lues de leur auteur seul', (_locale, sources) => {
    const texts = sources.flatMap(leaves);

    expect(texts.filter((text) => AUTHOR_ONLY.some((pattern) => pattern.test(text)))).toEqual([]);
  });

  // « Vous seul » reste vrai pour les discussions avec Leon (discussions.onlyYou) : ces étiquettes-là, qui parlent de ce
  // que relève une source, un document ou une connexion, se gardent par leur clé et non par un motif sur le texte.
  const READ_BY_MANAGERS = [
    'connections.onlyYou',
    'documents.captionMe',
    'discussionView.visibility.moi',
    'shell.onlyYou',
    'onboarding.tools.private',
  ];
  it.each([
    ['en', en, /^Only you$/],
    ['fr', fr, /^Vous seul$/],
  ] as const)(
    'en %s, l’étiquette d’une source qu’on ne partage pas ne dit pas « vous seul »',
    (_locale, messages, old) => {
      for (const key of READ_BY_MANAGERS) {
        const value = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages);
        expect(value, key).toEqual(expect.any(String));
        expect(value, key).not.toMatch(old);
      }
    },
  );
});
