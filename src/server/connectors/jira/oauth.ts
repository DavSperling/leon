import { z } from 'zod';
import { ConnectorAuthError } from '../http';
import type { OAuthSpec } from '../types';
import { CLOUD_ID_PATTERN } from './access';

// Le bouton « Se connecter avec Atlassian », partagé par Jira et Confluence : une seule appli, donc une
// seule adresse de retour (une appli Atlassian n'en a qu'une). `atlassianOAuth(droits)` ne change que les
// droits demandés ; le produit est celui du connecteur qui l'appelle.
//
// Doc lue le 15/10/2026 :
//   https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
//     autorisation https://auth.atlassian.com/authorize (audience=api.atlassian.com, prompt=consent,
//     droits séparés par une espace, offline_access pour le jeton de rafraîchissement), jeton
//     https://auth.atlassian.com/oauth/token (corps JSON, secret avec les paramètres), PKCE non
//     documenté : non utilisé. Jeton de rafraîchissement tournant : le nouveau remplace l'ancien, qui
//     reste accepté 10 minutes ; il expire après 90 jours sans usage.
//   https://api.atlassian.com/oauth/token/accessible-resources : les sites auxquels le jeton donne accès
//     ({ id, url, name, scopes }) ; « l'id n'est pas unique d'un conteneur à l'autre » : un site qui
//     porte Jira et Confluence revient avec le même id, une fois par produit, d'où le tri par droits.
//   https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json et
//   https://dac-static.atlassian.com/cloud/confluence/openapi-v2.v3.json (droits de chaque opération)
// Appels : https://api.atlassian.com/ex/jira/<cloudId>/… et …/ex/confluence/<cloudId>/…
//
// Non vérifié : que `scopes` d'une ressource liste les droits fins de Confluence tels qu'on les
// demande (on garde une ressource qui en porte au moins un) ; la forme du lien de page suivante de
// Confluence quand l'appel passe par la passerelle (voir confluence/client.ts) ; un essai en réel.

const RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

// Seule la forme est lue ici : `id` et `url` sont revérifiés plus bas, ligne par ligne.
const ResourcesSchema = z.array(
  z.object({
    id: z.string(),
    url: z.string(),
    scopes: z.array(z.string()).default([]),
  }),
);

const SITE_URL = /^https:\/\/([a-z0-9][a-z0-9-]{0,62})\.atlassian\.net\/?$/i;

type Site = { cloudId: string; site: string };

// Les sites qui portent le produit (au moins un de ses droits), sans doublon d'identifiant.
function sitesWith(resources: z.infer<typeof ResourcesSchema>, scopes: string[]): Site[] {
  const wanted = scopes.filter((scope) => scope !== 'offline_access');
  const sites = new Map<string, Site>();
  for (const { id, url, scopes: granted } of resources) {
    const site = SITE_URL.exec(url)?.[1]?.toLowerCase();
    if (!site || !CLOUD_ID_PATTERN.test(id) || sites.has(id)) continue;
    if (granted.some((scope) => wanted.includes(scope))) sites.set(id, { cloudId: id, site });
  }
  return [...sites.values()];
}

export function atlassianOAuth(scopes: string[]): OAuthSpec {
  return {
    appKey: 'ATLASSIAN',
    authorizeUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    scopes,
    pkce: false,
    clientAuth: 'body',
    tokenBody: 'json',
    extraAuthorizeParams: { audience: 'api.atlassian.com', prompt: 'consent' },
    preFields: ['site'],
    setupHosts: ['api.atlassian.com'],

    // Le site saisi avant le clic s'il existe, sinon le premier ; les autres sont comptés pour le dire.
    async toConfig(tokens, preFields, http) {
      const request = {
        url: RESOURCES_URL,
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      };
      const sites = sitesWith(await http.json(request, ResourcesSchema), scopes);
      const chosen = sites.find((candidate) => candidate.site === preFields.site) ?? sites[0];
      if (!chosen) throw new ConnectorAuthError('Atlassian', 403);
      return { cloudId: chosen.cloudId, site: chosen.site, otherSites: sites.length - 1 };
    },
  };
}
