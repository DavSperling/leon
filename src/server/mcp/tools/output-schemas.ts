import { z } from 'zod';

// Ce que `search`, `fetch` et les lectures des fils rendent en `structuredContent`, annoncé au client dans `tools/list`
// (`outputSchema`).
// Le serveur vérifie chaque réponse contre ce schéma, et les tests s'en servent pour typer ce qu'ils lisent : la
// forme n'est plus écrite à la main à deux endroits.
//
// Deux contrats se superposent. Celui de Leon (`hits`, `source`, `turns`…), et celui que ChatGPT impose aux outils
// de ce nom (deep research) : `search` rend `results` ({ id, title, url }), `fetch` prend un `id` et rend
// { id, title, text, url, metadata }. ChatGPT ne cite une source que si `url` n'est pas vide.

const SourceSchema = z.object({
  sourceId: z.string(),
  kind: z.string(),
  kindLabel: z.string(),
  nature: z.string(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  origin: z.record(z.string(), z.string()),
  lastTs: z.string(),
});

// Une PR, par ses clés (D25) : jamais son titre.
const PrKeySchema = z.object({ repo: z.string(), numero: z.number().int() });

const PassageSchema = z.object({
  passageId: z.string(),
  turnId: z.string(),
  snippet: z.string(),
  ts: z.string(),
  authorName: z.string().nullable(),
});

export const SearchOutputSchema = z.object({
  // Contrat de ChatGPT : une ligne par source, `url` vide quand la source n'a pas de lien.
  results: z.array(z.object({ id: z.string(), title: z.string(), url: z.string() })),
  mode: z.enum(['plein-texte', 'hybride']),
  page: z.number().int(),
  totalSources: z.number().int(),
  unknownPeople: z.array(z.string()),
  hits: z.array(
    SourceSchema.extend({
      // T06b : les sources qui ne contiennent qu'une partie des mots viennent après les autres, quel que soit leur
      // score (récence, auteur) : le score ne se compare qu'entre sources voisines, l'ordre rendu est le classement.
      score: z
        .number()
        .describe(
          'Source relevance, for information only: sources are returned in ranking order, and those that contain only some of the searched words come after the others, whatever their score.',
        ),
      passages: z.array(PassageSchema),
      // Une session de code (T45) : le fil qui la tient, à lire avec thread, et les PR de ses faits.
      thread: z.string().optional(),
      prs: z.array(PrKeySchema).optional(),
    }),
  ),
});

export const FetchOutputSchema = z.object({
  // Contrat de ChatGPT : `id` est l'identifiant de la source, `text` ses tours bout à bout.
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string(),
  metadata: z.record(z.string(), z.string()),
  source: SourceSchema,
  truncated: z.boolean(),
  turns: z.array(
    z.object({
      turnId: z.string(),
      role: z.string(),
      authorName: z.string().nullable(),
      ts: z.string(),
      text: z.string(),
      isHit: z.boolean(),
    }),
  ),
});

// Les lectures des fils (T45, T54 ; C9, C12, D25) : des clés seulement (id, titre, dates, numéros), jamais l'état, la
// première ligne d'une version ni le titre d'une source liée, qui ne vont que dans `content`, derrière la ligne de garde.
export const ThreadsOutputSchema = z.object({
  threads: z.array(
    z.object({
      id: z.string(),
      titre: z.string(),
      date: z.string().nullable(),
      prs: z.array(PrKeySchema),
    }),
  ),
  // Les fils du projet, au-delà des 20 rendus.
  total: z.number().int(),
});

export const ThreadOutputSchema = z.object({
  id: z.string(),
  titre: z.string(),
  // La version rendue, quand l'état est elle.
  version: z.object({ n: z.number().int(), date: z.string() }).nullable(),
  sessions: z.array(z.object({ id: z.string(), date: z.string() })),
  prs: z.array(PrKeySchema),
  // Les sources liées, à ouvrir avec fetch.
  liees: z.array(z.string()),
});

export const VersionsOutputSchema = z.object({
  id: z.string(),
  titre: z.string(),
  versions: z.array(z.object({ n: z.number().int(), date: z.string(), par: z.string() })),
});

export type SearchOutput = z.infer<typeof SearchOutputSchema>;
export type FetchOutput = z.infer<typeof FetchOutputSchema>;
export type ThreadsOutput = z.infer<typeof ThreadsOutputSchema>;
export type ThreadOutput = z.infer<typeof ThreadOutputSchema>;
export type VersionsOutput = z.infer<typeof VersionsOutputSchema>;
