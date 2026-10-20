import { z } from 'zod';
import { PROVIDER_LABELS } from '@/lib/providers';
import { ConnectorAuthError } from '../http';
import type { OAuthSpec } from '../types';
import { USER_AGENT } from './client';

// Le bouton « Se connecter avec Basecamp ». Doc lue le 15/10/2026 :
//   https://github.com/basecamp/bc3-api/blob/master/sections/authentication.md  (le flux, la durée
//     des jetons, authorization.json) ; https://github.com/basecamp/bc3-api/blob/master/README.md
//     (User-Agent obligatoire, pagination, limite de 50 requêtes par 10 secondes) ;
//   https://github.com/basecamp/api/blob/master/sections/authentication.md  (Launchpad : les
//     exemples d'appel du jeton avec tous les paramètres dans l'adresse).
// Ce que dit la doc :
//   - l'appli se déclare sur https://launchpad.37signals.com/integrations (identifiant, secret,
//     une adresse de retour) ; autorisation `https://launchpad.37signals.com/authorization/new`
//     avec `response_type=code`, `client_id`, `redirect_uri` ; jeton
//     `POST https://launchpad.37signals.com/authorization/token` avec `grant_type=authorization_code`,
//     `client_id`, `client_secret`, `redirect_uri`, `code` ;
//   - jeton d'accès de 2 semaines (`expires_in` 1209600) ; renouvellement au même point d'accès avec
//     `grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret`, dont la réponse
//     « a le même format » que l'échange, nouveau `refresh_token` compris ;
//   - aucun droit à choisir : Launchpad ne connaît pas de portées, l'autorisation couvre le compte ;
//   - pas de PKCE ; `GET https://launchpad.37signals.com/authorization.json` (jeton en Bearer)
//     donne l'identité et les comptes ; on prend le premier de `product: "bc3"`, dont l'adresse est
//     `https://3.basecampapi.com/<id>`.
// Écarts avec le plan :
//   - ni `type=web_server` ni `type=refresh` : la doc du 15/10/2026 les dit « encore acceptés, mais
//     pas recommandés » et documente `response_type` et `grant_type`, que le socle envoie déjà ;
//   - la doc ne dit plus où mettre les paramètres de l'échange (« Required parameters »). On garde
//     `tokenBody: 'query'` du plan : c'est la seule forme que montre un exemple de Launchpad (les
//     paramètres en chaîne de requête d'un POST sans corps) ;
//   - la doc montre un nouveau jeton de rafraîchissement dans sa réponse (le plan disait qu'elle ne
//     le promettait pas) : le socle garde le nouveau, ou l'ancien si la réponse n'en porte pas.
//
// Non vérifié (aucune appli réelle) : que Launchpad accepte `grant_type` et `response_type` sans
// `type` ; qu'il lise les paramètres de l'échange dans l'adresse ; que l'ancien jeton de
// rafraîchissement cesse de valoir au renouvellement (le socle enregistre le nouveau avant le passage).

const AUTHORIZATION_URL = 'https://launchpad.37signals.com/authorization.json';
const ACCOUNT_NAME_MAX = 200;

const AuthorizationSchema = z.object({
  accounts: z.array(z.object({ product: z.string(), id: z.number(), name: z.string() })),
});

export const basecampOAuth: OAuthSpec = {
  appKey: 'BASECAMP',
  authorizeUrl: 'https://launchpad.37signals.com/authorization/new',
  tokenUrl: 'https://launchpad.37signals.com/authorization/token',
  scopes: [],
  pkce: false,
  clientAuth: 'body',
  tokenBody: 'query',
  preFields: [],
  setupHosts: ['launchpad.37signals.com'],

  // Le compte Basecamp à lire : l'identité de Launchpad peut en avoir plusieurs, et les anciennes
  // versions (`product` autre que « bc3 ») n'ont pas la même API.
  async toConfig(tokens, _preFields, http) {
    const { accounts } = await http.json(
      {
        url: AUTHORIZATION_URL,
        headers: { authorization: `Bearer ${tokens.accessToken}`, 'user-agent': USER_AGENT },
      },
      AuthorizationSchema,
    );
    const account = accounts.find((candidate) => candidate.product === 'bc3');
    if (!account) throw new ConnectorAuthError(PROVIDER_LABELS.basecamp);
    return {
      accountId: String(account.id),
      accountName: account.name.trim().slice(0, ACCOUNT_NAME_MAX) || String(account.id),
    };
  },
};
