import { z } from 'zod';

// Contrat des tours captés, partagé avec la CLI et l'extension (décision D1 : imports relatifs seulement).
// Trois listes de types : ceux de la capture (seuls admis par la route publique d'envoi), ceux des
// connecteurs (écrits par la tâche de fond), et leur réunion, qui est tout ce que la base accepte.
export const CAPTURE_KINDS = ['claude_code', 'claude_ai', 'chatgpt', 'mcp_remember'] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];
export const PROVIDER_IDS = [
  'github',
  'notion',
  'linear',
  'granola',
  'fathom',
  'fireflies',
  'tldv',
  'circleback',
  'claap',
  'leexi',
  'gong',
  'jira',
  'confluence',
  'gitlab',
  'asana',
  'clickup',
  'trello',
  'monday',
  'shortcut',
  'plane',
  'airtable',
  'sentry',
  'hubspot',
  'attio',
  'folk',
  'pipedrive',
  'close',
  'intercom',
  'zendesk',
  'freshdesk',
  'helpscout',
  'front',
  'plain',
  'crisp',
  'missive',
  'basecamp',
  'miro',
  'productboard',
  'outlook',
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export const SOURCE_KINDS = [...CAPTURE_KINDS, ...PROVIDER_IDS] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
// Ce que la source est : une conversation avec un assistant, ou un élément d'un outil (C4 du plan du deuxième jet).
// Elle s'écrit dans `sources.metadata.nature`. Le repli d'une valeur inconnue sur « conversation » (qui vivait dans
// l'ancien `pipeline/runs.ts`) est à refaire en T06, là où la recherche lit la nature pour `SourceHit.nature`.
export const ITEM_NATURES = [
  'conversation',
  'reunion',
  'page',
  'ticket',
  'fil',
  'note',
  'mail',
  'fichier',
  'evenement',
  'commit',
] as const;
export type ItemNature = (typeof ITEM_NATURES)[number];
export const CAPTURE_MODES = ['file', 'network', 'dom', 'manual'] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];
// Ce que la base accepte : la route publique, elle, ne garde que CAPTURE_MODES et les rôles user / assistant.
export const TURN_ROLES = ['user', 'assistant', 'document', 'participant'] as const;
export type TurnRole = (typeof TURN_ROLES)[number];
// Du côté de qui parle l'auteur d'un tour d'outil, d'après un champ de l'outil (jamais d'après un nom, que
// chacun choisit) : l'équipe qui a branché l'outil, ou une personne extérieure (client, visiteur, inconnu).
// Un tour dont l'outil ne dit pas le côté n'en a pas.
export const AUTHOR_SIDES = ['team', 'external'] as const;
export type AuthorSide = (typeof AUTHOR_SIDES)[number];
export const TURN_CAPTURE_MODES = [...CAPTURE_MODES, 'connector'] as const;
export type TurnCaptureMode = (typeof TURN_CAPTURE_MODES)[number];
export const TURN_TEXT_MAX = 20_000; // caractères par tour, après nettoyage
export const TURNS_PER_BATCH_MAX = 200;
export const INGEST_BODY_MAX_BYTES = 2 * 1024 * 1024;

export const TurnSchema = z
  .object({
    external_id: z.string().min(1).max(200),
    role: z.enum(['user', 'assistant']),
    text: z.string().min(1).max(TURN_TEXT_MAX),
    ts: z.iso.datetime({ offset: true }),
    capture_mode: z.enum(CAPTURE_MODES),
  })
  .strict();
export type Turn = z.infer<typeof TurnSchema>;

export const IngestPayloadSchema = z
  .object({
    source: z
      .object({
        kind: z.enum(CAPTURE_KINDS),
        external_id: z.string().min(1).max(200),
        title: z.string().min(1).max(300).optional(),
      })
      .strict(),
    turns: z.array(TurnSchema).min(1).max(TURNS_PER_BATCH_MAX),
  })
  .strict();
export type IngestPayload = z.infer<typeof IngestPayloadSchema>;

export const IngestResultSchema = z.object({
  sourceId: z.uuid(),
  inserted: z.number().int(),
  skipped: z.number().int(),
  ingestRunId: z.uuid().nullable(),
});
export type IngestResult = z.infer<typeof IngestResultSchema>;
