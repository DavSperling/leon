import { sso } from '@better-auth/sso';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { oneTap } from 'better-auth/plugins/one-tap';
import { organization } from 'better-auth/plugins/organization';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { eq } from 'drizzle-orm';
import { createTranslator } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { DEFAULT_LOCALE, type Locale, localeOf } from '@/i18n/request';
import { db, pool } from '@/server/db/client';
import { ssoProviders } from '@/server/db/schema/auth';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import { firstOrganizationId } from './tenant-context';

// Sans Resend, aucun e-mail ne part : l'écran de connexion ne propose pas « Mot de passe oublié ? », et la création
// d'un espace n'exige pas de vérifier l'adresse (sinon personne ne pourrait se vérifier).
export const emailEnabled = Boolean(env.RESEND_API_KEY && env.LEON_EMAIL_FROM);

// « Continuer avec Google / Microsoft » : un fournisseur n'est proposé que si ses deux clés sont posées. Choix du
// compte à chaque fois : sinon le navigateur reprend en silence le compte déjà ouvert (le piège de GitHub, PR #85).
export const socialProviders = {
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          prompt: 'select_account' as const,
        },
      }
    : {}),
  ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
    ? {
        microsoft: {
          clientId: env.MICROSOFT_CLIENT_ID,
          clientSecret: env.MICROSOFT_CLIENT_SECRET,
          tenantId: 'common',
          prompt: 'select_account' as const,
        },
      }
    : {}),
};
export type SocialProviderId = keyof typeof socialProviders;

// Préfixe de l'enregistrement DNS qui prouve qu'un espace possède le domaine de son SSO d'entreprise.
export const SSO_DNS_PREFIX = 'leon-verification';

// Les quatre lignes d'un e-mail d'authentification, par clé de messages/*.json (espace `auth`).
type EmailCopy = { subject: string; intro: string; action: string; ignore: string };
const RESET_EMAIL: EmailCopy = {
  subject: 'resetEmailSubject',
  intro: 'resetEmailIntro',
  action: 'resetEmailAction',
  ignore: 'resetEmailIgnore',
};
const VERIFY_EMAIL: EmailCopy = {
  subject: 'verifyEmailSubject',
  intro: 'verifyEmailIntro',
  action: 'verifyEmailAction',
  ignore: 'verifyEmailIgnore',
};

// La langue de la personne, lue dans sa requête (cookie `leon-locale`) ; l'anglais hors requête.
async function requesterLocale(): Promise<Locale> {
  try {
    return localeOf(await getLocale());
  } catch {
    return DEFAULT_LOCALE;
  }
}

async function sendAuthEmail(
  email: string,
  url: string,
  locale: Locale,
  copy: EmailCopy,
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.LEON_EMAIL_FROM) {
    throw new Error('RESEND_API_KEY and LEON_EMAIL_FROM are required to send auth emails');
  }
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: 'auth' });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.LEON_EMAIL_FROM,
      to: [email],
      subject: t(copy.subject),
      html: `<p>${t(copy.intro)}</p><p><a href="${url}">${t(copy.action)}</a></p><p>${t(copy.ignore)}</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Auth email failed (${response.status})`);
}

// Envoi détaché : la réponse met le même temps que le compte existe ou non (Leon tourne en continu, l'envoi finit
// après la réponse). La langue se lit dans l'envoi détaché aussi : l'attendre ici ne retarderait que les envois réels.
function sendAuthEmailDetached(email: string, url: string, copy: EmailCopy, logKey: string): void {
  void requesterLocale()
    .then((locale) => sendAuthEmail(email, url, locale, copy))
    .catch((error) => logError(logKey, error));
}

// Le SSO d'un espace ne vaut que pour les adresses de son domaine prouvé et de ses sous-domaines. Sinon Better Auth
// tient seulement le fournisseur pour « non fiable » et crée quand même le compte d'une adresse d'autrui : son vrai
// titulaire ne pourrait plus s'inscrire, et le fournisseur de l'espace garderait l'accès à ce compte.
async function outsideSsoDomain(providerId: string, email: string | undefined): Promise<boolean> {
  const [provider] = await db
    .select({ domain: ssoProviders.domain })
    .from(ssoProviders)
    .where(eq(ssoProviders.providerId, providerId));
  if (!provider || !email?.includes('@')) return true;
  const host = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  const domain = provider.domain.toLowerCase();
  return host !== domain && !host.endsWith(`.${domain}`);
}

export const auth = betterAuth({
  appName: 'Leon',
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: pool,
  socialProviders,
  // Jetons Google et Microsoft chiffrés en base (clé BETTER_AUTH_SECRET) : celui d'un administrateur peut lire
  // l'annuaire de son entreprise (import de l'organigramme, annuaire.ts). Un jeton déjà enregistré en clair reste lu.
  account: { encryptOAuthTokens: true },
  // Better Auth l'appelle à la création du compte, à sa liaison et à chaque connexion par un fournisseur ; le SSO
  // seul est contrôlé ici.
  user: {
    validateUserInfo: async ({ user, source }) =>
      source.sso && (await outsideSsoDomain(source.sso.providerId, user.email))
        ? {
            error: 'email_domain_mismatch',
            errorDescription: 'Email address outside the SSO domain',
          }
        : undefined,
  },
  // Un compte existant (même adresse) n'est relié à Google, Microsoft ou un SSO que si les deux côtés ont vérifié
  // l'adresse (défaut de Better Auth, requireLocalEmailVerified) : un compte créé avec l'adresse d'autrui, jamais
  // vérifié, ne reçoit pas la connexion de son vrai titulaire.
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 8,
    // La création d'un espace vérifie l'adresse (emailVerification, plus bas) : tant qu'elle ne l'est pas, la
    // connexion est refusée. Sans envoi d'e-mail possible, on ne bloque pas, sinon personne ne pourrait se vérifier.
    requireEmailVerification: emailEnabled,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      sendAuthEmailDetached(user.email, url, RESET_EMAIL, 'auth.password_reset_email'),
  },
  // Le lien de vérification part dès l'inscription, et repart à chaque tentative de connexion d'une adresse non
  // vérifiée (sendOnSignIn) : c'est le seul renvoi possible, la route HTTP /send-verification-email étant fermée, et
  // il reste sous la limite de débit de la connexion. Pas de connexion automatique au clic : suivre le lien n'ouvre
  // pas la session d'un espace qu'un tiers aurait créé avec cette adresse (pré-détournement de compte).
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user, url }) =>
      sendAuthEmailDetached(user.email, url, VERIFY_EMAIL, 'auth.verification_email'),
  },
  // La connexion, l'inscription, la demande de lien, le changement de mot de passe et la 2FA passent par les server
  // actions (auth.api.*), sous la limite de débit de rate-limit.ts : les routes HTTP de Better Auth la
  // contourneraient (deviner un mot de passe ou un code depuis une session volée ; l'inscription y créerait un compte
  // sans organisation). Seul le routeur les ferme : auth.api.* les appelle toujours. /reset-password/:token reste
  // ouverte : c'est le lien de l'e-mail.
  disabledPaths: [
    '/sign-in/email',
    '/sign-up/email',
    '/request-password-reset',
    // L'envoi (et le renvoi) du lien de vérification passe par l'inscription et la connexion, sous la limite de
    // débit : la route HTTP la contournerait et laisserait envoyer des e-mails sans compte ni limite.
    '/send-verification-email',
    '/change-password',
    '/two-factor/enable',
    '/two-factor/disable',
    '/two-factor/get-totp-uri',
    '/two-factor/generate-backup-codes',
    '/two-factor/verify-totp',
    '/two-factor/verify-backup-code',
    '/two-factor/send-otp',
    '/two-factor/verify-otp',
    // Les débuts de connexion par Google, Microsoft ou SSO passent par les server actions (sso.ts) ; les retours des
    // fournisseurs (/callback/*, /sso/callback/*, /sso/saml2/*) restent ouverts.
    '/sign-in/social',
    '/sign-in/sso',
    // Le réglage du SSO d'un espace : server actions seulement, réservées à son propriétaire ou administrateur.
    '/sso/register',
    '/sso/update-provider',
    '/sso/delete-provider',
    '/sso/providers',
    '/sso/get-provider',
    '/sso/request-domain-verification',
    '/sso/verify-domain',
    // Google One Tap : le jeton de Google passe par une server action (oneTapAction), comme les autres débuts.
    '/one-tap/callback',
    // Les jetons Google et Microsoft de la personne, dont celui qui lit l'annuaire de l'entreprise : jamais par HTTP,
    // où une session volée suffirait à les emporter. Seul l'import de l'organigramme les lit, côté serveur.
    '/get-access-token',
    '/refresh-token',
    '/list-accounts',
    '/account-info',
  ],
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
    // La fenêtre « Continuer en tant que… » de Google : le jeton est vérifié contre GOOGLE_CLIENT_ID.
    oneTap(),
    // SSO d'entreprise (OIDC ou SAML : Okta, Entra, Google Workspace…). Aucune connexion tant que l'espace n'a pas
    // prouvé, par un enregistrement DNS, qu'il possède le domaine : sinon un espace pourrait déclarer le domaine
    // d'un autre et se connecter à la place de ses employés. Qui se connecte par le SSO entre dans l'espace.
    sso({
      domainVerification: { enabled: true, tokenPrefix: SSO_DNS_PREFIX },
      organizationProvisioning: { defaultRole: 'member' },
      saml: { requireTimestamps: true },
    }),
    nextCookies(), // en dernier : cookies posés par les server actions
  ],
});
