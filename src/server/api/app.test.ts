import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as log from '@/server/log';
import { app, handleApiError } from './app';

afterEach(() => vi.restoreAllMocks());

describe('app', () => {
  it('répond à /api/health', async () => {
    const response = await app.request('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('répond 404 en JSON sur une route inconnue', async () => {
    const response = await app.request('/api/inconnu');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Introuvable' });
  });

  it('répond à /api/version avec le commit et les modèles de démarrage', async () => {
    // try/finally : une assertion qui échoue ne doit jamais laisser le global pollué pour la suite.
    const global = globalThis as {
      leonStartCommit?: string | null;
      leonStartLlm?: Record<string, string> | null;
    };
    const llm = {
      triage: 'anthropic:claude-haiku-5-5',
      extraction: 'openrouter:mistralai/mistral-large-4-0',
      placement: 'anthropic:claude-haiku-5-5',
    };
    global.leonStartCommit = 'a'.repeat(40);
    global.leonStartLlm = llm;
    try {
      const response = await app.request('/api/version');
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ commit: 'a'.repeat(40), llm });
    } finally {
      global.leonStartCommit = undefined;
      global.leonStartLlm = undefined;
    }
  });

  it('répond llm null sur /api/version tant que les modèles ne sont pas connus', async () => {
    const response = await app.request('/api/version');
    expect(await response.json()).toEqual({ commit: null, llm: null });
  });
});

describe('handleApiError', () => {
  const failing = (error: Error) =>
    new Hono().onError(handleApiError).get('/', () => {
      throw error;
    });

  it("garde le statut d'une HTTPException", async () => {
    const response = await failing(new HTTPException(418, { message: 'théière' })).request('/');
    expect(response.status).toBe(418);
  });

  it("n'expose pas le message d'une erreur inattendue et la journalise", async () => {
    const spy = vi.spyOn(log, 'logError').mockImplementation(() => {});
    const response = await failing(new Error('fuite')).request('/');
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: 'Erreur interne' });
    expect(text).not.toContain('fuite');
    expect(spy).toHaveBeenCalledOnce();
  });
});
