import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { auth } from '@/server/auth/auth';

// Plafond du corps : un formulaire de connexion ou d'organisation tient en quelques Ko.
const AUTH_BODY_MAX_BYTES = 64 * 1024;

// Better Auth sert lui-même /api/auth/* (inscription, connexion, session, organisation). Il lit le corps sans
// limite : on le plafonne avant.
export const authRoutes = new Hono().on(
  ['GET', 'POST'],
  '/*',
  bodyLimit({
    maxSize: AUTH_BODY_MAX_BYTES,
    onError: (c) => c.json({ error: 'Requête trop volumineuse' }, 413),
  }),
  (c) => auth.handler(c.req.raw),
);
