import { stripHighlightMarks } from '@/lib/highlight';
import { DATA_GUARD_LINE, dataAttributes, escapeData } from '@/server/llm/prompt-guard';
import { isoDate, oneLine, SOURCE_KIND_LABELS } from '@/server/memory/labels';
import {
  type ContextTurn,
  PAGE_SIZE,
  type SearchPage,
  type SourceHit,
  type SourceInfo,
} from '@/server/search/types';
import type { FetchOutput, SearchOutput } from './output-schemas';

// Ce que les outils `search` et `fetch` rendent au client MCP : un texte pour l'assistant et un
// `structuredContent` pour le code. Tout ce qui vient de la mémoire (titres, extraits, noms, liens, texte des
// tours) est de la donnée captée, jamais une consigne : le texte la met entre balises, derrière la ligne de
// garde, et aucune donnée ne peut fermer sa balise ni en ouvrir une (échappement de prompt-guard.ts, que la
// réponse en tête et la discussion partagent). Les outils de l'agent de discussion (T11) reprennent ces blocs
// (`renderHit`, `renderTurn`, `sourceAttributes`) avec leur propre numérotation.

const originText = (origin: Record<string, string>): string => Object.values(origin).join(' · ');

export function sourceAttributes(source: SourceInfo, n?: number): string {
  return dataAttributes([
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

export function renderHit(hit: SourceHit, n: number): string {
  const passages = hit.passages.map(
    (passage) =>
      `<passage${dataAttributes([
        ['id', passage.passageId],
        ['date', isoDate(passage.ts)],
        ['auteur', passage.authorName],
      ])}>${escapeData(stripHighlightMarks(passage.snippet))}</passage>`,
  );
  return [`<source${sourceAttributes(hit, n)}>`, ...passages, '</source>'].join('\n');
}

const plural = (count: number, word: string): string => `${count} ${word}${count > 1 ? 's' : ''}`;

export function unknownPeopleLines(names: string[]): string[] {
  return names.map((name) => `No one on the team is called "${escapeData(oneLine(name))}".`);
}

export function renderSearch(page: SearchPage, pageNumber: number): string {
  const unknown = unknownPeopleLines(page.unknownPeople);
  if (page.hits.length === 0) return ['No results.', ...unknown].join('\n');
  const first = (pageNumber - 1) * PAGE_SIZE;
  const more = first + page.hits.length < page.totalSources;
  return [
    DATA_GUARD_LINE,
    `${plural(page.hits.length, 'source')} of ${page.totalSources} (page ${pageNumber}).${
      more ? ` For more, ask for page ${pageNumber + 1}.` : ''
    }`,
    ...unknown,
    ...page.hits.map((hit, index) => renderHit(hit, first + index + 1)),
  ].join('\n');
}

const iso = (date: Date): string => date.toISOString();

// Le titre que ChatGPT affiche : celui de la source, à défaut le nom de l'outil.
function displayTitle(source: SourceInfo): string {
  return source.title !== null && oneLine(source.title) !== ''
    ? source.title
    : SOURCE_KIND_LABELS[source.kind];
}

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

export function searchStructured(page: SearchPage, pageNumber: number): SearchOutput {
  return {
    results: page.hits.map((hit) => ({
      id: hit.sourceId,
      title: displayTitle(hit),
      url: hit.url ?? '',
    })),
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

export function renderTurn(turn: ContextTurn): string {
  return `<tour${dataAttributes([
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
          'Reading cut off: the rest of this source is not returned. Search for a specific passage with search.',
        ]
      : []),
  ].join('\n');
}

// Les tours bout à bout, chacun précédé de son auteur et de sa date. C'est le champ `text` du contrat de ChatGPT,
// de la donnée brute : la ligne de garde et les balises de `content` ne l'accompagnent pas (comme pour `turns`).
function joinedText(turns: ContextTurn[]): string {
  return turns
    .map((turn) => `${turn.authorName ?? turn.role} (${isoDate(turn.ts)}): ${turn.text}`)
    .join('\n\n');
}

function fetchMetadata(fetched: Fetched): Record<string, string> {
  const { source } = fetched;
  const origin = originText(source.origin);
  return {
    outil: SOURCE_KIND_LABELS[source.kind],
    nature: source.nature,
    date: isoDate(source.lastTs),
    ...(origin === '' ? {} : { origine: origin }),
    ...(fetched.truncated ? { coupee: 'oui' } : {}),
  };
}

export function fetchStructured(fetched: Fetched): FetchOutput {
  return {
    id: fetched.source.sourceId,
    title: displayTitle(fetched.source),
    text: joinedText(fetched.turns),
    url: fetched.source.url ?? '',
    metadata: fetchMetadata(fetched),
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
