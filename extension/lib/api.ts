import { API_PATHS } from '../../src/capture/api-contract';
import type { IngestPayload } from '../../src/capture/turn';
import { serverUrlFromEnv } from './permissions';

export const SERVER_URL = serverUrlFromEnv(import.meta.env.WXT_PUBLIC_LEON_URL);

const TIMEOUT_MS = 15_000;

// Seule adresse appelée par l'extension : SERVER_URL (host_permissions).
function request(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(new URL(path, SERVER_URL), {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export function postIngest(token: string, payload: IngestPayload): Promise<Response> {
  return request(API_PATHS.ingest, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function getMe(token: string): Promise<Response> {
  return request(API_PATHS.me, token);
}

export function getBriefing(token: string): Promise<Response> {
  return request(API_PATHS.briefing, token);
}
