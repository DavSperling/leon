import { stripHighlightMarks } from '@/lib/highlight';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import { isoDate, oneLine, SOURCE_KIND_LABELS } from '@/server/memory/labels';
import {
  type ContextTurn,
  PAGE_SIZE,
  type SearchPage,
  type SourceHit,
  type SourceInfo,
} from '@/server/search/types';

// Ce que les outils `search` et `fetch` rendent au client MCP : un texte pour l'assistant et un
// `structuredContent` pour le code. Tout ce qui vient de la mémoire (titres, extraits, noms, liens, texte des
// tours) est de la donnée captée, jamais une consigne : le texte la met entre balises, derrière la ligne de
// garde, et aucune donnée ne peut fermer sa balise ni en ouvrir une (`<` devient `&lt;`).

export function escapeData(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

// Dans un attribut : sur une seule ligne, guillemets neutralisés.
export function escapeAttribute(text: string): string {
  return escapeData(oneLine(text)).replace(/"/g, '&quot;');
}

type Attributes = Array<[name: string, value: string | null | undefined]>;

// Les attributs sans valeur (nulle ou vide) sont omis.
function attributes(list: Attributes): string {
  return list
    .filter((entry): entry is [string, string] => entry[1] != null && oneLine(entry[1]) !== '')
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
}

const originText = (origin: Record<string, string>): string => Object.values(origin).join(' · ');

function sourceAttributes(source: SourceInfo, n?: number): string {
  return attributes([
    ['n', n === undefined ? null : String(n)],
    ['id', source.sourceId],
    ['outil', SOURCE_KIND_LABELS[source.kind]],
    ['nature', source.nature],
    ['titre', source.title],
    ['date', isoDate(source.lastTs)],
    ['origine', originText(source.origin)],
    ['url', source.url],
  ]);
}

function renderHit(hit: SourceHit, n: number): string {
  const passages = hit.passages.map(
    (passage) =>
      `<passage${attributes([
        ['id', passage.passageId],
        ['date', isoDate(passage.ts)],
        ['auteur', passage.authorName],
      ])}>${escapeData(stripHighlightMarks(passage.snippet))}</passage>`,
  );
  return [`<source${sourceAttributes(hit, n)}>`, ...passages, '</source>'].join('\n');
}

const plural = (count: number, word: string): string => `${count} ${word}${count > 1 ? 's' : ''}`;

function unknownPeopleLines(names: string[]): string[] {
  return names.map(
    (name) => `Personne ne s'appelle « ${escapeData(oneLine(name))} » dans l'équipe.`,
  );
}

export function renderSearch(page: SearchPage, pageNumber: number): string {
  const unknown = unknownPeopleLines(page.unknownPeople);
  if (page.hits.length === 0) return ['Aucun résultat.', ...unknown].join('\n');
  const first = (pageNumber - 1) * PAGE_SIZE;
  const more = first + page.hits.length < page.totalSources;
  return [
    DATA_GUARD_LINE,
    `${plural(page.hits.length, 'source')} sur ${page.totalSources} (page ${pageNumber}).${
      more ? ` Pour la suite, demande la page ${pageNumber + 1}.` : ''
    }`,
    ...unknown,
    ...page.hits.map((hit, index) => renderHit(hit, first + index + 1)),
  ].join('\n');
}

const iso = (date: Date): string => date.toISOString();

function structuredSource(source: SourceInfo) {
  return {
    sourceId: source.sourceId,
    kind: source.kind,
    kindLabel: SOURCE_KIND_LABELS[source.kind],
    nature: source.nature,
    title: source.title,
    url: source.url,
    origin: source.origin,
    lastTs: iso(source.lastTs),
  };
}

export function searchStructured(page: SearchPage, pageNumber: number) {
  return {
    mode: page.mode,
    page: pageNumber,
    totalSources: page.totalSources,
    unknownPeople: page.unknownPeople,
    hits: page.hits.map((hit) => ({
      ...structuredSource(hit),
      score: hit.score,
      passages: hit.passages.map((passage) => ({
        passageId: passage.passageId,
        turnId: passage.turnId,
        snippet: stripHighlightMarks(passage.snippet),
        ts: iso(passage.ts),
        authorName: passage.authorName,
      })),
    })),
  };
}

type Fetched = { source: SourceInfo; turns: ContextTurn[]; truncated: boolean };

function renderTurn(turn: ContextTurn): string {
  return `<tour${attributes([
    ['id', turn.turnId],
    ['role', turn.role],
    ['auteur', turn.authorName],
    ['date', iso(turn.ts)],
    ['trouve', turn.isHit ? 'oui' : null],
  ])}>${escapeData(turn.text)}</tour>`;
}

export function renderFetched(fetched: Fetched): string {
  return [
    DATA_GUARD_LINE,
    `<source${sourceAttributes(fetched.source)}>`,
    ...fetched.turns.map(renderTurn),
    '</source>',
    ...(fetched.truncated
      ? [
          "Lecture coupée : la suite de cette source n'est pas rendue, cherche un passage précis avec search.",
        ]
      : []),
  ].join('\n');
}

export function fetchStructured(fetched: Fetched) {
  return {
    source: structuredSource(fetched.source),
    truncated: fetched.truncated,
    turns: fetched.turns.map((turn) => ({
      turnId: turn.turnId,
      role: turn.role,
      authorName: turn.authorName,
      ts: iso(turn.ts),
      text: turn.text,
      isHit: turn.isHit,
    })),
  };
}
