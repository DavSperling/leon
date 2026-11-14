import { APIError } from 'better-auth/api';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { noteActivity } from '@/server/admin/stats';
import { auth } from './auth';
import { resolveSessionContext, type TenantContext } from './tenant-context';

// Les en-têtes de la requête, avec les cookies à jour : une server action qui remplace la session (activer ou
// couper la 2FA) pose un nouveau cookie, mais headers() garde l'ancien jusqu'à la requête suivante, et le rendu
// qui suit l'action verrait une session supprimée.
export async function requestHeaders(): Promise<Headers> {
  const current = new Headers(await headers());
  // getAll() : dans une server action, cookies() est le jeu de la réponse, dont toString() rendrait des Set-Cookie.
  const jar = (await cookies()).getAll();
  current.set(
    'cookie',
    jar.map(({ name, value }) => `${name}=${encodeURIComponent(value)}`).join('; '),
  );
  return current;
}

// Pendant un rendu, le layout et la page demandent la même session (et, aux Réglages, deux contrôles de plus) :
// cache() de React ne la lit qu'une fois par rendu. Hors d'un rendu (server action, route d'API) cache() ne retient
// rien, chaque appel relit : ce qu'il faut à l'action qui vient de remplacer la session.
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await requestHeaders() }),
);

// Une connexion de moins d'une heure (T55 ; D37 du plan de la mémoire à disposition) : écrire ou corriger une leçon,
// et remettre une version, l'exigent. L'heure est `createdAt`, celle de la connexion : le rafraîchissement (updateAge)
// ne touche que `updatedAt` et `expiresAt`. On ne baisse pas `freshAge` de Better Auth, qui changerait ses routes.
// Toute connexion compte (mot de passe et 2FA, Google, Microsoft, One Tap, SSO) : aucune n'est forcée chez le
// fournisseur, limite connue (vigilance 2).
const RECENT_SIGN_IN_MS = 60 * 60 * 1000;
export async function signedInRecently(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return Date.now() - new Date(session.session.createdAt).getTime() < RECENT_SIGN_IN_MS;
}

// Où l'on renvoie une personne connectée qui n'a pas (ou pas fini) son espace.
export const ONBOARDING_PATH = '/bienvenue';

// La session et le contexte de l'utilisateur connecté (organisation active, ou à défaut la première : voir
// resolveSessionContext). Une fois par rendu, comme getSession : le layout et la page reçoivent le même objet, ce
// qui laisse readOnboardingMember, getViewerProfile et channelHealth ne lire qu'une fois eux aussi.
const sessionWithContext = cache(async () => {
  const session = await getSession();
  if (!session) return { session: null, ctx: null };
  noteActivity(session.session.id, session.user.id);
  const ctx = await resolveSessionContext(
    session.user.id,
    session.session.activeOrganizationId ?? null,
  );
  return { session, ctx };
});

// Contexte de l'utilisateur connecté (composants serveur, server actions) ; null sans session valide, ou sans organisation.
export async function getUserContext(): Promise<TenantContext | null> {
  return (await sessionWithContext()).ctx;
}

// Sans session : la connexion. Avec une session mais sans organisation : l'onboarding.
export async function requireUserContext(): Promise<TenantContext> {
  const { session, ctx } = await sessionWithContext();
  if (ctx) return ctx;
  redirect(session ? ONBOARDING_PATH : '/connexion');
}

// Le cookie de session est posé par le plugin nextCookies.
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ ok: boolean; twoFactor?: boolean; unverified?: boolean }> {
  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
    if ('twoFactorRedirect' in result && result.twoFactorRedirect)
      return { ok: false, twoFactor: true };
    return { ok: true };
  } catch (error) {
    // 403 : adresse pas encore vérifiée (sendOnSignIn a renvoyé le lien) ; distingué pour inviter à vérifier
    // plutôt que d'afficher « identifiants incorrects ».
    if (error instanceof APIError) return { ok: false, unverified: error.statusCode === 403 };
    throw error;
  }
}

export async function signOutCurrentUser(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
}
