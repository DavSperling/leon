import { z } from 'zod';
import { ConnectorAuthError, ConnectorHttpError } from '@/server/connectors/http';
import type { AnyConnector } from '@/server/connectors/types';

// Un connecteur factice à bouton (outil GitHub, comme son catalogue : champ avant le clic `repos`).
// Il accepte aussi la clé (`token`). `toConfigUrl` : adresse que `toConfig` appelle ; hors de
// `setupHosts` (vide), le client HTTP la refuse. `verifyFails` : `verify` lève un refus de clé.
// `account` : le compte que rend `verify` ; `repos` : ce que `toConfig` rend au lieu du champ saisi
// (un outil qui retombe sur un autre site, comme Jira) ; `accountKey` : l'identifiant stable du compte.
export function fakeOAuthConnector(
  options: {
    toConfigUrl?: string;
    verifyFails?: boolean;
    account?: string;
    accountKey?: string;
    repos?: string[];
    nextStep?: string | Error; // la page où enchaîner après le branchement, ou l'erreur qu'elle lève
  } = {},
): AnyConnector {
  const schema = z
    .object({
      authMode: z.enum(['key', 'oauth']).default('key'),
      token: z.string().min(1).optional(),
      accessToken: z.string().min(1).optional(),
      refreshToken: z.string().nullable().optional(),
      expiresAt: z.string().nullable().optional(),
      repos: z.array(z.string().min(1)).min(1),
    })
    .superRefine((config, ctx) => {
      const field = config.authMode === 'oauth' ? 'accessToken' : 'token';
      if (!config[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Requis' });
    });

  return {
    id: 'github',
    configSchema: schema,
    secretFields: ['token'],
    hosts: () => ['api.github.test'],
    verify: async () => {
      if (options.verifyFails) throw new ConnectorAuthError('GitHub', 401);
      const account = options.account ?? 'acme';
      return options.accountKey ? { account, accountKey: options.accountKey } : { account };
    },
    async *sync() {},
    oauth: {
      appKey: 'GITHUB',
      authorizeUrl: 'https://github.test/login/oauth/authorize',
      tokenUrl: 'https://github.test/login/oauth/access_token',
      scopes: [],
      pkce: false,
      clientAuth: 'body',
      preFields: ['repos'],
      setupHosts: [],
      ...(options.nextStep === undefined
        ? {}
        : {
            async nextStep() {
              if (options.nextStep instanceof Error) throw options.nextStep;
              return options.nextStep ?? null;
            },
          }),
      async toConfig(_tokens, preFields, http) {
        if (options.toConfigUrl) {
          await http.json({ url: options.toConfigUrl }, z.unknown()).catch((error: unknown) => {
            throw error instanceof ConnectorHttpError ? error : new Error('inattendu');
          });
        }
        return { repos: options.repos ?? preFields.repos };
      },
    },
  };
}
