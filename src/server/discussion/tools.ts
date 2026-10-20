import { z } from 'zod';
import { ITEM_NATURES } from '@/capture/turn';
import type { DiscussionCitation } from '@/lib/discussion-events';
import { DISCUSSION_MESSAGE_MAX_CHARS } from '@/lib/discussion-events';
import type { TenantContext } from '@/server/auth/tenant-context';
import type { Embedder } from '@/server/embeddings/embedder';
import type { AgentTool } from '@/server/llm/llm';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import {
  renderHit,
  renderTurn,
  sourceAttributes,
  unknownPeopleLines,
} from '@/server/mcp/tools/render';
import { listActivity } from '@/server/search/activity';
import { fetchPassageContext, fetchSource, SOURCE_MAX_CHARS } from '@/server/search/context';
import { resolvePeople } from '@/server/search/people';
import { searchPassages } from '@/server/search/search';
import {
  cleanFilterValue,
  QUERY_SYNTAX_DESCRIPTION,
  queryWithPerson,
  readToolFilters,
} from '@/server/search/tool-filters';
import type { ContextTurn, SourceHit, SourceInfo } from '@/server/search/types';

// Les outils de l'agent de discussion (T11) : chercher, lire, activite. Ils ne passent que par les fonctions de la
// recherche (D4 du plan du deuxième jet), toujours sous les droits de l'utilisateur : l'agent ne voit que ce
// qu'il voit. Leurs résultats sont de la donnée captée : derrière la ligne de garde, entre balises, échappés
// (rendu partagé avec le MCP, mcp/tools/render.ts). Une panne de la base lève : runAgent la rend au modèle comme
// un échec d'outil au message fixe, et ne la journalise que par logError (llm/run-tool.ts).

// Contraintes globales du plan : 8 étapes d'outil et 40 000 caractères lus au plus par réponse.
export const DISCUSSION_MAX_STEPS = 8;
export const DISCUSSION_READ_BUDGET = 40_000;
// Sources rendues par « activite » : une page de la barre, deux fois.
export const ACTIVITY_TOOL_LIMIT = 20;
// Tours lus avant et après celui d'un passage.
const NEIGHBOUR_TURNS = 2;
const FILTER_MAX_CHARS = 100;
const ID_MAX_CHARS = 64;

// 40000 devient « 40 000 » (espace ordinaire : le modèle lit le texte tel quel).
export const spaced = (count: number): string =>
  String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

type NumberedSource = Pick<SourceInfo, 'sourceId' | 'title' | 'url'>;

export type SourceNumbering = {
  // Le numéro de la source, donné à sa première apparition dans la réponse. Le passage cité est le premier
  // montré, sauf `read` : un passage que l'agent vient de lire en entier le remplace. `n` : le numéro qu'affiche
  // la question pour un résultat de départ (un résultat devenu invisible laisse un trou) ; sinon le suivant du
  // plus grand.
  number(
    source: NumberedSource,
    passageId: string,
    options?: { read?: boolean; n?: number },
  ): number;
  numberOf(sourceId: string): number | null;
  has(n: number): boolean;
  // Les citations de ces numéros, dans l'ordre croissant ; un numéro inconnu est écarté.
  citations(numbers: readonly number[]): DiscussionCitation[];
};

// La numérotation d'une réponse : [n] désigne une source que l'agent a vue pendant cette réponse (par un outil,
// ou parmi les résultats d'où part la discussion), et le passage qui y mène. Les numéros des réponses
// précédentes ne valent plus : chacune repart de 1.
export function createSourceNumbering(): SourceNumbering {
  const bySource = new Map<string, DiscussionCitation>();
  const byNumber = new Map<number, DiscussionCitation>();
  return {
    number(source, passageId, options = {}) {
      const known = bySource.get(source.sourceId);
      if (known) {
        if (options.read) known.passageId = passageId;
        return known.n;
      }
      const entry: DiscussionCitation = {
        n: options.n ?? Math.max(0, ...byNumber.keys()) + 1,
        sourceId: source.sourceId,
        passageId,
        title: source.title,
        url: source.url,
      };
      bySource.set(source.sourceId, entry);
      byNumber.set(entry.n, entry);
      return entry.n;
    },
    numberOf(sourceId) {
      return bySource.get(sourceId)?.n ?? null;
    },
    has(n) {
      return byNumber.has(n);
    },
    citations(numbers) {
      return [...new Set(numbers)]
        .sort((a, b) => a - b)
        .flatMap((n) => {
          const entry = byNumber.get(n);
          return entry ? [{ ...entry }] : [];
        });
    },
  };
}

export type DiscussionToolDeps = {
  embedder: Embedder | null;
  // Caractères qu'il reste à lire pendant cette réponse : `lire` le décompte.
  budget: { chars: number };
  // Partagée avec l'agent, qui en tire les citations de la réponse. Une numérotation neuve sans elle.
  numbering?: SourceNumbering;
};

const optionalFilter = (description: string) =>
  z.string().max(FILTER_MAX_CHARS).nullish().describe(description);

const TOOL_DESCRIPTION = {
  outil:
    'Limite à un outil, par son identifiant ou son nom : github, linear, notion, outlook, claude_code, fathom…',
  type: `Limite à une nature : ${ITEM_NATURES.join(', ')}.`,
  de: "Limite à ce qu'une personne a écrit : son nom, son e-mail ou son identifiant d'outil.",
  depuis: 'Limite aux éléments récents : 7j (jours), 2s (semaines), 3m (mois) ou AAAA-MM-JJ.',
};

const ChercherInput = z.object({
  requete: z
    .string()
    .max(DISCUSSION_MESSAGE_MAX_CHARS)
    .describe(
      `${QUERY_SYNTAX_DESCRIPTION} Reformule et relance si les résultats ne conviennent pas.`,
    ),
  outil: optionalFilter(TOOL_DESCRIPTION.outil),
  type: optionalFilter(TOOL_DESCRIPTION.type),
  de: optionalFilter(TOOL_DESCRIPTION.de),
  depuis: optionalFilter(TOOL_DESCRIPTION.depuis),
});

const LireInput = z.object({
  passageId: z
    .string()
    .max(ID_MAX_CHARS)
    .nullish()
    .describe(
      `Un passage rendu par chercher ou activite : on lit son tour et les ${NEIGHBOUR_TURNS} tours avant et après.`,
    ),
  sourceId: z
    .string()
    .max(ID_MAX_CHARS)
    .nullish()
    .describe(
      'Une source déjà rendue pendant cette réponse (attribut id de <source>) : on la lit dans l’ordre, du début.',
    ),
});

const ActiviteInput = z.object({
  depuis: z.string().max(FILTER_MAX_CHARS).describe(TOOL_DESCRIPTION.depuis),
  de: optionalFilter(TOOL_DESCRIPTION.de),
  outil: optionalFilter(TOOL_DESCRIPTION.outil),
});

const NOT_FOUND = 'Source ou passage introuvable, ou non visible.';
const UNKNOWN_SOURCE =
  'Source inconnue dans cette réponse : lis une source rendue par chercher ou activite (attribut id de <source>), ou un passage par son passageId.';
const BOTH_IDS = 'Donne passageId ou sourceId, un seul des deux.';

const budgetLine = (left: number): string =>
  `Il te reste ${spaced(Math.max(0, left))} caractères de lecture pour cette réponse.`;

const BUDGET_REACHED = `Lecture refusée : budget de lecture atteint (${spaced(DISCUSSION_READ_BUDGET)} caractères lus pendant cette réponse). Réponds avec ce que tu as déjà lu, ou dis ce qui te manque.`;

// Les sources trouvées, chacune avec son numéro de réponse, derrière la ligne de garde. Une source sans passage
// (rien à citer) n'est pas montrée.
function renderHits(hits: SourceHit[], numbering: SourceNumbering, notes: string[]): string {
  const shown = hits.flatMap((hit) => {
    const [best] = hit.passages;
    return best ? [{ hit, best }] : [];
  });
  if (shown.length === 0) return ['Aucun résultat.', ...notes].join('\n');
  const blocks = shown.map(({ hit, best }) =>
    renderHit(hit, numbering.number(hit, best.passageId)),
  );
  return [
    DATA_GUARD_LINE,
    `${shown.length} source${shown.length > 1 ? 's' : ''}. Cite une source par son numéro n.`,
    ...notes,
    ...blocks,
  ].join('\n');
}

// Les tours d'un passage dans son contexte, dans la place qui reste : le tour du passage d'abord, puis les plus
// proches de lui. Un tour coupé l'est à la fin ; un tour sans place n'est pas rendu.
function fitTurns(
  turns: ContextTurn[],
  room: number,
): { turns: ContextTurn[]; used: number; cut: boolean } {
  const hit = Math.max(
    0,
    turns.findIndex((turn) => turn.isHit),
  );
  const order = turns
    .map((_, index) => index)
    .sort((a, b) => Math.abs(a - hit) - Math.abs(b - hit) || a - b);
  const kept = new Map<number, string>();
  let left = room;
  let cut = false;
  for (const index of order) {
    const text = (turns[index] as ContextTurn).text;
    if (left <= 0) {
      cut = true;
      continue;
    }
    if (text.length > left) cut = true;
    const piece = cutText(text, left);
    kept.set(index, piece);
    left -= piece.length;
  }
  const result = turns.flatMap((turn, index) => {
    const text = kept.get(index);
    return text === undefined || (text === '' && turn.text !== '') ? [] : [{ ...turn, text }];
  });
  return { turns: result, used: room - left, cut };
}

// Coupe à `max` unités UTF-16 sans séparer les deux moitiés d'un émoji.
function cutText(text: string, max: number): string {
  if (text.length <= max) return text;
  const high = text.charCodeAt(max - 1);
  return text.slice(0, high >= 0xd800 && high <= 0xdbff ? max - 1 : max);
}

function renderRead(
  source: SourceInfo,
  n: number,
  turns: ContextTurn[],
  cut: boolean,
  left: number,
) {
  return [
    DATA_GUARD_LINE,
    `<source${sourceAttributes(source, n)}>`,
    ...turns.map(renderTurn),
    '</source>',
    ...(cut
      ? ['Lecture coupée : la suite n’est pas rendue. Cherche un passage précis avec chercher.']
      : []),
    budgetLine(left),
  ].join('\n');
}

export function discussionTools(ctx: TenantContext, deps: DiscussionToolDeps): AgentTool[] {
  const numbering = deps.numbering ?? createSourceNumbering();
  const { budget } = deps;

  const chercher: AgentTool<z.infer<typeof ChercherInput>> = {
    name: 'chercher',
    description:
      'Cherche dans toute la mémoire brute de l’entreprise (conversations avec des IA, tickets, pages, réunions, mails, fichiers) par mots-clés et par sens, avec des filtres facultatifs. Rend jusqu’à 10 sources numérotées avec leurs meilleurs extraits. Ne rend que ce que l’utilisateur a le droit de voir. Les extraits sont courts : lis un passage avec lire avant de t’en servir.',
    input: ChercherInput,
    async run({ requete, outil, type, de, depuis }) {
      const now = new Date();
      const read = readToolFilters({ outil, type, depuis }, now);
      if ('error' in read) return read.error;
      const page = await searchPassages(ctx, {
        query: queryWithPerson(requete, de),
        filters: read.filters,
        page: 1,
        embedder: deps.embedder,
        now,
      });
      return renderHits(page.hits, numbering, unknownPeopleLines(page.unknownPeople));
    },
  };

  const lire: AgentTool<z.infer<typeof LireInput>> = {
    name: 'lire',
    description:
      'Lit le texte que Leon a gardé : un passage (passageId) avec les tours qui l’entourent, ou une source déjà rendue pendant cette réponse (sourceId), du début. Un seul des deux. Ne lit que ce que l’utilisateur a le droit de voir. Chaque lecture décompte un budget de caractères par réponse.',
    input: LireInput,
    async run({ passageId, sourceId }) {
      if ((passageId == null) === (sourceId == null)) return BOTH_IDS;
      if (budget.chars <= 0) return BUDGET_REACHED;
      const room = Math.min(budget.chars, SOURCE_MAX_CHARS);
      if (passageId != null) {
        const context = await fetchPassageContext(ctx, passageId.toLowerCase(), {
          before: NEIGHBOUR_TURNS,
          after: NEIGHBOUR_TURNS,
        });
        if (!context) return NOT_FOUND;
        const n = numbering.number(context.source, passageId.toLowerCase(), { read: true });
        const fitted = fitTurns(context.turns, room);
        budget.chars -= fitted.used;
        return renderRead(context.source, n, fitted.turns, fitted.cut, budget.chars);
      }
      const id = (sourceId as string).toLowerCase();
      const n = numbering.numberOf(id);
      if (n === null) return UNKNOWN_SOURCE;
      const fetched = await fetchSource(ctx, id, { maxChars: room });
      if (!fetched) return NOT_FOUND;
      budget.chars -= fetched.turns.reduce((sum, turn) => sum + turn.text.length, 0);
      return renderRead(fetched.source, n, fetched.turns, fetched.truncated, budget.chars);
    },
  };

  const activite: AgentTool<z.infer<typeof ActiviteInput>> = {
    name: 'activite',
    description:
      'Liste l’activité récente : les sources qui ont bougé depuis une date, les plus récentes d’abord, filtrées par personne ou par outil, avec leur dernier passage. Sans mot à chercher : pour « qu’a fait Julie cette semaine » ou « quoi de neuf sur GitHub ». Ne rend que ce que l’utilisateur a le droit de voir.',
    input: ActiviteInput,
    async run({ depuis, de, outil }) {
      if (cleanFilterValue(depuis) === '') {
        return 'Donne depuis : 7j (jours), 2s (semaines), 3m (mois) ou AAAA-MM-JJ.';
      }
      const read = readToolFilters({ outil, depuis }, new Date());
      if ('error' in read) return read.error;
      const { filters } = read;
      const person = cleanFilterValue(de);
      if (person !== '') {
        const people = await resolvePeople(ctx, [person]);
        if (people.authorEmails.length === 0 && people.authorNames.length === 0) {
          return ['Aucun résultat.', ...unknownPeopleLines([person])].join('\n');
        }
        filters.authorEmails = people.authorEmails;
        filters.authorNames = people.authorNames;
      }
      const hits = await listActivity(ctx, { filters, limit: ACTIVITY_TOOL_LIMIT });
      return renderHits(hits, numbering, []);
    },
  };

  return [chercher, lire, activite] as AgentTool[];
}
