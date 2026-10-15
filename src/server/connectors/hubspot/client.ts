import type { z } from 'zod';
import type { ConnectorHttp } from '../http';
import {
  AccountReply,
  type EngagementType,
  type Hit,
  type LinkedKind,
  LinksReply,
  NamesReply,
  OwnersReply,
  type Person,
  SearchReply,
} from './schemas';

// Les requêtes vers l'API de HubSpot.

const VERSION = '2026-03'; // la dernière version datée publiée (les adresses /v3 et /v4 sont « héritées »)
const ROOT = 'https://api.hubapi.com';
export const PAGE_SIZE = 100;
export const SEARCH_PAGES_MAX = 100; // la recherche s'arrête à 10 000 résultats, soit 100 pages de 100
const OWNER_PAGES_MAX = 20;

const NAME_PROPERTIES: Record<LinkedKind, string[]> = {
  companies: ['name'],
  deals: ['dealname'],
  contacts: ['firstname', 'lastname', 'email'],
};

function displayName(kind: LinkedKind, properties: Hit['properties']): string | null {
  const text = (key: string) => properties[key]?.trim() || null;
  if (kind === 'companies') return text('name');
  if (kind === 'deals') return text('dealname');
  return [text('firstname'), text('lastname')].filter(Boolean).join(' ') || text('email');
}

export function hubspotClient(token: string, http: ConnectorHttp) {
  const headers = { Authorization: `Bearer ${token}` };
  const objects = (type: string) => `${ROOT}/crm/objects/${VERSION}/${type}`;
  const post = <T>(url: string, body: unknown, schema: z.ZodType<T>) =>
    http.json({ url, method: 'POST', headers, body }, schema);

  return {
    // Les fiches modifiées à partir de `from` (millisecondes), de la plus ancienne à la plus récente.
    search(
      type: EngagementType,
      properties: string[],
      input: { from: number; after?: string; limit?: number },
    ) {
      const filter = {
        propertyName: 'hs_lastmodifieddate',
        operator: 'GTE',
        value: `${input.from}`,
      };
      return post(
        `${objects(type)}/search`,
        {
          filterGroups: [{ filters: [filter] }],
          sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' }],
          properties,
          limit: input.limit ?? PAGE_SIZE,
          after: input.after,
        },
        SearchReply,
      );
    },

    // Pour chaque fiche, la première fiche liée du genre demandé (entreprise, affaire ou contact).
    async linked(
      type: EngagementType,
      kind: LinkedKind,
      ids: string[],
    ): Promise<Map<string, string>> {
      const url = `${ROOT}/crm/associations/${VERSION}/${type}/${kind}/batch/read`;
      const reply = await post(url, { inputs: ids.map((id) => ({ id })) }, LinksReply);
      const links = new Map<string, string>();
      for (const row of reply.results) if (row.to[0]) links.set(row.from.id, row.to[0].toObjectId);
      return links;
    },

    async names(kind: LinkedKind, ids: string[]): Promise<Map<string, string>> {
      const body = {
        inputs: ids.map((id) => ({ id })),
        properties: NAME_PROPERTIES[kind],
        propertiesWithHistory: [],
      };
      const reply = await post(`${objects(kind)}/batch/read`, body, NamesReply);
      const names = new Map<string, string>();
      for (const row of reply.results) {
        const name = displayName(kind, row.properties);
        if (name) names.set(row.id, name);
      }
      return names;
    },

    // Les propriétaires actifs, puis les archivés (un ancien collègue reste l'auteur de ses notes).
    async owners(): Promise<Map<string, Person>> {
      const owners = new Map<string, Person>();
      for (const archived of [false, true]) {
        let after: string | undefined;
        for (let page = 0; page < OWNER_PAGES_MAX; page++) {
          const query = { limit: PAGE_SIZE, after, archived };
          const reply = await http.json(
            { url: `${ROOT}/crm/owners/${VERSION}`, headers, query },
            OwnersReply,
          );
          for (const owner of reply.results) {
            const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
            owners.set(owner.id, { name: name || owner.email || null, email: owner.email ?? null });
          }
          after = reply.paging?.next?.after;
          if (!after) break;
        }
      }
      return owners;
    },

    async portalId(): Promise<number> {
      const reply = await http.json(
        { url: `${ROOT}/account-info/${VERSION}/details`, headers },
        AccountReply,
      );
      return reply.portalId;
    },
  };
}

export type HubspotClient = ReturnType<typeof hubspotClient>;
