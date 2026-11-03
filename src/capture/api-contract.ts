import { z } from 'zod';
import { CODE_SESSION_KINDS, ProjectSchema } from './turn';

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

// Les bornes des faits d'une session (C1 du plan mémoire des sessions).
export const PRS_MAX = 10;
export const COMMITS_MAX = 20;
export const FICHIERS_MAX = 50;
export const COMMANDES_MAX = 30;
export const TACHES_MAX = 20;
export const TEXTE_MAX = 200;

export const PrSchema = z
  .object({
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
    numero: z.number().int().positive(),
    par: z.enum(['pr-link', 'gh-pr-create']),
  })
  .strict();

// Les gestes d'une session, relevés par du code, sans modèle (C1). L'outil est le `kind` de l'envoi. Ici, et non
// dans session-facts.ts, qui lit les fichiers avec node:path : l'extension importe ce contrat.
export const SessionFactsSchema = z
  .object({
    branche: z.string().nullable(), // tête détachée : null
    prs: z.array(PrSchema).max(PRS_MAX),
    commits: z.array(z.string().regex(/^[0-9a-f]{7,40}$/)).max(COMMITS_MAX),
    fichiers: z.array(z.string()).max(FICHIERS_MAX), // relatifs au dépôt
    commandes: z
      .array(z.object({ texte: z.string().max(TEXTE_MAX), erreur: z.boolean() }).strict())
      .max(COMMANDES_MAX),
    taches: z
      .array(
        z
          .object({
            texte: z.string().max(TEXTE_MAX),
            etat: z.enum(['a_faire', 'en_cours', 'fait']),
          })
          .strict(),
      )
      .max(TACHES_MAX),
    erreurs: z.number().int().nonnegative(), // erreurs d'outils
    externe: z.boolean(), // a lu du web, du MCP, un sous-agent ou une commande réseau
    echanges: z.number().int().nonnegative(), // messages tapés par l'utilisateur
    debut: z.iso.datetime({ offset: true }).nullable(),
    fin: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type SessionFacts = z.infer<typeof SessionFactsSchema>;

// Les gestes d'une session de code (C2 du plan mémoire des sessions), à part du contrat d'ingestion : un serveur
// plus ancien perd les faits, jamais les tours. `accord` est la version d'accord de l'outil sur le poste : la CLI
// n'envoie de faits qu'à partir de la version 2, et les versions connues s'arrêtent à 4 (C7).
export const FAITS_BODY_MAX_BYTES = 64 * 1024;
export const SessionFactsPayloadSchema = z
  .object({
    kind: z.enum(CODE_SESSION_KINDS),
    external_id: z.string().min(1).max(200),
    project: ProjectSchema.optional(),
    accord: z.number().int().min(2).max(4),
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
