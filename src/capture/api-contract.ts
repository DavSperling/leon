import { z } from 'zod';
import { SessionFactsSchema } from './session-facts';
import { CODE_SESSION_KINDS, PROJECT_KEY_PATTERN, ProjectSchema } from './turn';

// Contrat HTTP partagé avec la CLI et l'extension (décision D1 : aucun import de code serveur ici).
export const API_PATHS = {
  ingest: '/api/v1/ingest',
  me: '/api/v1/me',
  briefing: '/api/v1/briefing',
  mcp: '/api/mcp',
  faits: '/api/v1/faits',
  contexte: '/api/v1/contexte',
} as const;

export const API_TOKEN_PATTERN = /^leon_[A-Za-z0-9_-]{43}$/; // 'leon_' + 32 octets en base64url

export const ViewerProfileSchema = z.object({
  userId: z.uuid(),
  tenantId: z.uuid(),
  userName: z.string(),
  email: z.string(),
  organizationName: z.string(),
});
export type ViewerProfile = z.infer<typeof ViewerProfileSchema>;

// Le paramètre de `briefing` qui porte la clé du projet (C8) : `github.com/<propriétaire>/<dépôt>` ou `dossier:…`.
export const BRIEFING_PROJECT_PARAM = 'projet';

// Le point du matin d'un projet, préparé à l'avance ; `projet` et `preparedAt` sont nuls quand rien n'est prêt.
export const BriefingResponseSchema = z.object({
  markdown: z.string(),
  projet: z.string().nullable(),
  preparedAt: z.iso.datetime().nullable(),
});
export type BriefingResponse = z.infer<typeof BriefingResponseSchema>;

// Les gestes d'une session de code (C2 du plan mémoire des sessions), à part du contrat d'ingestion : un serveur
// plus ancien perd les faits, jamais les tours. `accord` est la version d'accord de l'outil sur le poste : la CLI
// n'envoie de faits qu'à partir de la version 2.
export const FAITS_BODY_MAX_BYTES = 64 * 1024;
export const SessionFactsPayloadSchema = z
  .object({
    kind: z.enum(CODE_SESSION_KINDS),
    external_id: z.string().min(1).max(200),
    project: z.string().min(1).max(200).regex(PROJECT_KEY_PATTERN).optional(),
    accord: z.number().int().min(2),
    faits: SessionFactsSchema,
    fin: z.boolean(), // une vraie fin de session (SessionEnd), ou un fichier resté immobile
  })
  .strict();
export type SessionFactsPayload = z.infer<typeof SessionFactsPayloadSchema>;

// Le bloc de démarrage (C3) : mes dernières sessions sur ce dépôt, puis le point du matin, assemblés par le serveur
// en `max` octets UTF-8 au plus, borné à CONTEXT_MAX_BYTES. En POST, pour que la branche n'aille pas dans les
// journaux d'URL.
export const CONTEXT_MAX_BYTES = 8000;
export const ContextRequestSchema = z
  .object({
    projet: ProjectSchema,
    branche: z.string().min(1).max(200).nullable(), // tête détachée : null
    session: z.string().min(1).max(200), // la session qui démarre, exclue du bloc
    max: z.number().int().positive().optional(),
  })
  .strict();
export type ContextRequest = z.infer<typeof ContextRequestSchema>;
export const ContextResponseSchema = z.object({ texte: z.string() });
export type ContextResponse = z.infer<typeof ContextResponseSchema>;
