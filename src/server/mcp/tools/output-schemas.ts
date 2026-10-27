import { z } from 'zod';

// Ce que `search` et `fetch` rendent en `structuredContent`, annoncé au client dans `tools/list` (`outputSchema`).
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

export type SearchOutput = z.infer<typeof SearchOutputSchema>;
export type FetchOutput = z.infer<typeof FetchOutputSchema>;
