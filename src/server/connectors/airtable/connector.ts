import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, SyncState } from '../types';
import { type AirtableClient, airtableClient } from './client';
import { syncBases } from './sync';

// Doc lue le 15/10/2026 (airtable.com/developers/web/api/) :
//   /authentication (jeton personnel, en-tête « Authorization: Bearer », créé sur airtable.com/create/tokens,
//     portées et bases choisies une à une), /list-records (POST /v0/{base}/{table}/listRecords ou GET ;
//     pageSize 100 au plus, offset, filterByFormula, recordMetadata=commentCount), /get-base-schema
//     (GET /v0/meta/bases/{base}/tables, portée schema.bases:read), /list-bases (GET /v0/meta/bases),
//     /get-user-id-scopes (GET /v0/meta/whoami : id, et e-mail avec la portée user.email:read),
//     /list-comments (GET /v0/{base}/{table}/{enregistrement}/comments, portée data.recordComments:read,
//     du plus récent au plus ancien), /field-model (forme de chaque type de cellule), /rate-limits
//     (5 requêtes par seconde et par base, 429 puis 30 secondes d'attente, pas de Retry-After),
//     /errors (403 : INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND ; 404 : NOT_FOUND).
//   support.airtable.com : LAST_MODIFIED_TIME() (dernière modification faite par un utilisateur dans
//     un champ non calculé), IS_AFTER.
//
// Écarts au plan, d'après la doc : Airtable ne rend la date de modification d'aucun enregistrement
// et ne trie pas dessus. On lit donc par fenêtres de 7 jours (cursor.ts) : un enregistrement est
// daté de la fin de sa fenêtre, jamais plus tôt que sa vraie modification (au plus 7 jours de trop
// lors du premier passage, quelques minutes ensuite). Les listes se demandent en POST (formule hors
// de l'adresse, tableaux en JSON). `recordMetadata` donne le nombre de commentaires : on ne lit
// que ceux des enregistrements qui en ont (tous, si la réponse ne l'annonce pas). Pages de 20
// enregistrements, soit 20 requêtes de commentaires au plus par page. Un 403 sur les commentaires
// (portée manquante) est attrapé : les enregistrements sortent sans eux, et on cesse de les demander
// pour le reste du passage. Seuls les 300 commentaires les plus récents d'un enregistrement sont lus.
//
// Limites : ajouter un commentaire ne change pas LAST_MODIFIED_TIME() : il n'est lu qu'à la prochaine
// modification de l'enregistrement. Un champ calculé qui change ne compte pas non plus. Une fenêtre
// interrompue (200 éléments) est relue en entier à la reprise. Le client HTTP attend 2, 4 puis 8
// secondes sur un 429, moins que les 30 secondes qu'Airtable demande : le rythme de 220 ms est là
// pour ne pas l'atteindre.
//
// Non vérifié (aucune clé réelle) : que la formule `IS_AFTER(LAST_MODIFIED_TIME(), "<date ISO>Z")`
// lise la date en UTC et à la milliseconde (exemple de la communauté Airtable, pas de la doc) ; que le
// corps de POST /listRecords reprenne le nom des paramètres, `recordMetadata` compris (la doc le dit
// sans l'illustrer) ; le nom `displayName` de l'objet `mentioned` d'un commentaire ; la forme des
// cellules de type lien rendues sans option (identifiants d'enregistrement : ignorés).

const ConfigSchema = z.object({
  token: z.string().trim().min(1).max(500),
  // Un identifiant de base (« app » et 14 caractères) : il entre dans l'adresse des requêtes.
  bases: z
    .array(
      z
        .string()
        .trim()
        .regex(/^app[A-Za-z0-9]{10,20}$/),
    )
    .min(1)
    .max(20),
});
type Config = z.infer<typeof ConfigSchema>;

// Une base que le jeton ne voit pas répond 403 (ou 404) : on dit laquelle.
async function checkBase(air: AirtableClient, baseId: string): Promise<void> {
  try {
    await air.tables(baseId);
  } catch (error) {
    const denied = error instanceof ConnectorAuthError && error.status === 403;
    const missing = error instanceof ConnectorHttpError && error.status === 404;
    if (denied || missing) {
      throw new ConnectorHttpError(null, `Base Airtable inaccessible : ${baseId}`);
    }
    throw error;
  }
}

export const airtableConnector: Connector<Config> = {
  id: 'airtable',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['api.airtable.com'],
  minIntervalMs: 220, // 5 requêtes par seconde et par base

  async verify(config: Config, http: ConnectorHttp) {
    const air = airtableClient(config.token, http);
    const me = await air.whoami();
    const names = await air.baseNames();
    for (const baseId of config.bases) await checkBase(air, baseId);
    const bases = config.bases.map((baseId) => names.get(baseId) ?? baseId).join(', ');
    return { account: `${me.email ?? me.id} (${bases})` };
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncBases(airtableClient(config.token, http), config.bases, state);
  },
};
