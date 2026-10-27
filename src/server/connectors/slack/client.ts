import { z } from 'zod';
import { PROVIDER_LABELS } from '@/lib/providers';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';

// Les requêtes vers l'API Web de Slack. Doc lue le 25/10/2026 :
//   https://api.slack.com/methods/auth.test
//   https://api.slack.com/methods/search.messages (jeton utilisateur, droit search:read ; count 100 au
//     plus, page 100 au plus ; sort=timestamp, sort_dir=asc)
//   https://api.slack.com/web#slack-web-api__evaluating-responses (réponse 200 avec ok: false)
// Pipedream ajoute le jeton utilisateur du compte (oauth_access_token), celui que ses propres actions de
// recherche utilisent (components/slack_v2/slack_v2.app.mjs, lu le 25/10/2026).

const SLACK = 'https://slack.com/api';
export const SEARCH_COUNT = 100;
export const SEARCH_PAGES_MAX = 100;

// Les erreurs qui disent « accès retiré ou insuffisant » : il faut reconnecter.
const AUTH_ERRORS = new Set([
  'invalid_auth',
  'not_authed',
  'token_revoked',
  'token_expired',
  'account_inactive',
  'no_permission',
  'missing_scope',
  'not_allowed_token_type',
]);

const Envelope = z.looseObject({ ok: z.boolean(), error: z.string().nullish() });

const AuthSchema = z.object({
  team: z.string().nullish(),
  user: z.string().nullish(),
  team_id: z.string(),
  user_id: z.string(),
});

const MatchSchema = z.object({
  ts: z.string().regex(/^\d{1,12}\.\d{1,8}$/),
  text: z.string().nullish(),
  user: z.string().nullish(),
  username: z.string().nullish(),
  permalink: z.string().nullish(),
  channel: z.object({
    id: z.string(),
    name: z.string().nullish(),
    is_im: z.boolean().nullish(),
    is_mpim: z.boolean().nullish(),
  }),
});
export type SlackMatch = z.infer<typeof MatchSchema>;

const SearchSchema = z.object({
  messages: z.object({
    matches: z.array(MatchSchema),
    paging: z.object({ pages: z.number().int() }).nullish(),
  }),
});

export function slackClient(http: ConnectorHttp) {
  async function call<T>(
    method: string,
    query: Record<string, string | number>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const answer = await http.json({ url: `${SLACK}/${method}`, query }, Envelope);
    if (!answer.ok) {
      const code = /^[a-z_]{1,60}$/.test(answer.error ?? '') ? (answer.error ?? '') : 'erreur';
      if (AUTH_ERRORS.has(code)) throw new ConnectorAuthError(PROVIDER_LABELS.slack, 403);
      if (code === 'ratelimited') throw new ConnectorHttpError(429, 'Slack rate limit reached');
      throw new ConnectorHttpError(null, `Slack responded with ${code}`);
    }
    const parsed = schema.safeParse(answer);
    if (!parsed.success) throw new ConnectorHttpError(200, 'Unexpected response');
    return parsed.data;
  }

  return {
    me() {
      return call('auth.test', {}, AuthSchema);
    },

    // Les messages postés depuis le jour `after` (exclu, dans le fuseau de l'utilisateur), du plus
    // ancien au plus récent, page par page.
    async *search(after: string): AsyncGenerator<SlackMatch[]> {
      for (let page = 1; page <= SEARCH_PAGES_MAX; page++) {
        const query = {
          query: `after:${after}`,
          sort: 'timestamp',
          sort_dir: 'asc',
          count: SEARCH_COUNT,
          page,
        };
        const { messages } = await call('search.messages', query, SearchSchema);
        yield messages.matches;
        if (page >= (messages.paging?.pages ?? 0) || messages.matches.length === 0) return;
      }
    },
  };
}
