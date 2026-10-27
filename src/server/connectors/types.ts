import type { z } from 'zod';
import type { AuthorSide, ItemNature, ProviderId } from '@/capture/turn';
import type { ConnectorHttp } from './http';
import type { OAuthAppKey } from './oauth-env';

// Le contrat d'un connecteur : un module sans base ni état, qui rend des éléments normalisés.
// Le socle (chiffrement, relève, normalisation, ingestion) fait tout le reste.

// La nature d'un élément se définit dans la capture (ITEM_NATURES) ; on la réexporte pour les connecteurs.
export type { ItemNature };

export type ConnectorTurn = {
  externalId: string; // stable, sans empreinte : « body », « comment:456 »
  role: 'document' | 'participant';
  author: { name: string | null; email: string | null };
  // Du côté de qui parle l'auteur, lu dans un champ de l'outil (rôle de l'utilisateur, expéditeur, lien
  // avec le dépôt…) et jamais déduit d'un nom ni d'un texte : un client peut se nommer comme on veut et
  // recopier « [Note interne] ». Absent quand l'outil ne le dit pas. Gardé tel quel sur le tour
  // (author_side), pour la recherche et pour les droits à venir.
  side?: AuthorSide;
  // Une note que seule l'équipe voit (le client ne l'a pas lue). Un attribut du tour, pas une marque
  // dans le texte : le texte d'un client peut imiter n'importe quelle marque.
  internalNote?: boolean;
  text: string; // texte brut (HTML déjà passé par htmlToText)
  // ISO 8601. Tour document : updatedAt de l'élément (l'état décrit vaut à cette date ; un corps
  // modifié donne un tour daté de la modification). Commentaire ou prise de parole : sa propre date.
  ts: string;
};

export type ConnectorItem = {
  externalId: string; // ≤ 200 caractères, stable : « issue:acme/leon#12 »
  nature: ItemNature;
  title: string; // ≤ 300 caractères
  url: string | null;
  updatedAt: string; // ISO 8601
  origin: Record<string, string>; // { repo: 'acme/leon' }, { workspace: 'Acme', project: 'Site' }
  turns: ConnectorTurn[]; // ordre chronologique
};

export type SyncState = { cursor: string | null; since: Date };
// `removed` : les externalId d'éléments déjà relevés à retirer (un événement d'agenda devenu privé).
export type SyncPage = { items: ConnectorItem[]; cursor: string; removed?: string[] };

// Les jetons rendus par l'éditeur ; `raw` est sa réponse privée de access_token, refresh_token et id_token.
export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null; // ISO 8601
  scope: string | null;
  raw: Record<string, unknown>;
};

// Le bouton « Se connecter avec… » d'un connecteur : tout ce que le socle OAuth doit savoir de l'éditeur.
export type OAuthSpec = {
  appKey: OAuthAppKey; // 'GITHUB', 'ATLASSIAN'… : les variables LEON_OAUTH_<APPLI>_*
  authorizeUrl: string; // https, hôte fixe
  tokenUrl: string; // https, hôte fixe
  scopes: string[]; // [] : aucun paramètre scope
  scopeSeparator?: ' ' | ','; // ' ' par défaut
  pkce: boolean; // S256
  clientAuth: 'body' | 'basic'; // identifiant et secret avec les autres paramètres, ou en Basic
  tokenBody?: 'form' | 'json' | 'query'; // 'form' par défaut ; 'query' : paramètres d'adresse, corps vide
  extraAuthorizeParams?: Record<string, string>;
  // Ajoutés à l'échange du code et au renouvellement.
  extraTokenParams?: { code?: Record<string, string>; refresh?: Record<string, string> };
  preFields: string[]; // champs non secrets demandés avant le clic : clés du configSchema
  setupHosts: string[]; // hôtes exacts que toConfig peut appeler ; [] s'il n'appelle rien
  // Refus faute d'accord de l'administrateur (Microsoft), et lien pour le donner.
  adminConsent?: {
    isConsentError(input: { error: string; description: string | null }): boolean;
    url(clientId: string, redirectUri: string): string;
  };
  // Après le branchement : une page de l'outil où envoyer l'utilisateur au lieu de revenir à Leon
  // (l'installation de l'appli GitHub quand elle n'ouvre encore aucun dépôt), ou null.
  nextStep?(config: Record<string, unknown>, http: ConnectorHttp): Promise<string | null>;
  // Champs propres à l'outil (cloudId, site, compte…), à partir des jetons et des champs saisis avant le clic.
  toConfig(
    tokens: OAuthTokens,
    preFields: Record<string, unknown>,
    http: ConnectorHttp,
  ): Promise<Record<string, unknown>>;
};

// Syntaxe de méthode, exprès : elle rend un Connector<Config> assignable à AnyConnector.
export type Connector<Config> = {
  id: ProviderId;
  configSchema: z.ZodType<Config>; // tous les champs, secrets compris ; un z.object, sans .transform
  secretFields: readonly string[]; // noms des champs à chiffrer
  hosts(config: Config): string[]; // hôtes exacts autorisés, ex. ['api.github.com']
  minIntervalMs?: number; // écart minimal entre deux requêtes (Notion : 350)
  // Texte brut privé à celui qui branche, comme une conversation (boîte mail personnelle).
  // Absent : visible de l'équipe.
  privateRaw?: boolean;
  // `account` : le libellé affiché. `accountKey` : l'identifiant stable du compte (et de l'espace ou du
  // site), lu dans une réponse déjà demandée ; « Reconnecter » le compare. Absent quand l'outil n'en dit rien.
  verify(config: Config, http: ConnectorHttp): Promise<{ account: string; accountKey?: string }>;
  sync(config: Config, state: SyncState, http: ConnectorHttp): AsyncIterable<SyncPage>;
  oauth?: OAuthSpec; // le bouton ; absent : l'outil ne se branche que par clé
  // Le bouton passe par Pipedream Connect (pipedream.ts) : `app` est le nom de l'appli chez Pipedream.
  // La configuration est alors PipedreamConfigSchema, et chaque requête passe par son proxy.
  pipedream?: { app: string };
};
export type AnyConnector = Connector<Record<string, unknown>>;

// La partie publique d'un connecteur, lue par l'interface (aucun code serveur).
export type CatalogField = {
  name: string; // = clé du configSchema
  label: string; // « Clé d'API », « Site Atlassian »
  kind: 'secret' | 'text' | 'list' | 'select'; // list = une valeur par ligne
  placeholder?: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
};
export type CatalogEntry = {
  id: ProviderId;
  fields: CatalogField[];
  keyHelp: string; // « Dans Linear : Réglages › Sécurité et accès › Clés d'API personnelles. »
  docsUrl: string; // page officielle qui explique la clé
  triedForReal: boolean; // false tant qu'Amos ou David ne l'a pas branché
  oauthHelp?: string; // ce que l'utilisateur verra chez l'éditeur ; exigé quand le connecteur a `oauth`
  keyAccepted?: boolean; // faux pour un outil qui ne se branche que par bouton ; absent = vrai
  warning?: string; // « Plan Business requis », « Conditions à faire confirmer »
  // Le jumeau anglais de chaque texte ci-dessus (listCatalog le sert quand l'interface est en anglais,
  // et ne l'envoie jamais au navigateur). Les champs sont clés par `name`, les options par `value` ;
  // `help`, `oauthHelp` et `warning` n'existent ici que s'ils existent en français. `placeholder` :
  // seulement pour un exemple écrit en français (« prenom@entreprise.fr »), sinon le français sert.
  en: CatalogEnglish;
};
export type CatalogEnglish = {
  fields: Record<
    string,
    { label: string; placeholder?: string; help?: string; options?: Record<string, string> }
  >;
  keyHelp: string;
  oauthHelp?: string;
  warning?: string;
};
