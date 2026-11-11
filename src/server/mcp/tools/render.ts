import { stripHighlightMarks } from '@/lib/highlight';
import { GITHUB_FACT_KEYS } from '@/server/connectors/github/map';
import { DATA_GUARD_LINE, dataAttributes, escapeData } from '@/server/llm/prompt-guard';
import { isoDate, oneLine, SOURCE_KIND_LABELS } from '@/server/memory/labels';
import type { Lesson } from '@/server/memory/lessons';
import {
  type ContextTurn,
  PAGE_SIZE,
  type SearchPage,
  type SourceHit,
  type SourceInfo,
} from '@/server/search/types';
import type { Bounded, Dossier, ThreadRead, VersionsRead } from '@/server/sessions/thread-read';
import type {
  FetchOutput,
  LessonsOutput,
  SearchOutput,
  ThreadOutput,
  ThreadsOutput,
  VersionsOutput,
} from './output-schemas';

// Ce que les outils `search` et `fetch` rendent au client MCP : un texte pour l'assistant et un
// `structuredContent` pour le code. Tout ce qui vient de la mémoire (titres, extraits, noms, liens, texte des
// tours) est de la donnée captée, jamais une consigne : le texte la met entre balises, derrière la ligne de
// garde, et aucune donnée ne peut fermer sa balise ni en ouvrir une (échappement de prompt-guard.ts, que la
// réponse en tête et la discussion partagent). Les outils de l'agent de discussion (T11) reprennent ces blocs
// (`renderHit`, `renderTurn`, `sourceAttributes`) avec leur propre numérotation. Les lectures des fils (T44, T45,
// T54) rendent ici, sous la même garde, le texte des routes de lecture et des outils `threads`, `thread` et
// `versions` : jamais un titre de PR (D25).

// L'état d'un ticket ou d'une PR (github/map.ts) se lit « clé : valeur », dans son ordre : `merged · equipe` ne dirait
// pas ce qu'est chaque valeur. Les autres clés (repo, board, list…) gardent leur valeur seule, en tête.
const FACT_KEYS: readonly string[] = GITHUB_FACT_KEYS;
const originText = (origin: Record<string, string>): string =>
  [
    ...Object.entries(origin)
      .filter(([key]) => !FACT_KEYS.includes(key))
      .map(([, value]) => value),
    ...FACT_KEYS.flatMap((key) => (origin[key] === undefined ? [] : [`${key} : ${origin[key]}`])),
  ].join(' · ');

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

const prKey = (pr: { repo: string; numero: number }) => `${pr.repo}#${pr.numero}`;

export function renderHit(hit: SourceHit, n: number): string {
  // Une session de code : son fil et ses PR, en clés (T45).
  const thread = dataAttributes([
    ['fil', hit.thread],
    ['prs', hit.prs?.map(prKey).join(', ')],
  ]);
  const passages = hit.passages.map(
    (passage) =>
      `<passage${dataAttributes([
        ['id', passage.passageId],
        ['date', isoDate(passage.ts)],
        ['auteur', passage.authorName],
      ])}>${escapeData(stripHighlightMarks(passage.snippet))}</passage>`,
  );
  return [`<source${sourceAttributes(hit, n)}${thread}>`, ...passages, '</source>'].join('\n');
}

const plural = (count: number, word: string): string => `${count} ${word}${count > 1 ? 's' : ''}`;

export function unknownPeopleLines(names: string[]): string[] {
  return names.map((name) => `No one on the team is called "${escapeData(oneLine(name))}".`);
}

// `pageHint` : faux pour une recherche sans pages (la route /chercher), qui n'invite pas à demander la suivante.
export function renderSearch(page: SearchPage, pageNumber: number, pageHint = true): string {
  const unknown = unknownPeopleLines(page.unknownPeople);
  if (page.hits.length === 0) return ['No results.', ...unknown].join('\n');
  const first = (pageNumber - 1) * PAGE_SIZE;
  const more = first + page.hits.length < page.totalSources;
  return [
    DATA_GUARD_LINE,
    pageHint
      ? `${plural(page.hits.length, 'source')} of ${page.totalSources} (page ${pageNumber}).${
          more ? ` For more, ask for page ${pageNumber + 1}.` : ''
        }`
      : `${plural(page.hits.length, 'source')} of ${page.totalSources}.`,
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
      ...(hit.thread === undefined ? {} : { thread: hit.thread }),
      ...(hit.prs === undefined ? {} : { prs: hit.prs }),
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

// Les textes fixes des lectures : un fil introuvable (d'un collègue, d'un autre projet, absorbé sans fil gardé) se dit
// comme un fil qui n'existe pas.
export const THREAD_NOT_FOUND = 'No thread found.';
export const LESSON_NOT_FOUND = 'No lesson found.';

const prText = (pr: ThreadRead['prs']['items'][number]) =>
  `${prKey(pr)}${pr.etat === null ? '' : ` ${pr.etat}`}`;
// Une liste coupée le dit (D27) : les éléments rendus sont les plus récents.
const cut = (list: Bounded<unknown>, word: string): string[] =>
  list.total > list.items.length
    ? [`Showing ${list.items.length} of ${list.total} ${word}, the most recent.`]
    : [];
const element = (name: string, attributes: Array<[string, string | null]>, text = '') =>
  text === ''
    ? `<${name}${dataAttributes(attributes)}/>`
    : `<${name}${dataAttributes(attributes)}>${escapeData(text)}</${name}>`;

// Le dossier (C9) : une ligne de clés par fil, et la première ligne de son état, échappée.
export function renderDossier(dossier: Dossier): string {
  if (dossier.fils.length === 0) return 'No threads on this project yet.';
  return [
    DATA_GUARD_LINE,
    `${plural(dossier.fils.length, 'thread')} of ${dossier.total}.`,
    ...dossier.fils.map((fil) =>
      element(
        'fil',
        [
          ['id', fil.id],
          ['titre', fil.titre],
          ['outils', fil.outils.map((kind) => SOURCE_KIND_LABELS[kind]).join(', ')],
          ['date', fil.derniereDate === null ? null : isoDate(fil.derniereDate)],
          ['prs', fil.prs.map(prText).join(', ')],
          // Une liste coupée le dit (D27) : les PR rendues sont les plus récentes.
          ['prs_total', fil.prsTotal > fil.prs.length ? String(fil.prsTotal) : null],
          ['liees', String(fil.liees)],
        ],
        fil.etatCourt,
      ),
    ),
  ].join('\n');
}

// Un fil (C9) : sa version quand l'état est elle, son état, puis ses sessions, PR, tickets et sources liées, en clés,
// chaque coupe signalée.
export function renderFil(read: ThreadRead): string {
  return [
    DATA_GUARD_LINE,
    `<fil${dataAttributes([
      ['id', read.id],
      ['titre', read.titre],
      ['version', read.version === null ? null : String(read.version.n)],
      ['date', read.version === null ? null : isoDate(read.version.creeLe)],
      ['par', read.version?.ecritPar],
    ])}>`,
    ...(read.etat === '' ? [] : ['<etat>', escapeData(read.etat), '</etat>']),
    ...cut(read.sessions, 'sessions'),
    ...read.sessions.items.map((one) =>
      element('session', [
        ['id', one.id],
        ['outil', SOURCE_KIND_LABELS[one.kind]],
        ['date', isoDate(one.date)],
      ]),
    ),
    ...cut(read.prs, 'pull requests'),
    ...read.prs.items.map((pr) =>
      element('pr', [
        ['depot', pr.repo],
        ['numero', String(pr.numero)],
        ['etat', pr.etat],
      ]),
    ),
    ...cut(read.tickets, 'tickets'),
    ...read.tickets.items.map((ticket) => element('ticket', [['id', ticket]])),
    ...cut(read.liees, 'linked sources'),
    ...read.liees.items.map((one) =>
      element('source', [
        ['id', one.id],
        ['outil', SOURCE_KIND_LABELS[one.kind]],
        ['titre', one.titre],
      ]),
    ),
    '</fil>',
  ].join('\n');
}

// L'historique d'un fil, d'une note ou d'une leçon (C12) : sans numéro, une ligne par version lisible avec sa première ligne ; avec un
// numéro, le texte de cette version. Rien ne propose de restaurer (D33).
export function renderVersions(read: VersionsRead): string {
  const [wrapper, noun] = read.lecon
    ? ['lecon', 'lesson']
    : read.note
      ? ['note', 'note']
      : ['fil', 'thread'];
  const versionAttributes = (one: VersionsRead['versions'][number]): Array<[string, string]> => [
    ['n', String(one.n)],
    ['date', isoDate(one.creeLe)],
    ['par', one.ecritPar],
    ['motif', one.motif],
  ];
  if (read.n !== null) {
    const [one] = read.versions;
    if (!one) return `Version ${read.n} of this ${noun} is not readable, or does not exist.`;
    return [
      DATA_GUARD_LINE,
      `<version${dataAttributes([
        [wrapper, read.id],
        ['titre', read.titre],
        ...versionAttributes(one),
      ])}>`,
      escapeData(one.texte),
      '</version>',
    ].join('\n');
  }
  if (read.versions.length === 0) return `No readable version of this ${noun}.`;
  return [
    DATA_GUARD_LINE,
    `<${wrapper}${dataAttributes([
      ['id', read.id],
      ['titre', read.titre],
    ])}>`,
    ...read.versions.map((one) => element('version', versionAttributes(one), one.texte)),
    `</${wrapper}>`,
    'To read one version, ask for it by its number.',
  ].join('\n');
}

// Les leçons acceptées (C13, D25, D37) : une ligne chacune, son texte échappé (le seul texte que Leon rend ici : celui
// qu'un humain a relu), avec son dépôt, sa version et sa date d'acceptation ; la fréquence quand le rêve l'a comptée.
export function renderLessons(lessons: Lesson[]): string {
  if (lessons.length === 0) return 'No lessons for this project yet.';
  return [
    DATA_GUARD_LINE,
    `${plural(lessons.length, 'lesson')}.`,
    ...lessons.map((lesson) =>
      element(
        'lecon',
        [
          ['id', lesson.id],
          ['depot', lesson.projet],
          ['version', String(lesson.n)],
          ['acceptee', isoDate(lesson.accepteeLe)],
          ['frequence', lesson.frequence > 0 ? String(lesson.frequence) : null],
        ],
        lesson.texte,
      ),
    ),
  ].join('\n');
}

// Le `structuredContent` des lectures des fils au MCP (C9, D25) : des clés seulement. L'état, la première ligne d'une
// version et le titre d'une source liée ne vont que dans le texte gardé.
const prKeys = (prs: Array<{ repo: string; numero: number }>) =>
  prs.map(({ repo, numero }) => ({ repo, numero }));

export function threadsStructured(dossier: Dossier): ThreadsOutput {
  return {
    total: dossier.total,
    threads: dossier.fils.map((fil) => ({
      id: fil.id,
      titre: fil.titre,
      date: fil.derniereDate === null ? null : iso(fil.derniereDate),
      prs: prKeys(fil.prs),
    })),
  };
}

export function threadStructured(read: ThreadRead): ThreadOutput {
  return {
    id: read.id,
    titre: read.titre,
    version: read.version === null ? null : { n: read.version.n, date: iso(read.version.creeLe) },
    sessions: read.sessions.items.map((one) => ({ id: one.id, date: iso(one.date) })),
    prs: prKeys(read.prs.items),
    liees: read.liees.items.map((one) => one.id),
  };
}

// Les leçons : des clés seulement (id, version, date) ; le texte n'est que dans `content`, derrière la ligne de garde.
export function lessonsStructured(lessons: Lesson[]): LessonsOutput {
  return {
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      version: lesson.n,
      date: iso(lesson.accepteeLe),
    })),
  };
}

export function versionsStructured(read: VersionsRead): VersionsOutput {
  return {
    id: read.id,
    titre: read.titre,
    versions: read.versions.map((one) => ({ n: one.n, date: iso(one.creeLe), par: one.ecritPar })),
  };
}

// `fetch` d'un id de fil (D35) : le contrat de ChatGPT, avec dans `text` le texte gardé de `thread`, ligne de garde en
// tête (décision d'Amos du 10/11). Un fil n'a pas de tour. Sa date : sa dernière session, à défaut sa version.
export function threadFetchStructured(read: ThreadRead): FetchOutput {
  const last = read.sessions.items[0]?.date ?? read.version?.creeLe;
  const label = SOURCE_KIND_LABELS.leon_fil;
  return {
    id: read.id,
    title: read.titre,
    text: renderFil(read),
    url: '',
    metadata: {
      outil: label,
      nature: 'fil_de_travail',
      ...(last === undefined ? {} : { date: isoDate(last) }),
    },
    source: {
      sourceId: read.id,
      kind: 'leon_fil',
      kindLabel: label,
      nature: 'fil_de_travail',
      title: read.titre,
      url: null,
      origin: {},
      lastTs: last === undefined ? '' : iso(last),
    },
    truncated: false,
    turns: [],
  };
}
