import { expect } from 'vitest';
import { type ConnectorHttp, createConnectorHttp } from '@/server/connectors/http';
import type { AnyConnector, SyncPage } from '@/server/connectors/types';
import { callProblems, loadVendorSpec, type VendorSpec } from './contracts/vendor-spec';

export type FakeRoute = {
  method?: 'GET' | 'POST' | 'DELETE';
  // Une chaîne vaut l'adresse complète ou l'adresse sans sa chaîne de requête.
  url: string | RegExp;
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
};

// Les noms d'en-tête sont en minuscules ; body est le JSON (ou le formulaire) envoyé, déjà relu, ou le
// texte d'un corps multipart.
export type FakeCall = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.toString() : input.url;
}

function parseBody(raw: string, contentType: string | undefined): unknown {
  if (contentType?.startsWith('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  if (contentType?.startsWith('multipart/')) return raw; // le lot de Gmail, gardé tel quel
  return JSON.parse(raw);
}

function matches(route: FakeRoute, call: FakeCall): boolean {
  if ((route.method ?? 'GET') !== call.method) return false;
  if (route.url instanceof RegExp) return route.url.test(call.url);
  return route.url === call.url || route.url === call.url.split('?')[0];
}

function respond(route: FakeRoute): Response {
  const headers = new Headers(route.headers);
  if (route.json !== undefined) headers.set('content-type', 'application/json');
  const status = route.status ?? 200;
  const body = route.json !== undefined ? JSON.stringify(route.json) : (route.text ?? '');
  // 204 et 304 n'ont jamais de corps : Response lève si on lui en donne un, même vide.
  return new Response(status === 204 || status === 304 ? null : body, { status, headers });
}

// Une route sert une fois, puis laisse la place à la suivante qui correspond.
// Une requête sans route reçoit un 599 et fait échouer le test (sans lever : le code testé
// pourrait avaler l'erreur). Avec `spec` (l'extrait de la spec officielle du fournisseur), une
// requête que la spec ne permet pas (chemin, paramètre, valeur, champ de corps) le fait échouer aussi.
export function fakeFetch(
  routes: FakeRoute[],
  spec?: VendorSpec,
): typeof fetch & { calls: FakeCall[] } {
  const pending = [...routes];
  const calls: FakeCall[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const raw = typeof init?.body === 'string' ? init.body : undefined;
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const call: FakeCall = {
      method: init?.method ?? 'GET',
      url: requestUrl(input),
      headers,
      body: raw === undefined ? undefined : parseBody(raw, headers['content-type']),
    };
    calls.push(call);
    if (spec) expect.soft(callProblems(spec, call), `${call.method} ${call.url}`).toEqual([]);
    const index = pending.findIndex((route) => matches(route, call));
    const route = pending[index];
    if (!route) {
      expect.soft(`${call.method} ${call.url}`, 'requête sans route').toBe('une route déclarée');
      return new Response('', { status: 599 });
    }
    pending.splice(index, 1);
    return respond(route);
  };
  return Object.assign(impl, { calls }) as typeof fetch & { calls: FakeCall[] };
}

// Un hôte exact, en minuscules : ni schéma, ni port, ni chemin, ni joker, ni point final.
const HOST_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

export function expectHostsWellFormed(hosts: string[]): void {
  expect(hosts.length, 'aucun hôte déclaré').toBeGreaterThan(0);
  for (const host of hosts) expect(host, 'hôte mal formé').toMatch(HOST_PATTERN);
}

// Un client HTTP branché sur de fausses routes, sans attente entre les reprises. Les hôtes viennent
// du connecteur, comme dans `runConnectorSync` (config validée par son schéma, puis `hosts`) : un
// hôte déclaré de travers ou une fixture qui pointe ailleurs fait échouer le test, comme en vrai.
export function testHttp(
  connector: AnyConnector,
  config: Record<string, unknown>,
  routes: FakeRoute[],
): { http: ConnectorHttp; calls: FakeCall[] } {
  const hosts = connector.hosts(connector.configSchema.parse(config));
  expectHostsWellFormed(hosts);
  const fetchImpl = fakeFetch(routes, loadVendorSpec(connector.id));
  const http = createConnectorHttp({
    provider: connector.id,
    hosts,
    fetchImpl,
    sleep: async () => {},
  });
  return { http, calls: fetchImpl.calls };
}

export async function collect(iterable: AsyncIterable<SyncPage>): Promise<SyncPage[]> {
  const pages: SyncPage[] = [];
  for await (const page of iterable) pages.push(page);
  return pages;
}
