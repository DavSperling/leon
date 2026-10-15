import { ConnectorAuthError } from '../http';
import { type HubspotClient, SEARCH_PAGES_MAX } from './client';
import { type EngagementSpec, type Linked, modifiedAt } from './map';
import type { EngagementType, Hit, LinkedKind } from './schemas';

// La lecture de HubSpot : la recherche par pages et les fiches liées (entreprise, affaire, contact).

// Une ressource secondaire refusée (portée manquante) : l'élément sort sans elle. Seule la recherche
// elle-même fait remonter le refus.
export async function optional<T>(
  load: () => Promise<T>,
  fallback: T,
  statuses: number[] = [403],
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    const refused = error instanceof ConnectorAuthError && statuses.includes(error.status ?? 0);
    if (refused) return fallback;
    throw error;
  }
}

export function once<T>(load: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | undefined;
  return () => {
    loading ??= load();
    return loading;
  };
}

// Les pages de la recherche, avec l'instant de la dernière fiche lue. La recherche de HubSpot
// s'arrête à 10 000 résultats : après 100 pages, on la relance à la date de la dernière fiche lue
// (et on s'arrête si cette date n'a pas avancé, faute de pouvoir progresser).
export async function* searchPages(
  hubspot: HubspotClient,
  spec: EngagementSpec,
  from: number,
): AsyncGenerator<{ hits: Hit[]; reached: number }> {
  let start = from;
  for (;;) {
    let after: string | undefined;
    let reached = start;
    for (let page = 0; page < SEARCH_PAGES_MAX; page++) {
      const reply = await hubspot.search(spec.type, spec.properties, { from: start, after });
      const last = reply.results.at(-1);
      if (!last) return;
      reached = modifiedAt(last);
      yield { hits: reply.results, reached };
      after = reply.paging?.next?.after;
      if (!after) return;
    }
    if (reached <= start) return;
    start = reached;
  }
}

const LINKED_KINDS: LinkedKind[] = ['companies', 'deals', 'contacts'];

// Pour chaque activité, la fiche liée qui sert de titre : l'entreprise, à défaut l'affaire, à défaut
// le contact. Les genres suivants ne sont demandés que pour les activités encore sans fiche.
export async function linkedRecords(
  hubspot: HubspotClient,
  type: EngagementType,
  ids: string[],
): Promise<Map<string, Linked>> {
  const found = new Map<string, Linked>();
  for (const kind of LINKED_KINDS) {
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length === 0) break;
    const links = await optional(
      () => hubspot.linked(type, kind, missing),
      new Map<string, string>(),
    );
    if (links.size === 0) continue;
    const targets = [...new Set(links.values())];
    const names = await optional(() => hubspot.names(kind, targets), new Map<string, string>());
    for (const [id, target] of links) {
      const name = names.get(target);
      if (name) found.set(id, { kind, name });
    }
  }
  return found;
}
