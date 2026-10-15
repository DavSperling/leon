import { expect } from 'vitest';
import type { ProviderId } from '@/capture/turn';
import { type ConnectorHttp, createConnectorHttp } from '@/server/connectors/http';
import type { SyncPage } from '@/server/connectors/types';

export type FakeRoute = {
  method?: 'GET' | 'POST';
  // Une chaîne vaut l'adresse complète ou l'adresse sans sa chaîne de requête.
  url: string | RegExp;
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
};

// Les noms d'en-tête sont en minuscules ; body est le JSON envoyé, déjà relu.
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

function matches(route: FakeRoute, call: FakeCall): boolean {
  if ((route.method ?? 'GET') !== call.method) return false;
  if (route.url instanceof RegExp) return route.url.test(call.url);
  return route.url === call.url || route.url === call.url.split('?')[0];
}

function respond(route: FakeRoute): Response {
  const headers = new Headers(route.headers);
  if (route.json !== undefined) headers.set('content-type', 'application/json');
  const body = route.json !== undefined ? JSON.stringify(route.json) : (route.text ?? '');
  return new Response(body, { status: route.status ?? 200, headers });
}

// Une route sert une fois, puis laisse la place à la suivante qui correspond.
// Une requête sans route reçoit un 599 et fait échouer le test (sans lever : le code testé
// pourrait avaler l'erreur).
export function fakeFetch(routes: FakeRoute[]): typeof fetch & { calls: FakeCall[] } {
  const pending = [...routes];
  const calls: FakeCall[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const raw = typeof init?.body === 'string' ? init.body : undefined;
    const call: FakeCall = {
      method: init?.method ?? 'GET',
      url: requestUrl(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: raw === undefined ? undefined : JSON.parse(raw),
    };
    calls.push(call);
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

// Un client HTTP de connecteur branché sur de fausses routes, sans attente entre les reprises.
export function testHttp(
  provider: ProviderId,
  hosts: string[],
  routes: FakeRoute[],
): { http: ConnectorHttp; calls: FakeCall[] } {
  const fetchImpl = fakeFetch(routes);
  const http = createConnectorHttp({ provider, hosts, fetchImpl, sleep: async () => {} });
  return { http, calls: fetchImpl.calls };
}

export async function collect(iterable: AsyncIterable<SyncPage>): Promise<SyncPage[]> {
  const pages: SyncPage[] = [];
  for await (const page of iterable) pages.push(page);
  return pages;
}
