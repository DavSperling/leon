import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { organization } from 'better-auth/plugins/organization';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { pool } from '@/server/db/client';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import { firstOrganizationId } from './tenant-context';

// Sans Resend, aucun lien ne part : l'écran de connexion ne propose pas « Mot de passe oublié ? ».
export const passwordResetEnabled = Boolean(env.RESEND_API_KEY && env.LEON_EMAIL_FROM);

async function sendPasswordReset(email: string, url: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.LEON_EMAIL_FROM) {
    throw new Error('RESEND_API_KEY and LEON_EMAIL_FROM are required to send password reset email');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.LEON_EMAIL_FROM,
      to: [email],
      subject: 'Réinitialiser votre mot de passe Leon',
      html: `<p>Une demande de réinitialisation de votre mot de passe Leon a été faite.</p><p><a href="${url}">Choisir un nouveau mot de passe</a></p><p>Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Password reset email failed (${response.status})`);
}

export const auth = betterAuth({
  appName: 'Leon',
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: pool,
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    // Envoi sans attente : la réponse met le même temps que le compte existe ou non (Leon tourne en continu,
    // l'envoi finit après la réponse).
    sendResetPassword: async ({ user, url }) => {
      void sendPasswordReset(user.email, url).catch((error) =>
        logError('auth.password_reset_email', error),
      );
    },
  },
  // La connexion, l'inscription et la demande de lien passent par les server actions (auth.api.*), sous la limite
  // de débit de rate-limit.ts : les routes HTTP de Better Auth la contourneraient (et l'inscription y créerait un
  // compte sans organisation). Seul le routeur les ferme : auth.api.* les appelle toujours. /reset-password/:token
  // reste ouverte : c'est le lien de l'e-mail.
  disabledPaths: ['/sign-in/email', '/sign-up/email', '/request-password-reset'],
  // Le jeton de réinitialisation n'est gardé qu'en empreinte, comme les liens d'invitation et les jetons d'API.
  verification: {
    storeIdentifier: { default: 'plain', overrides: { 'reset-password:': 'hashed' } },
  },
  advanced: {
    database: { generateId: 'uuid' },
    // L'adresse du client ne vient que de l'en-tête que pose le proxy de confiance (rate-limit.ts) ; sans lui,
    // aucune n'est lue : un en-tête choisi par le client ne vaut rien.
    ipAddress: env.LEON_IP_HEADER
      ? { ipAddressHeaders: [env.LEON_IP_HEADER] }
      : { disableIpTracking: true },
  },
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
    // Une invitation ne s'accepte qu'avec un e-mail vérifié : sinon, quiconque s'inscrit avec
    // l'adresse invitée rejoint l'organisation (aucun e-mail n'est vérifié dans ce jet).
    organization({ disableOrganizationDeletion: true, requireEmailVerificationOnInvitation: true }),
    twoFactor({ issuer: 'Leon', totpOptions: { digits: 6, period: 30 } }),
    nextCookies(), // en dernier : cookies posés par les server actions
  ],
});
