import { z } from 'zod';
import { ConnectorHttpError } from '../http';

// Ce que Jira et Confluence partagent pour se brancher : une clé (site, e-mail, jeton d'API, adresse du
// site) ou le bouton (jetons Atlassian, site choisi, appels par api.atlassian.com).

export const siteSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/);

// L'identifiant du site entre dans le chemin des appels : rien d'autre que des lettres, chiffres, tirets.
export const CLOUD_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

// Les champs du bouton, à côté de ceux de la clé. Les jetons ne sont jamais dans `secretFields` du
// connecteur : le socle les chiffre à part.
export const oauthShape = {
  authMode: z.enum(['key', 'oauth']).default('key'), // une connexion existante, sans authMode, est à clé
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  cloudId: z.string().regex(CLOUD_ID_PATTERN).optional(),
  otherSites: z.number().int().min(0).max(1000).optional(), // les autres sites que le compte aurait pu choisir
};

export type AtlassianConfig = {
  authMode: 'key' | 'oauth';
  site?: string;
  email?: string;
  apiToken?: string;
  accessToken?: string;
  cloudId?: string;
  otherSites?: number;
};

const REQUIRED = {
  key: ['site', 'email', 'apiToken'],
  oauth: ['site', 'accessToken', 'cloudId'],
} as const;

// Chaque forme exige ses champs (le schéma reste un z.object : le catalogue lit sa forme).
export function requireFields(config: AtlassianConfig, ctx: z.RefinementCtx): void {
  for (const name of REQUIRED[config.authMode]) {
    if (!config[name]) ctx.addIssue({ code: 'custom', path: [name], message: 'Requis' });
  }
}

export const atlassianHosts = (config: AtlassianConfig): string[] =>
  config.authMode === 'oauth' ? ['api.atlassian.com'] : [`${config.site}.atlassian.net`];

export type AtlassianAccess = {
  site: string; // le sous-domaine : l'adresse web des éléments
  root: string; // l'adresse à laquelle s'ajoutent /rest/api/3 (Jira) ou /wiki (Confluence)
  prefix: string; // le début du chemin quand l'appel passe par api.atlassian.com, sinon vide
  authorization: string;
};

const incomplete = () => new ConnectorHttpError(null, 'Configuration incomplète');

// Où et comment appeler le produit : l'adresse du site avec une clé, la passerelle avec le bouton.
export function atlassianAccess(
  config: AtlassianConfig,
  product: 'jira' | 'confluence',
): AtlassianAccess {
  const { site } = config;
  if (!site) throw incomplete();
  if (config.authMode === 'oauth') {
    if (!config.accessToken || !config.cloudId) throw incomplete();
    const prefix = `/ex/${product}/${config.cloudId}`;
    return {
      site,
      root: `https://api.atlassian.com${prefix}`,
      prefix,
      authorization: `Bearer ${config.accessToken}`,
    };
  }
  if (!config.email || !config.apiToken) throw incomplete();
  const credentials = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  return {
    site,
    root: `https://${site}.atlassian.net`,
    prefix: '',
    authorization: `Basic ${credentials}`,
  };
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

// Le compte affiché d'une connexion par bouton : le site, et les autres que le compte pouvait choisir.
export function oauthAccount(config: AtlassianConfig): string {
  const others = config.otherSites ?? 0;
  const more =
    others > 0
      ? `, ${others} ${plural(others, 'autre site disponible', 'autres sites disponibles')}`
      : '';
  return `Connecté : ${config.site}.atlassian.net${more}`;
}
