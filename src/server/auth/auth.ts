import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { organization } from 'better-auth/plugins/organization';
import { pool } from '@/server/db/client';
import { env } from '@/server/env';
import { firstOrganizationId } from './tenant-context';

export const auth = betterAuth({
  appName: 'Leon',
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: pool,
  emailAndPassword: { enabled: true, autoSignIn: false, minPasswordLength: 8 },
  advanced: { database: { generateId: 'uuid' } },
  telemetry: { enabled: false },
  databaseHooks: {
    session: {
      create: {
        // La session porte l'organisation de l'utilisateur dès sa création.
        before: async (session) => ({
          data: { ...session, activeOrganizationId: await firstOrganizationId(session.userId) },
        }),
      },
    },
  },
  plugins: [
    // Rien n'est effacé : la suppression d'une organisation emporterait toute sa mémoire en cascade.
    organization({ disableOrganizationDeletion: true }),
    nextCookies(), // en dernier : cookies posés par les server actions
  ],
});
