import type { z } from 'zod';
import type { AuthorSide, ProviderId } from '@/capture/turn';
import type { ConnectorHttp } from './http';

// Le contrat d'un connecteur : un module sans base ni état, qui rend des éléments normalisés.
// Le socle (chiffrement, relève, normalisation, ingestion) fait tout le reste.

export type ItemNature = 'conversation' | 'reunion' | 'page' | 'ticket' | 'fil' | 'note';

export type ConnectorTurn = {
  externalId: string; // stable, sans empreinte : « body », « comment:456 »
  role: 'document' | 'participant';
  author: { name: string | null; email: string | null };
  // Du côté de qui parle l'auteur, lu dans un champ de l'outil (rôle de l'utilisateur, expéditeur, lien
  // avec le dépôt…) et jamais déduit d'un nom ni d'un texte : un client peut se nommer comme on veut et
  // recopier « [Note interne] ». Absent quand l'outil ne le dit pas. Un tour « external » ne donne
  // jamais un fait établi sur l'entreprise (voir le prompt d'extraction).
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
export type SyncPage = { items: ConnectorItem[]; cursor: string };

// Syntaxe de méthode, exprès : elle rend un Connector<Config> assignable à AnyConnector.
export type Connector<Config> = {
  id: ProviderId;
  configSchema: z.ZodType<Config>; // tous les champs, secrets compris ; un z.object, sans .transform
  secretFields: readonly string[]; // noms des champs à chiffrer
  hosts(config: Config): string[]; // hôtes exacts autorisés, ex. ['api.github.com']
  minIntervalMs?: number; // écart minimal entre deux requêtes (Notion : 350)
  verify(config: Config, http: ConnectorHttp): Promise<{ account: string }>;
  sync(config: Config, state: SyncState, http: ConnectorHttp): AsyncIterable<SyncPage>;
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
  warning?: string; // « Plan Business requis », « Conditions à faire confirmer »
};
