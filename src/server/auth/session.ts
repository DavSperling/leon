import { APIError } from 'better-auth/api';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { noteActivity } from '@/server/admin/stats';
import { auth } from './auth';
import { resolveTenantContext, type TenantContext } from './tenant-context';

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

export async function getSession() {
  return auth.api.getSession({ headers: await requestHeaders() });
}

// Où l'on renvoie une personne connectée qui n'a pas (ou pas fini) son espace.
export const ONBOARDING_PATH = '/bienvenue';

// La session et le contexte de l'utilisateur connecté. Si l'organisation active de la session n'est plus une des
// siennes (membre retiré : Better Auth ne remet pas activeOrganizationId à zéro), on se rabat sur sa première
// organisation, sinon la personne tournerait entre « / » et « /bienvenue ».
async function sessionWithContext() {
  const session = await getSession();
  if (!session) return { session: null, ctx: null };
  noteActivity(session.session.id, session.user.id);
  const active = session.session.activeOrganizationId ?? null;
  const ctx =
    (await resolveTenantContext(session.user.id, active)) ??
    (active ? await resolveTenantContext(session.user.id, null) : null);
  return { session, ctx };
}

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
): Promise<{ ok: boolean; twoFactor?: boolean }> {
  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
    if ('twoFactorRedirect' in result && result.twoFactorRedirect)
      return { ok: false, twoFactor: true };
    return { ok: true };
  } catch (error) {
    if (error instanceof APIError) return { ok: false };
    throw error;
  }
}

export async function signOutCurrentUser(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
}
