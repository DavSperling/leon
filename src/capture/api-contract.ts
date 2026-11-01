import { z } from 'zod';

// Contrat HTTP partagé avec la CLI et l'extension (décision D1 : aucun import de code serveur ici).
export const API_PATHS = {
  ingest: '/api/v1/ingest',
  me: '/api/v1/me',
  briefing: '/api/v1/briefing',
  passation: '/api/v1/passation',
  passationLast: '/api/v1/passation/derniere',
  mcp: '/api/mcp',
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

// Les routes de passation (spec du 01/11/2026) : `projet` porte la clé du projet, `branche` la branche git.
export const PASSATION_BRANCH_PARAM = 'branche';
export const PassationWriteSchema = z.object({
  texte: z.string().min(1).max(8000),
  projet: z.string().min(1).max(200),
  branche: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[\w./-]+$/)
    .nullable(),
  outil: z.enum(['claude_code', 'codex', 'cursor', 'chatgpt', 'claude_ai', 'autre']),
});
export type PassationWrite = z.infer<typeof PassationWriteSchema>;
export const PassationStateSchema = z.object({ markdown: z.string().nullable() });
export const PassationLastSchema = z.object({ at: z.iso.datetime().nullable() });
