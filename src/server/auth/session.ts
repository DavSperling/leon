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

// Contexte de l'utilisateur connecté (composants serveur, server actions) ; null sans session valide.
export async function getUserContext(): Promise<TenantContext | null> {
  const session = await getSession();
  if (!session) return null;
  noteActivity(session.session.id, session.user.id);
  return resolveTenantContext(session.user.id, session.session.activeOrganizationId ?? null);
}

export async function requireUserContext(): Promise<TenantContext> {
  const ctx = await getUserContext();
  if (!ctx) redirect('/connexion');
  return ctx;
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
