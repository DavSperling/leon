import { z } from 'zod';

// Contrat des tours captés, partagé avec la CLI et l'extension (décision D1 : imports relatifs seulement).
// Trois listes de types : ceux de la capture (seuls admis par la route publique d'envoi), ceux des
// connecteurs (écrits par la tâche de fond), et leur réunion avec les documents ajoutés à la main (écran
// Documents) : les outils. La base accepte en plus le fil de travail, que seul le serveur crée.
export const CAPTURE_KINDS = [
  'claude_code',
  'codex',
  'cursor',
  'antigravity',
  'claude_ai',
  'chatgpt',
  'mcp_remember',
] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];
// Les sessions d'un outil de code, les seules dont la CLI relève les gestes (route des faits, C2 du plan mémoire
// des sessions) : chaque outil ajouté à la capture vient aussi ici. Ce sont aussi les sessions que lisent le point du
// matin et le bloc de démarrage (T18) : « mes sessions », tous outils confondus.
export const CODE_SESSION_KINDS = [
  'claude_code',
  'codex',
  'cursor',
  'antigravity',
] as const satisfies readonly CaptureKind[];
export type CodeSessionKind = (typeof CODE_SESSION_KINDS)[number];
export const isCodeSessionKind = (kind: string): kind is CodeSessionKind =>
  (CODE_SESSION_KINDS as readonly string[]).includes(kind);
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
  'gmail',
  'drive',
  'slack',
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
// Les types d'outils, ceux que le filtre `outil` de la recherche connaît.
export const TOOL_KINDS = [...CAPTURE_KINDS, 'document', ...PROVIDER_IDS] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];
// `leon_fil` : le fil de travail (D21 du plan de la mémoire à disposition), une source sans tour, privée à son auteur,
// que seul le serveur crée. Ni la route d'envoi ni `remember` ne l'acceptent, et ce n'est l'outil de personne.
export const SOURCE_KINDS = [...TOOL_KINDS, 'leon_fil'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
// Ce que la source est : une conversation avec un assistant, ou un élément d'un outil (C4 du plan du deuxième jet).
// Elle s'écrit dans `sources.metadata.nature`. Une nature absente (les conversations captées n'en écrivent pas)
// ou inconnue vaut « conversation » : c'est la recherche qui la lit (`server/search/filters-sql.ts`).
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
  // Celle du fil de travail, que donne son type `leon_fil` (filters-sql.ts) ; « fil » est le fil d'un connecteur.
  'fil_de_travail',
] as const;
export type ItemNature = (typeof ITEM_NATURES)[number];
// Les natures proposées par les menus et les descriptions des outils : un fil de travail n'a ni tour ni passage (D35),
// la recherche ne le rend jamais. Le filtre `type` l'accepte quand même (T39).
export const OFFERED_NATURES = ITEM_NATURES.filter((nature) => nature !== 'fil_de_travail');
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

// La clé du projet d'une session (C8) : un dépôt GitHub (`github.com/<propriétaire>/<dépôt>`, en minuscules)
// ou, faute de dépôt, le dossier (`dossier:` et 16 hexadécimaux). Jamais une adresse de remote : elle peut porter un jeton.
export const PROJECT_KEY_PATTERN =
  /^(github\.com\/[a-z0-9._-]+\/[a-z0-9._-]+|dossier:[0-9a-f]{16})$/;
// Une clé de projet reçue en paramètre (le point du matin, le bloc de démarrage), de la même forme que `source.project`.
export const ProjectSchema = z.string().min(1).max(200).regex(PROJECT_KEY_PATTERN);
// Le dépôt d'une clé de projet GitHub (« propriétaire/dépôt », en minuscules), ou null pour un projet de dossier.
export const repoOf = (project: string): string | null =>
  project.startsWith('github.com/') ? project.slice('github.com/'.length) : null;

// Ce que les outils `briefing` et `search` lisent comme projet : l'adresse https d'un dépôt au nom long (39
// caractères de propriétaire, 100 de dépôt sur GitHub) dépasse les 200 de la clé.
export const PROJECT_INPUT_MAX_CHARS = 300;
const OWNER_AND_REPO = /^[a-z0-9._-]+\/[a-z0-9._-]+$/;

// La clé du projet (D9) d'après ce qu'écrit l'utilisateur ou son assistant (outils `briefing` et `search` du MCP) :
// la clé elle-même, « propriétaire/dépôt », ou l'adresse https du dépôt. Null pour tout le reste (un autre
// hébergeur, une adresse avec identifiants).
export function projectKeyFromInput(raw: string): string | null {
  const text = raw.trim().toLowerCase();
  const path = text
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  const key = text.startsWith('dossier:')
    ? text
    : OWNER_AND_REPO.test(path) && !path.split('/').some((part) => part === '.' || part === '..')
      ? `github.com/${path}`
      : null;
  return key !== null && ProjectSchema.safeParse(key).success ? key : null;
}

export const IngestPayloadSchema = z
  .object({
    source: z
      .object({
        kind: z.enum(CAPTURE_KINDS),
        external_id: z.string().min(1).max(200),
        title: z.string().min(1).max(300).optional(),
        project: z.string().min(1).max(200).regex(PROJECT_KEY_PATTERN).optional(),
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
