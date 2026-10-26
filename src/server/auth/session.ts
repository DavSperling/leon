import { APIError } from 'better-auth/api';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { resolveTenantContext, type TenantContext } from './tenant-context';

// Contexte de l'utilisateur connecté (composants serveur, server actions) ; null sans session valide.
export async function getUserContext(): Promise<TenantContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
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
