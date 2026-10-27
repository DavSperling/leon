import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import { type PipedriveClient, pipedriveClient } from './client';
import { activityToItem, noteToItem } from './map';
import type { Person } from './schemas';
import { freshRows, readCursor } from './stream';

// Doc lue le 15/10/2026 :
//   https://pipedrive.readme.io/docs/core-api-concepts-authentication (clé dans l'en-tête x-api-token,
//     adresse https://<entreprise>.pipedrive.com/api/…)
//   https://pipedrive.readme.io/docs/how-to-find-the-api-token (où trouver la clé)
//   https://pipedrive.readme.io/docs/core-api-concepts-pagination (rang `start` en v1, curseur en v2)
//   https://pipedrive.readme.io/docs/core-api-concepts-rate-limiting (budget quotidien de « jetons »
//     par forfait, rafale sur 2 secondes, 429 au-delà)
//   https://developers.pipedrive.com/docs/api/v1/openapi.yaml : GET /notes, GET /users, GET /users/me
//   https://developers.pipedrive.com/docs/api/v1/openapi-v2.yaml : GET /activities
//   https://developers.pipedrive.com/changelog/post/deprecated-apiv1-endpoints-become-out-of-support
// Choix qui précisent ou corrigent le plan, d'après la doc :
//   - l'adresse est celle de l'entreprise (<entreprise>.pipedrive.com), que la doc recommande pour
//     joindre le bon centre de données ; api.pipedrive.com n'est pas utilisée ;
//   - les activités se lisent en v2 : GET /v1/activities est hors support depuis le 1er août 2026 ;
//     les notes restent en v1 (GET /v1/notes n'est pas déprécié et n'a pas de pendant v2) ;
//   - une note comme une activité sort en un seul tour `document`. Une activité sans note ni
//     description n'est pas rendue (un rappel à faire n'apprend rien), pas plus qu'une note ou une
//     activité supprimée ;
//   - une activité ne porte ni nom d'auteur ni nom de fiche : l'auteur vient de la liste des
//     utilisateurs (un appel par passage, au premier besoin), la fiche reste un identifiant dans
//     `origin`. Les notes portent ces noms elles-mêmes ;
//   - les commentaires des notes ne sont pas lus (un appel par note, sur un budget quotidien serré) ;
//   - un 403 sur la liste des utilisateurs est attrapé : les activités sortent sans nom d'auteur.
//
// Non vérifié :
//   - que les dates de la v1 (« 2026-10-02 10:00:00 ») sont en UTC en lecture : la doc ne le dit que
//     pour l'écriture d'une note ;
//   - que le tri « update_time ASC,id ASC » est honoré (le tri par identifiant départage les
//     égalités) et que `updated_since` accepte une date sans millisecondes ;
//   - les adresses des fiches (/deal/<id>, /person/<id>, /organization/<id>), tirées du forum de
//     Pipedrive et non de la doc ;
//   - le code d'une entreprise mal orthographiée (404 ou redirection : les deux sont traités) ;
//   - l'en-tête x-ratelimit-reset de Pipedrive donne le temps restant, pas une date : le client HTTP
//     l'ignore et attend 2, 4 puis 8 secondes ; un budget quotidien épuisé répond 429 jusqu'à minuit
//     (heure du serveur de Pipedrive), la connexion repasse alors en erreur pour une heure ;
//   - l'accord de développeur de Pipedrive (appli privée « non commerciale », d'après le plan).

const ConfigSchema = z.object({
  // Un seul sous-domaine : ni point, ni chemin, ni port (l'adresse appelée est fixée par ce champ).
  company: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  token: z.string().trim().min(1).max(500),
});
type Config = z.infer<typeof ConfigSchema>;

// Pipedrive demande de l'ISO 8601 sans millisecondes : « 2025-01-01T10:20:00Z ».
const sinceText = (since: Date) => since.toISOString().replace(/\.\d{3}Z$/, 'Z');

// La liste des utilisateurs, lue au premier besoin et gardée le temps du passage. Interdite (403),
// elle reste vide : les activités sortent sans nom d'auteur.
function lazyPeople(client: PipedriveClient): () => Promise<Map<number, Person>> {
  let pending: Promise<Map<number, Person>> | undefined;
  return () => {
    pending ??= client.users().catch((error: unknown) => {
      if (error instanceof ConnectorAuthError && error.status === 403) return new Map();
      throw error;
    });
    return pending;
  };
}

// Les notes, puis les activités : chaque liste garde son repère dans le curseur.
async function* syncAll(
  client: PipedriveClient,
  company: string,
  state: SyncState,
): AsyncGenerator<SyncPage> {
  let cursor = readCursor(state.cursor);
  const from = sinceText(state.since);
  for await (const chunk of freshRows(client.notes, from, cursor.notes)) {
    cursor = { ...cursor, notes: chunk.mark };
    const items = chunk.rows.flatMap((note) => noteToItem(company, note) ?? []);
    yield { items, cursor: JSON.stringify(cursor) };
  }
  const people = lazyPeople(client);
  for await (const chunk of freshRows(client.activities, from, cursor.activities)) {
    cursor = { ...cursor, activities: chunk.mark };
    const items: ConnectorItem[] = [];
    for (const activity of chunk.rows) {
      const item = await activityToItem(company, activity, people);
      if (item) items.push(item);
    }
    yield { items, cursor: JSON.stringify(cursor) };
  }
}

// Une entreprise mal écrite répond 404 ou renvoie vers une page de connexion.
function isUnknownCompany(error: unknown): error is ConnectorHttpError {
  if (!(error instanceof ConnectorHttpError) || error.status === null) return false;
  return error.status === 404 || (error.status >= 300 && error.status < 400);
}

export const pipedriveConnector: Connector<Config> = {
  id: 'pipedrive',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: (config) => [`${config.company}.pipedrive.com`],

  async verify(config: Config, http: ConnectorHttp) {
    try {
      const { data } = await pipedriveClient(config, http).me();
      return { account: `${data.name || config.company} (${data.company_name || config.company})` };
    } catch (error) {
      if (!isUnknownCompany(error)) throw error;
      throw new ConnectorHttpError(
        error.status,
        'Pipedrive account not found: check the company name',
      );
    }
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncAll(pipedriveClient(config, http), config.company, state);
  },
};
