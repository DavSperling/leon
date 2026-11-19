import { z } from 'zod';
import type { ConnectorHttp } from '../http';
import type { Connector, SyncPage, SyncState } from '../types';
import { type HubspotClient, hubspotClient } from './client';
import { cursorAfter, readCursor, searchStart } from './cursor';
import { ENGAGEMENTS, readable, toItem } from './map';
import { hubspotOAuth } from './oauth';
import { linkedRecords, once, optional, searchPages } from './read';
import type { Person } from './schemas';

// Doc lue le 15/10/2026 (developers.hubspot.com) :
//   /docs/api-reference/search/guide (recherche CRM : filterGroups, sorts, properties, limit jusqu'à
//     200, after ; « limited to 10,000 total results » ; « five requests per second per account » ;
//     « It may take a few moments for newly created or updated CRM objects to appear »)
//   /docs/api-reference/2026-03/crm/activities/notes/search/search-notes (POST /crm/objects/2026-03/
//     notes/search ; calls, meetings et emails de même) et les guides notes, calls, meetings, emails
//     (propriétés hs_note_body, hs_call_title, hs_call_body, hs_meeting_title, hs_meeting_body,
//     hs_internal_meeting_notes, hs_email_subject, hs_email_text, hs_email_html, hs_email_headers,
//     hubspot_owner_id)
//   /docs/api-reference/2026-03/crm/owners/get-owners (GET /crm/owners/2026-03 : id, email,
//     firstName, lastName ; archived=true pour les archivés ; paging.next.after)
//   /docs/api-reference/2026-03/crm/associations/associate-records/batch/get-associations (POST
//     /crm/associations/2026-03/{de}/{vers}/batch/read : results[].from.id, to[].toObjectId)
//   /docs/api-reference/latest/crm/objects/companies/batch/get-companies (POST
//     /crm/objects/2026-03/{genre}/batch/read : inputs[].id, properties, propertiesWithHistory)
//   /docs/api-reference/2026-03/account/account-information/get-account-details (portalId)
//   /docs/developer-tooling/platform/usage-guidelines (appli privée : 100 requêtes par 10 s en
//     gratuit ou Starter, 190 en Professional et Enterprise ; 429 avec « policyName »)
//   /docs/apps/legacy-apps/private-apps/overview (Legacy apps › Create legacy app › Private ;
//     onglet Scopes, onglet Auth › Show token ; en-tête « Authorization: Bearer »)
// Lu le 05/11/2026 : /changelog/legacy-private-app-creation-sunset (plus aucune appli privée créée
//   depuis le 28/09/2026 pour les comptes récents, le 26/10/2026 pour les autres ; celles qui existent
//   « continue to work as-is ») ; /docs/apps/developer-platform/build-apps/authentication/
//   account-service-keys et /changelog/service-keys (la clé de service les remplace : même en-tête
//   « Authorization: Bearer pat-na1-… », mêmes limites que les applis privées, portées choisies à la
//   création parmi celles de son auteur ; réservée aux super administrateurs et à l'accès « Developer
//   tools » ; pas de webhooks, dont Leon ne se sert pas).
//   /docs/developer-tooling/platform/versioning (les adresses /v3 et /v4 restent « supportées » sans
//     date de fin ; HubSpot annonce que v4 devient « unsupported » le 30/03/2027)
// Le bouton « Se connecter avec HubSpot » (jeton OAuth, même en-tête « Bearer ») : voir oauth.ts.
//
// Écarts au plan, d'après la doc :
// - Les adresses sont celles de la version datée 2026-03 (/crm/objects/2026-03/…), pas /crm/v3/… : la doc
//   dit d'utiliser la dernière version datée pour un nouveau branchement.
// - La limite de la recherche est de 5 requêtes par seconde et par compte (les « 110 requêtes par 10 s »
//   du plan sont celles des applis publiques) : 250 ms entre deux requêtes.
// - Le texte d'un e-mail (hs_email_text) n'est pas passé par htmlToText, qui prendrait « <a@b.fr> »
//   pour une balise ; le HTML (hs_email_html) ne sert qu'à défaut de texte. Les notes internes d'une
//   réunion (hs_internal_meeting_notes) s'ajoutent à sa description.
// - Un e-mail est attribué à son expéditeur (hs_email_headers › from), pas au propriétaire de la fiche :
//   un mail reçu d'un client ne doit pas porter le nom d'un collègue. Sans en-têtes lisibles, c'est le
//   propriétaire.
// - Aucun lien vers l'original : la doc ne donne pas le format d'une adresse de fiche.
// - Le curseur recule de 5 minutes à la fin de la recherche de chaque sorte (cursor.ts) : la doc prévient
//   que la recherche indexe avec retard. En cours de route il reste exact, pour qu'un passage coupé à
//   200 éléments avance ; et il retient combien de sortes sont lues en entier dans le tour (`done`),
//   pour que la reprise ne relise pas leur fenêtre de recul avant d'atteindre les suivantes.
// Un 403 sur les propriétaires, les liens ou les noms est attrapé (portée manquante) : l'élément sort sans
// auteur ou sans fiche liée. Un 403 sur la recherche d'une sorte d'activité remonte : sinon des appels ou
// des e-mails manqueraient sans que personne le sache.
//
// Non vérifié (aucune clé réelle) : que le jeton d'une appli privée (« legacy app ») ou une clé de service
// passe sur les adresses datées (l'exemple de la doc des clés de service appelle /crm/v3) ; les portées exactes (la doc de chaque activité cite crm.objects.contacts.read, celle des
// e-mails sales-email-read en plus ; crm.objects.owners.read pour les propriétaires) ; que `sorts` accepte
// ASCENDING (la doc n'en montre que DESCENDING) ; que le filtre accepte des millisecondes en chaîne (la
// doc n'en montre qu'un exemple) ; la forme de hs_email_headers (la doc dit seulement qu'il porte
// l'expéditeur et les destinataires) ; qu'une modification du texte fait avancer hs_lastmodifieddate ;
// que le compte est lisible avec une clé collée (portée « oauth » dans la doc) ; qu'un
// propriétaire sans fiche (équipe, ancien compte) n'apparaît qu'en archivé ; le plafond de 100 fiches
// par lecture groupée (la doc ne le donne pas). Ni les pièces jointes ni les transcriptions d'appel ne
// sont lues.

// Deux façons de se brancher : la clé collée (`token` : clé de service, ou jeton d'appli privée
// d'avant leur fermeture, tous deux en « pat-… ») ou le bouton
// (`accessToken`, que le socle OAuth renouvelle). Une connexion enregistrée avant le bouton n'a pas
// d'`authMode` : c'est une clé. Un `z.object` raffiné : le catalogue lit `.shape`.
const ConfigSchema = z
  .object({
    authMode: z.enum(['key', 'oauth']).default('key'),
    token: z.string().trim().min(1).max(500).optional(),
    accessToken: z.string().min(1).optional(),
    refreshToken: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
  })
  .superRefine((config, ctx) => {
    const field = config.authMode === 'oauth' ? 'accessToken' : 'token';
    if (!config[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Required' });
  });
type Config = z.infer<typeof ConfigSchema>;

// Les deux jetons s'envoient pareil (« Authorization: Bearer »), seul le champ change.
const tokenOf = (config: Config): string =>
  (config.authMode === 'oauth' ? config.accessToken : config.token) ?? '';

async function* syncEngagements(
  hubspot: HubspotClient,
  state: SyncState,
): AsyncGenerator<SyncPage> {
  const cursor = readCursor(state.cursor);
  const owners = once(() => optional(() => hubspot.owners(), new Map<string, Person>()));
  for (const [index, spec] of ENGAGEMENTS.entries()) {
    if (index < (cursor.done ?? 0)) continue; // lue en entier avant l'arrêt du passage précédent
    const start = searchStart(cursor[spec.type], state.since);
    for await (const { hits, reached, last } of searchPages(hubspot, spec, start)) {
      cursor[spec.type] = cursorAfter(start, reached, last);
      cursor.done = last ? index + 1 : index;
      const rows = readable(spec, hits);
      const people = rows.length > 0 ? await owners() : new Map<string, Person>();
      const linked =
        rows.length > 0
          ? await linkedRecords(
              hubspot,
              spec.type,
              rows.map((r) => r.hit.id),
            )
          : new Map();
      const items = rows.map((row) => toItem(spec, row, people, linked.get(row.hit.id)));
      yield { items, cursor: JSON.stringify(cursor) };
    }
  }
  // Le tour est fini : le suivant reprendra chaque sorte à sa borne. Une page sans élément ne se rend
  // que si elle fait avancer le curseur.
  if (cursor.done !== undefined) {
    cursor.done = undefined;
    yield { items: [], cursor: JSON.stringify(cursor) };
  }
}

export const hubspotConnector: Connector<Config> = {
  id: 'hubspot',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['api.hubapi.com'],
  minIntervalMs: 250, // 5 recherches par seconde au plus

  // Une recherche par sorte d'activité : elle prouve que le jeton a toutes les portées utiles.
  async verify(config: Config, http: ConnectorHttp) {
    const hubspot = hubspotClient(tokenOf(config), http);
    for (const spec of ENGAGEMENTS) {
      await hubspot.search(spec.type, spec.properties, { from: Date.now(), limit: 1 });
    }
    // Le jeton a déjà fait ses preuves : un refus ici ne le met pas en cause.
    const portal = await optional(() => hubspot.portalId(), null, [401, 403]);
    if (portal === null) return { account: 'HubSpot' };
    return { account: `HubSpot account ${portal}`, accountKey: String(portal) };
  },

  sync(config: Config, state, http: ConnectorHttp) {
    return syncEngagements(hubspotClient(tokenOf(config), http), state);
  },

  oauth: hubspotOAuth,
};
