import { z } from 'zod';
import { PROVIDER_LABELS } from '@/lib/providers';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';

// Les requêtes vers l'API de Help Scout et la forme des réponses lues (seulement les champs utiles).

const BASE = 'https://api.helpscout.net/v2';
const IsoDate = z.iso.datetime({ offset: true });

// Ce que les requêtes lisent de la configuration : l'identifiant et le secret de l'appli (clé
// collée), ou le jeton du bouton. Le schéma garantit les champs de la forme choisie.
export type Access = {
  authMode: 'key' | 'oauth';
  appId?: string;
  appSecret?: string;
  accessToken?: string;
};

const TokenSchema = z.object({ access_token: z.string().min(1) });
const UserSchema = z.object({
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  email: z.string().nullish(),
});

// Un client, un assigné ou l'auteur d'un fil : le prénom et le nom sont `first` et `last`. `type` dit
// « user » (l'équipe) ou « customer » (le client).
const PersonSchema = z
  .object({
    first: z.string().nullish(),
    last: z.string().nullish(),
    email: z.string().nullish(),
    type: z.string().nullish(),
  })
  .nullish()
  .catch(null);
export type Person = z.infer<typeof PersonSchema>;

// Un fil illisible est écarté (null) sans faire échouer la page entière.
const ThreadSchema = z
  .object({
    id: z.number(),
    type: z.string(),
    state: z.string().nullish(),
    body: z.string().nullish(),
    createdAt: IsoDate,
    createdBy: PersonSchema,
    customer: PersonSchema,
  })
  .nullable()
  .catch(null);
export type Thread = NonNullable<z.infer<typeof ThreadSchema>>;

const ConversationSchema = z.object({
  id: z.number(),
  number: z.number(),
  subject: z.string().nullish(),
  type: z.string().nullish(),
  status: z.string().nullish(),
  state: z.string().nullish(),
  mailboxId: z.number().nullish(),
  createdAt: IsoDate,
  closedAt: IsoDate.nullish().catch(null),
  userUpdatedAt: IsoDate.nullish().catch(null),
  assignee: PersonSchema,
  primaryCustomer: PersonSchema,
  tags: z
    .array(z.object({ tag: z.string() }))
    .nullish()
    .catch(null),
  _links: z
    .object({ web: z.object({ href: z.string() }).nullish() })
    .nullish()
    .catch(null),
  _embedded: z
    .object({ threads: z.array(ThreadSchema) })
    .nullish()
    .catch(null),
});
export type Conversation = z.infer<typeof ConversationSchema>;

// Sans conversation, Help Scout peut omettre `_embedded`.
const ListSchema = z.object({
  _embedded: z.object({ conversations: z.array(ConversationSchema) }).nullish(),
  page: z.object({ totalPages: z.number() }).nullish(),
});

export type ConversationsPage = { conversations: Conversation[]; totalPages: number | null };

// Le jeton se demande une fois par passage (il dure deux jours) et reste en mémoire. Help Scout ne
// documente pas l'erreur d'un identifiant refusé ; la norme OAuth 2 en fait un 400 (invalid_client).
async function requestToken(access: Access, http: ConnectorHttp): Promise<string> {
  try {
    const body = {
      grant_type: 'client_credentials',
      client_id: access.appId ?? '',
      client_secret: access.appSecret ?? '',
    };
    const answer = await http.json(
      { url: `${BASE}/oauth2/token`, method: 'POST', body },
      TokenSchema,
    );
    return answer.access_token;
  } catch (error) {
    if (error instanceof ConnectorHttpError && error.status === 400) {
      throw new ConnectorAuthError(PROVIDER_LABELS.helpscout, 400);
    }
    throw error;
  }
}

// Avec le bouton, le socle a déjà renouvelé le jeton avant le passage : il sert tel quel, sans appel
// pour en demander un. Un 401 remonte comme une clé refusée (le socle renouvelle alors une fois).
export async function helpscoutClient(access: Access, http: ConnectorHttp) {
  const token =
    access.authMode === 'oauth' ? (access.accessToken ?? '') : await requestToken(access, http);
  const headers = { authorization: `Bearer ${token}` };

  return {
    user: () => http.json({ url: `${BASE}/users/me`, headers }, UserSchema),

    // Une page de 25 conversations de tous statuts (par défaut, Help Scout ne rend que les
    // ouvertes), modifiées depuis `since`, de la plus ancienne à la plus récente, fils compris.
    async conversations(since: string, page: number): Promise<ConversationsPage> {
      const query = {
        status: 'all',
        modifiedSince: since,
        sortField: 'modifiedAt',
        sortOrder: 'asc',
        embed: 'threads',
        page,
      };
      const answer = await http.json({ url: `${BASE}/conversations`, headers, query }, ListSchema);
      return {
        conversations: answer._embedded?.conversations ?? [],
        totalPages: answer.page?.totalPages ?? null,
      };
    },
  };
}

export type HelpScoutClient = Awaited<ReturnType<typeof helpscoutClient>>;
