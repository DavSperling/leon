import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ITEM_NATURES, SOURCE_KINDS } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import type { Embedder } from '@/server/embeddings/embedder';
import { parseQuery } from '@/server/search/parse-query';
import { searchPassages } from '@/server/search/search';
import type { SearchFilters } from '@/server/search/types';
import { guarded } from './guarded';
import { renderSearch, searchStructured } from './render';

// L'outil `search` : la recherche de la barre de Leon (passages, filtres), sans la réponse de l'agent, puisque
// l'IA du client est elle-même un agent. Les mêmes droits que dans l'interface : la recherche tourne sous ceux
// du porteur du jeton, et rien d'autre ne lit la base ici.

const FILTER_MAX_CHARS = 100;

const InputSchema = z.object({
  query: z
    .string()
    .max(1000)
    .describe(
      'Les mots à chercher, avec « guillemets » pour une expression exacte. Peut être vide si un filtre est donné : on rend alors les sources les plus récentes.',
    ),
  outil: z
    .string()
    .max(FILTER_MAX_CHARS)
    .optional()
    .describe('Limite à un outil : github, linear, notion, outlook, claude_code, fathom…'),
  type: z
    .string()
    .max(FILTER_MAX_CHARS)
    .optional()
    .describe(`Limite à une nature : ${ITEM_NATURES.join(', ')}.`),
  depuis: z
    .string()
    .max(FILTER_MAX_CHARS)
    .optional()
    .describe('Limite aux passages récents : 7j (jours), 2s (semaines), 3m (mois) ou AAAA-MM-JJ.'),
  de: z
    .string()
    .max(FILTER_MAX_CHARS)
    .optional()
    .describe(
      "Limite à ce qu'une personne a écrit : son nom, son e-mail ou son identifiant d'outil.",
    ),
  page: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Page de résultats, 10 sources par page (1 par défaut).'),
});

// Une valeur de filtre sur une seule ligne, sans guillemet ni caractère de contrôle : elle s'écrit entre
// guillemets dans la syntaxe de la barre et ne peut rien d'autre qu'être une valeur.
function clean(value: string | undefined): string {
  return (value ?? '').replace(/[\s\p{Cc}"]+/gu, ' ').trim();
}

const refusal = (text: string) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text }],
});

// Les filtres écrits dans les paramètres, lus comme la barre les lit (identifiant ou libellé d'outil, nature au
// singulier ou au pluriel, durées). Un filtre que Leon ne comprend pas n'est pas ignoré en silence : l'assistant
// croirait avoir cherché dans un outil, et chercherait partout.
function readFilters(
  input: { outil?: string; type?: string; depuis?: string },
  now: Date,
): { filters: SearchFilters } | { error: string } {
  const filters: SearchFilters = {};
  const outil = clean(input.outil);
  if (outil !== '') {
    const tools = parseQuery(`outil:"${outil}"`, now).filters.tools;
    if (!tools) {
      return { error: `Outil inconnu : « ${outil} ». Outils connus : ${SOURCE_KINDS.join(', ')}.` };
    }
    filters.tools = tools;
  }
  const type = clean(input.type);
  if (type !== '') {
    const natures = parseQuery(`type:"${type}"`, now).filters.natures;
    if (!natures) {
      return { error: `Type inconnu : « ${type} ». Types connus : ${ITEM_NATURES.join(', ')}.` };
    }
    filters.natures = natures;
  }
  const depuis = clean(input.depuis);
  if (depuis !== '') {
    const since = parseQuery(`depuis:"${depuis}"`, now).filters.since;
    if (!since) {
      return {
        error: `Durée inconnue pour depuis : « ${depuis} ». Écrire 7j, 2s, 3m (jours, semaines, mois) ou AAAA-MM-JJ.`,
      };
    }
    filters.since = since;
  }
  return { filters };
}

export function registerSearchTool(
  server: McpServer,
  ctx: TenantContext,
  deps: { embedder: Embedder | null },
): void {
  server.registerTool(
    'search',
    {
      title: 'Chercher dans la mémoire',
      description:
        "Cherche dans toute la mémoire brute de l'entreprise (conversations avec des IA, tickets, pages, réunions, mails, fichiers) par mots-clés et par sens. Rend des sources avec leurs meilleurs passages, leur outil, leur titre, leur date et leur lien. Ne rend que ce que l'utilisateur a le droit de voir. Lire un passage ou une source : fetch.",
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('search', async ({ query, outil, type, depuis, de, page }) => {
      const now = new Date();
      const read = readFilters({ outil, type, depuis }, now);
      if ('error' in read) return refusal(read.error);
      // `de` passe par la syntaxe de la barre, qui rapproche un nom des membres de l'équipe. Il se met en tête :
      // un guillemet non fermé dans la requête ne doit pas avaler le filtre qui le suit.
      const person = clean(de);
      const text = `${person === '' ? '' : `de:"${person}" `}${query}`;
      const pageNumber = page ?? 1;
      const result = await searchPassages(ctx, {
        query: text,
        filters: read.filters,
        page: pageNumber,
        embedder: deps.embedder,
        now,
      });
      return {
        content: [{ type: 'text', text: renderSearch(result, pageNumber) }],
        structuredContent: searchStructured(result, pageNumber),
      };
    }),
  );
}
