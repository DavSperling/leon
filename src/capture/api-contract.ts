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
  ordinateurs: '/api/v1/ordinateurs', // POST : leon login échange le code signé contre l'enregistrement du jeton
  jeton: '/api/v1/jeton', // DELETE : un jeton se révoque lui-même (leon logout)
  retrait: '/api/v1/retrait', // POST : le retrait de l'accord d'un outil atteint le serveur (leon retirer-crochets)
  dossier: '/api/v1/dossier', // POST : les fils du projet (leon threads)
  fil: '/api/v1/fil', // POST : un fil, sans id celui de la branche (leon thread)
  chercher: '/api/v1/chercher', // POST : la recherche bornée au dépôt du projet (leon search)
  versions: '/api/v1/versions', // POST : les versions lisibles d'un fil, ou l'une d'elles (leon versions)
  lecons: '/api/v1/lecons', // POST : les leçons acceptées du projet, ou l'une d'elles (leon lessons)
  rappel: '/api/v1/rappel', // POST : la ligne de rappel d'un message, ou rien (leon reminder)
  oauthClients: '/api/oauth/clients', // POST : l'inscription d'un client OAuth d'assistant (RFC 7591)
  oauthJeton: '/api/oauth/jeton', // POST : le code d'autorisation ou le renouvellement contre les jetons (RFC 6749)
} as const;

export const API_TOKEN_PATTERN = /^leon_[A-Za-z0-9_-]{43}$/; // 'leon_' + 32 octets en base64url

// La réponse 201 de POST /api/v1/ordinateurs (K5 du plan « CLI sans clone ») : le nom de l'espace, celui de
// l'ordinateur tel que le serveur l'a retenu, et l'e-mail du compte autorisé. `leon login` écrit les deux premiers
// dans connexion.json et affiche les trois : sur une machine partagée, le compte montre une autorisation donnée par un autre.
// `usages` et `refus` (T64, C16 du plan de la mémoire à disposition) : les cases de la page « Autoriser », cochées et
// décochées. Lus avec tolérance : un serveur plus ancien ne les rend pas, un plus récent peut en rendre d'inconnus ; ce
// n'est jamais une raison de refuser la connexion. La CLI n'en garde que ce qu'elle a demandé (login.ts).
export const ComputerResponseSchema = z.object({
  espace: z.string(),
  ordinateur: z.string(),
  compte: z.string(),
  usages: z.array(z.string()).catch([]),
  refus: z.array(z.string()).catch([]),
});
export type ComputerResponse = z.infer<typeof ComputerResponseSchema>;

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

// Les usages de l'accord (C7 révisé du plan de la mémoire à disposition) : chacun accepté à part, daté, par outil, sur
// le poste (cli/consent.ts). Le serveur vérifie l'usage à chaque emploi ; un usage absent vaut refus. Tous ceux du plan
// sont connus dès maintenant : une CLI qui en enverra un nouveau ne verra pas ses faits refusés par ce serveur.
export const USAGES = ['lecture', 'rappel', 'resume', 'coulisses', 'noter'] as const;
export type Usage = (typeof USAGES)[number];
// Les usages cochés par défaut que la page « Autoriser » sait montrer en cases, à ce lot (T64, C16) : `lecture`, puis
// `rappel` (T49, avec son crochet) ; T57 y ajoutera `noter`. À part de USAGES : la page ne montre, et `leon setup` ne
// demande, que ce qu'un installateur de ce lot sait écrire (`rappel` pour les quatre outils, depuis l'essai
// d'Antigravity 2.0.6 du 11/11).
export const AUTHORIZE_USAGES = ['lecture', 'rappel'] as const satisfies readonly Usage[];
export type AuthorizeUsage = (typeof AUTHORIZE_USAGES)[number];

// Les gestes d'une session de code (C2 du plan mémoire des sessions), à part du contrat d'ingestion : un serveur
// plus ancien perd les faits, jamais les tours. `accord` est la version d'accord de l'outil sur le poste : la CLI
// n'envoie de faits qu'à partir de la version 2, la seule qu'elle écrit ; 3 et 4, jamais émises, restent acceptées par
// prudence (C7 révisé). `usages` : ceux que l'outil a acceptés, rangés dans `metadata.usages` à chaque envoi ; la CLI
// ne l'envoie que s'il y en a, et un envoi sans lui n'en donne aucun. `accord_le` part avec eux : la date de l'accord
// de l'outil sur le poste (`installe_le`). Le serveur ignore les usages s'il n'est pas postérieur au dernier retrait de
// l'outil sur ce jeton, ou s'il manque après un retrait (T43, le retrait daté).
export const FAITS_BODY_MAX_BYTES = 64 * 1024;
// Une date du poste que Postgres lit en timestamptz (`accord_le`, `retire_le`, et l'`installe_le` d'accord.json qui les
// donne) : z.iso.datetime laisse passer l'an 0000 et les décalages de ±16:00 à ±23:59, que `::timestamptz` refuse
// (22008, 22009). Pas de borne haute : le serveur n'a pas l'horloge du poste.
export const DatePosteSchema = z.iso
  .datetime({ offset: true })
  .refine((date) => !date.startsWith('0000') && !/[+-](1[6-9]|2\d):\d\d$/.test(date));
export const SessionFactsPayloadSchema = z
  .object({
    kind: z.enum(CODE_SESSION_KINDS),
    external_id: z.string().min(1).max(200),
    project: ProjectSchema.optional(),
    accord: z.number().int().min(2).max(4),
    usages: z.array(z.enum(USAGES)).max(USAGES.length).optional(),
    accord_le: DatePosteSchema.optional(),
    faits: SessionFactsSchema,
    fin: z.boolean(), // une vraie fin de session (SessionEnd), ou un fichier resté immobile
  })
  .strict();
export type SessionFactsPayload = z.infer<typeof SessionFactsPayloadSchema>;

// Le retrait de l'accord d'un outil (T43, amendé le 06/11) : le serveur vide les usages de toutes les sessions de cet
// outil dont le porteur est l'auteur. `retire_le` : la date du retrait sur le poste (l'`installe_le` de l'entrée en
// version 0), même horloge que `accord_le`. Le serveur la garde pour ce jeton : seuls des faits envoyés sous un accord
// postérieur rouvrent les usages, jamais des faits partis avant le retrait et arrivés après lui.
export const RETRAIT_BODY_MAX_BYTES = 1024;
export const RetraitRequestSchema = z
  .object({ outil: z.enum(CODE_SESSION_KINDS), retire_le: DatePosteSchema })
  .strict();
export type RetraitRequest = z.infer<typeof RetraitRequestSchema>;

// Le bloc de démarrage (C3) : mes dernières sessions sur ce dépôt, puis le point du matin, assemblés par le serveur
// en `max` octets UTF-8 au plus, borné à CONTEXT_MAX_BYTES. En POST, pour que la branche n'aille pas dans les
// journaux d'URL. `usages` : ceux de l'outil dont le crochet demande le bloc ; avec `lecture`, le sommaire de ses fils
// et la consigne de lecture, qui cite `commande` (T46 du plan de la mémoire à disposition). Les deux sont facultatifs :
// une CLI plus ancienne reçoit le bloc d'avant.
export const CONTEXT_MAX_BYTES = 8000;
export const CONTEXT_BODY_MAX_BYTES = 4 * 1024; // une requête valide tient en moins de 1 Kio
// La commande Leon posée sur le poste, recopiée dans le bloc (C3 révisé, A16) : des caractères de chemin en ASCII, 200
// au plus, donc 200 octets, sans saut de ligne ni `<` ni accent grave. L'apostrophe entoure un chemin à espaces
// (leonCommand, briefing.ts).
export const CommandeSchema = z.string().regex(/^[A-Za-z0-9 ._/~'-]{1,200}$/);
export const ContextRequestSchema = z
  .object({
    projet: ProjectSchema,
    branche: z.string().min(1).max(200).nullable(), // tête détachée : null
    session: z.string().min(1).max(200), // la session qui démarre, exclue du bloc
    max: z.number().int().positive().optional(),
    usages: z.array(z.enum(USAGES)).max(USAGES.length).optional(),
    commande: CommandeSchema.optional(),
  })
  .strict();
export type ContextRequest = z.infer<typeof ContextRequestSchema>;
export const ContextResponseSchema = z.object({ texte: z.string() });
export type ContextResponse = z.infer<typeof ContextResponseSchema>;

// Les lectures (C9, C11, C12) : POST, pour que la branche et la requête n'aillent pas dans les journaux d'URL. Chaque corps
// porte les usages de l'outil : sans `lecture`, le serveur refuse. `session` et `outil` vont au journal des lectures
// quand ils sont connus (D35) ; sans outil, la lecture vient de la CLI seule.
export const READ_BODY_MAX_BYTES = 4 * 1024;
const ReadBase = {
  projet: ProjectSchema,
  session: z.string().min(1).max(200).optional(),
  outil: z.enum(CODE_SESSION_KINDS).optional(),
  usages: z.array(z.enum(USAGES)).max(USAGES.length),
};
const Branche = z.string().min(1).max(200).nullable().optional(); // tête détachée : null
export const DossierRequestSchema = z.object({ ...ReadBase, branche: Branche }).strict();
export type DossierRequest = z.infer<typeof DossierRequestSchema>;
// Sans id : le fil de la branche.
export const FilRequestSchema = z
  .object({ ...ReadBase, id: z.uuid().optional(), branche: Branche })
  .strict();
export type FilRequest = z.infer<typeof FilRequestSchema>;
// `requete` n'a pas de borne propre, comme l'outil `search` : les 4 Kio du corps suffisent.
export const ChercherRequestSchema = z.object({ ...ReadBase, requete: z.string().min(1) }).strict();
export type ChercherRequest = z.infer<typeof ChercherRequestSchema>;
// L'historique d'un fil (C12) : sans `n`, ses versions lisibles ; avec `n`, le texte de l'une. Rien ne restaure par le
// poste (D33) : la restauration se fait sur le site (T55).
// `n` : borné à l'int4 de versions_memoire.n, sinon la requête échouerait en base au lieu de rendre le texte fixe.
export const VERSION_N_MAX = 2_147_483_647;
export const VersionsRequestSchema = z
  .object({ ...ReadBase, id: z.uuid(), n: z.number().int().min(1).max(VERSION_N_MAX).optional() })
  .strict();
export type VersionsRequest = z.infer<typeof VersionsRequestSchema>;
// Les leçons (C13) : sans `id`, les leçons lisibles et non retirées du dépôt et sans dépôt ; avec `id`, une leçon. Aucun
// champ n'écrit, ne corrige, ne retire ni ne restaure : cela se fait sur le site seulement (D37).
export const LeconsRequestSchema = z.object({ ...ReadBase, id: z.uuid().optional() }).strict();
export type LeconsRequest = z.infer<typeof LeconsRequestSchema>;
// Le rendu gardé (D25), le même que celui du MCP.
export const ReadResponseSchema = z.object({ texte: z.string() });
export type ReadResponse = z.infer<typeof ReadResponseSchema>;

// Le rappel à chaque message (C8, D26) : les 2 000 premiers caractères du message, masqués sur le poste, contre une
// ligne de clés balisée, ou un texte vide. Sans `rappel` dans `usages`, vide sans aucune recherche. 16 Kio : un message
// de 2 000 caractères peut peser 8 Kio en JSON. `branche` départage deux fils à égalité ; `outil` ne sert qu'au
// compteur. Un serveur ancien répond 404 : la CLI ne sort rien, avec le code 0.
export const RAPPEL_BODY_MAX_BYTES = 16 * 1024;
export const RAPPEL_MESSAGE_MAX = 2000;
export const RappelRequestSchema = z
  .object({
    projet: ProjectSchema,
    branche: z.string().min(1).max(200).nullable(), // tête détachée : null
    session: z.string().min(1).max(200),
    message: z.string().max(RAPPEL_MESSAGE_MAX),
    outil: z.enum(CODE_SESSION_KINDS),
    usages: z.array(z.enum(USAGES)).max(USAGES.length),
  })
  .strict();
export type RappelRequest = z.infer<typeof RappelRequestSchema>;
export const RappelResponseSchema = z.object({ texte: z.string() });
export type RappelResponse = z.infer<typeof RappelResponseSchema>;
