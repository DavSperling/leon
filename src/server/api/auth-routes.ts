import { Hono } from 'hono';
import { auth } from '@/server/auth/auth';

// Better Auth sert lui-même /api/auth/* (inscription, connexion, session, organisation).
export const authRoutes = new Hono().on(['GET', 'POST'], '/*', (c) => auth.handler(c.req.raw));
