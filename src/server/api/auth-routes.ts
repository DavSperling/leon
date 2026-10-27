import { Hono } from 'hono';
import { auth } from '@/server/auth/auth';

// Leon appelle Better Auth par auth.api.* dans ses server actions, sous ses propres limites et validations. Le
// routeur ne lui passe que ce qui doit venir d'un navigateur : le lien de réinitialisation de l'e-mail, et /ok.
// Le reste (change-password, update-user, organization/*, two-factor/*…) contournerait ces limites : 404.
export const authRoutes = new Hono()
  .get('/reset-password/:token', (c) => auth.handler(c.req.raw))
  .get('/ok', (c) => auth.handler(c.req.raw));
