import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import { type Issue, type Note, type SentryClient, sentryClient } from './client';
import { advance, isDone, readCursor } from './cursor';
import { toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://docs.sentry.io/api/events/list-an-organizations-issues/ (GET /api/0/organizations/{org}/issues/ :
//     query, sort, limit ≤ 100, cursor, collapse ; portée event:read ; champs d'un problème)
//   https://docs.sentry.io/api/events/retrieve-an-issue/ (détail : numComments, activity)
//   https://docs.sentry.io/api/pagination/ (en-tête Link : rel, results="true|false", cursor)
//   https://docs.sentry.io/api/auth/ et https://docs.sentry.io/api/ (Bearer ; domaines us.sentry.io et de.sentry.io)
//   https://docs.sentry.io/api/ratelimits/ (limite par appelant et par point d'accès ; en-têtes X-Sentry-Rate-Limit-*)
//   https://docs.sentry.io/api/permissions/ (portée event:read)
//   https://docs.sentry.io/concepts/search/searchable-properties/issues/ (lastSeen:-2d, lastSeen:+30d, suffixes m h d w)
//   https://docs.sentry.io/organization/integrations/integration-platform/internal-integration/ (jeton qui n'expire pas)
//   https://sentry.io/legal/terms/ (§2.3 b : pas d'usage du service pour le compte de tiers)
//
// Écarts au plan, d'après la doc :
//   - La liste ne se trie que du plus récent au plus ancien (`sort=date`, « Last Seen », aucun sens
//     croissant). Un passage lit donc toutes les pages de sa fenêtre, trie ici par dernière occurrence
//     croissante, puis rend des pages de 50 problèmes avec leur curseur.
//   - Aucun filtre « modifié depuis » : seul `lastSeen` se filtre, et en relatif (`lastSeen:-14m`).
//     La fenêtre part du curseur (ou de `since`) avec deux minutes de marge ; le curseur écarte ce qui
//     est déjà rendu. Une requête non vide supprime le filtre « non résolus » par défaut.
//   - Aucune liste de commentaires n'est publiée (l'endpoint existe mais est « privé »). Les notes se
//     lisent dans `activity` du détail du problème (type « note »), une requête par problème qui a
//     `numComments` > 0 ; Sentry n'y donne que les 100 dernières activités. Un 403 ou un 404 sur le
//     détail laisse le problème sans notes.
//   - Le plan écrit `sentry.io` pour les États-Unis ; la doc nomme `us.sentry.io`. `sentry.io` reste
//     proposé comme le plan le dit.
//   - L'identifiant d'organisation accepte aussi « _ » (le plan n'autorise que « - »).
//   - La vérification ne lit pas l'organisation (GET /api/0/organizations/{org}/) : la page
//     https://docs.sentry.io/api/auth/ dit que « Retrieve an Organization » demande un jeton lié à un
//     compte d'utilisateur et non un jeton d'intégration interne, alors que la page de ce point d'accès
//     ne cite que les portées org:read, org:write et org:admin. La doc se contredit : seule la lecture
//     de la liste des problèmes (portée event:read) vérifie le jeton, et le compte affiché est
//     l'identifiant (slug) saisi.
//   - La page suivante est redemandée par son seul paramètre `cursor`, à l'hôte configuré : l'hôte
//     écrit dans l'en-tête Link n'est pas utilisé.
//
// Limites connues : un changement de statut, d'assignation ou une note ajoutée sans nouvel événement
// ne change pas `lastSeen` : il n'est relu qu'à l'événement suivant. Un problème qui reçoit un
// événement pendant la lecture des pages remonte en tête de liste, il est relu au passage suivant.
//
// Non vérifié (aucune clé réelle) :
//   - que `lastSeen:-Nm` accepte les minutes (la doc cite m, h, d, w pour `age`, et dit que `lastSeen`
//     fonctionne comme `age`) ; qu'aucune fenêtre par défaut (14 jours) ne s'applique sans `statsPeriod` ;
//   - que `collapse=stats` ne retire que la série `stats` (c'est ce que la doc dit) ;
//   - que `count` et `userCount` du premier niveau sont les totaux du problème et non ceux de la fenêtre ;
//   - la forme d'une note dans `activity` : `type: "note"` et `data.text` viennent du code ouvert de
//     Sentry, pas des pages de la doc (qui ne montrent que `first_seen`) ;
//   - les valeurs du statut (`unresolved`, `resolved`, `ignored`) : la doc ne les liste pas ;
//   - la limite de débit de la liste et du détail (la doc ne donne ni chiffre ni code 429) ;
//   - les noms des cases à cocher de l'intégration interne (la doc ne donne que les portées).

const REGIONS = ['sentry.io', 'de.sentry.io'] as const;

const ConfigSchema = z.object({
  token: z.string().trim().min(1).max(500),
  organization: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,100}$/),
  region: z.enum(REGIONS),
});
type Config = z.infer<typeof ConfigSchema>;

const PAGE_SIZE = 50; // problèmes par page rendue : chaque page peut coûter une requête de notes par problème
const WINDOW_MARGIN_MINUTES = 2;

// Un 403 ou un 404 sur le détail d'un problème (supprimé, fusionné, hors de portée) le laisse sans notes.
async function readNotes(client: SentryClient, issue: Issue): Promise<Note[]> {
  if (!issue.numComments) return [];
  try {
    return await client.notes(issue.id);
  } catch (error) {
    const denied = error instanceof ConnectorAuthError && error.status === 403;
    const missing = error instanceof ConnectorHttpError && error.status === 404;
    if (denied || missing) return [];
    throw error;
  }
}

const byLastSeen = (a: Issue, b: Issue) =>
  Date.parse(a.lastSeen) - Date.parse(b.lastSeen) ||
  a.id.localeCompare(b.id, 'en', { numeric: true });

// Tout ce qui a été vu depuis `from` et n'est pas déjà rendu, du plus ancien au plus récent.
async function collectIssues(
  client: SentryClient,
  from: number,
  mark: ReturnType<typeof readCursor>,
): Promise<Issue[]> {
  const minutes = Math.max(0, Math.ceil((Date.now() - from) / 60_000)) + WINDOW_MARGIN_MINUTES;
  const rows: Issue[] = [];
  for await (const page of client.issues(minutes)) {
    rows.push(...page.filter((row) => !isDone(mark, row)));
  }
  return rows.sort(byLastSeen);
}

async function* syncIssues(
  client: SentryClient,
  organization: string,
  state: SyncState,
): AsyncGenerator<SyncPage> {
  let mark = readCursor(state.cursor);
  const rows = await collectIssues(
    client,
    mark ? Date.parse(mark.at) : state.since.getTime(),
    mark,
  );
  for (let start = 0; start < rows.length; start += PAGE_SIZE) {
    const items: ConnectorItem[] = [];
    for (const row of rows.slice(start, start + PAGE_SIZE)) {
      items.push(toItem(organization, row, await readNotes(client, row)));
      mark = advance(mark, row);
    }
    yield { items, cursor: JSON.stringify(mark) };
  }
}

export const sentryConnector: Connector<Config> = {
  id: 'sentry',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: (config: Config) => [config.region],

  async verify(config: Config, http: ConnectorHttp) {
    await sentryClient(config, http).checkIssues();
    return { account: `organisation ${config.organization}` };
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncIssues(sentryClient(config, http), config.organization, state);
  },
};
