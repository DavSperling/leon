import { z } from 'zod';
import { ConnectorAuthError } from '../http';
import {
  atlassianHosts,
  oauthAccount,
  oauthShape,
  requireFields,
  siteSchema,
} from '../jira/access';
import { atlassianOAuth } from '../jira/oauth';
import type { Connector, ConnectorItem } from '../types';
import { markAfter, pagesSince, readMark } from './changes';
import { createApi, fetchMe } from './client';
import { createDirectory } from './directory';
import { accountIdsOf, pageToItem, spaceIdsOf } from './map';
import { type Loaded, readPage } from './read';

// Confluence Cloud : pages (corps au format de stockage, converti en texte) et commentaires de pied de page.
//
// Doc lue le 15/10/2026 :
//   https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/ et son OpenAPI
//     https://dac-static.atlassian.com/cloud/confluence/openapi-v2.v3.json (pages, commentaires,
//     espaces, users-bulk, pagination par l'en-tête Link, tri `modified-date`, `body-format`)
//   https://dac-static.atlassian.com/cloud/confluence/swagger.v3.json (API v1 : user/current)
//   https://developer.atlassian.com/cloud/confluence/basic-auth-for-rest-apis/ (Basic e-mail:jeton)
//   https://developer.atlassian.com/cloud/confluence/rate-limiting/ (429 et Retry-After)
//   https://developer.atlassian.com/cloud/confluence/advanced-searching-using-cql/ (dates CQL)
//   https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html
//   https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/
//
// Choix. L'API v2 trie par `modified-date` mais n'a pas de filtre « modifié depuis » : voir
// changes.ts. La recherche CQL aurait un filtre, mais ses dates sont à la minute et dans le fuseau
// (inconnu) du compte ; la v2 donne des instants exacts en UTC. Les pages sont lues une à une (le corps
// de plusieurs pages en une requête peut échouer, d'après le forum des développeurs). Une page retirée
// ou non lisible depuis la liste (404, 403) est sautée ; sans droit sur les commentaires (403) ou sur
// l'annuaire des personnes et des espaces, la page sort sans commentaires, sans nom, avec le numéro
// de l'espace. Une page sans texte ni commentaire n'est pas rendue. La date d'un commentaire est celle
// de sa dernière version (l'API ne donne pas celle de la création).
//
// Le bouton (OAuth, voir ../jira/oauth.ts) appelle les mêmes points d'accès par
// api.atlassian.com/ex/confluence/<cloudId>/wiki, en Bearer, avec les droits fins que l'OpenAPI v2 donne à
// chaque opération (lue le 15/10/2026) et read:confluence-user pour le compte courant (API v1).
//
// Non lu : les commentaires en ligne (sur un passage) ; les réponses au-delà de deux niveaux ; les
// pièces jointes, images, dessins ; les pages archivées ou en brouillon ; les blogs ; un commentaire
// ajouté à une page qui n'a pas changé (la date de modification de la page ne bouge pas : il n'entre
// qu'à la prochaine modification de la page) ; les mentions de personnes (le stockage donne un
// identifiant, parfois un ancien `userkey` que l'API v2 ne sait pas résoudre : le nom disparaît du
// texte).
// Non vérifié : un jeton d'API avec portées (il exige api.atlassian.com/ex/confluence/<cloudId> et non
// l'adresse du site : seul le jeton sans portées est pris en charge) ; la présence de `version` dans la
// liste des pages et le maintien du tri dans l'adresse de la page suivante (on remet les paramètres) ;
// le balisage exact des tâches, champs date et encarts du nouvel éditeur (ac:adf-*, dont le repli
// peut doubler un texte) ; le coût en points des requêtes (65 000 par heure d'après la doc) ; un essai
// en réel.

// Une clé (site, e-mail, jeton d'API) ou le bouton (jetons, site et identifiant du site choisis chez
// Atlassian) : `requireFields` exige les champs de la forme choisie par `authMode`.
const ConfigSchema = z
  .object({
    ...oauthShape,
    site: siteSchema.optional(),
    email: z.string().trim().pipe(z.email()).optional(),
    apiToken: z.string().trim().min(1).optional(),
  })
  .superRefine(requireFields);
type Config = z.infer<typeof ConfigSchema>;

// Pages lues avant d'enregistrer le curseur : un plantage refait au pire ce lot.
const PAGES_PER_BATCH = 10;

export const confluenceConnector: Connector<Config> = {
  id: 'confluence',
  configSchema: ConfigSchema,
  secretFields: ['apiToken'],
  hosts: atlassianHosts,
  minIntervalMs: 100,
  oauth: atlassianOAuth([
    'read:page:confluence',
    'read:comment:confluence',
    'read:space:confluence',
    'read:user:confluence',
    'read:confluence-user',
    'offline_access',
  ]),

  async verify(config, http) {
    const me = await fetchMe(createApi(http, config));
    // Sans identifiants valides, certains sites répondent 200 avec un visiteur anonyme.
    if (me.type === 'anonymous') throw new ConnectorAuthError('Confluence', 401);
    const key = me.accountId
      ? { accountKey: `${me.accountId}:${config.cloudId ?? config.site}` }
      : {};
    if (config.authMode === 'oauth') return { account: oauthAccount(config), ...key };
    const name = me.displayName?.trim() || me.publicName?.trim() || 'Compte Atlassian';
    return { account: `${name} (${config.site})`, ...key };
  },

  async *sync(config, state, http) {
    const api = createApi(http, config);
    const previous = readMark(state.cursor, state.since);
    const stubs = await pagesSince(api, previous);
    const directory = createDirectory(api);
    for (let start = 0; start < stubs.length; start += PAGES_PER_BATCH) {
      const end = Math.min(start + PAGES_PER_BATCH, stubs.length);
      const loaded: Loaded[] = [];
      for (const stub of stubs.slice(start, end)) {
        const read = await readPage(api, stub.id);
        if (read !== null) loaded.push(read);
      }
      await directory.learn(accountIdsOf(loaded), spaceIdsOf(loaded));
      const items = loaded
        .map((entry) => pageToItem(api.site, entry, directory))
        .filter((item): item is ConnectorItem => item !== null);
      yield { items, cursor: markAfter(stubs.slice(0, end), previous) };
    }
  },
};
