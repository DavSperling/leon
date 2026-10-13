import type { ErrorHandler } from 'hono';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logError } from '@/server/log';

export const app = new Hono().basePath('/api');

// Les erreurs inattendues ne sortent jamais telles quelles : ni message, ni pile.
export const handleApiError: ErrorHandler = (error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  logError('api.unhandled', error);
  return c.json({ error: 'Erreur interne' }, 500);
};

app.get('/health', (c) => c.json({ ok: true }));
app.notFound((c) => c.json({ error: 'Introuvable' }, 404));
app.onError(handleApiError);
