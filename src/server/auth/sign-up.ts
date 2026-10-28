import { randomBytes } from 'node:crypto';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { slugify } from '@/lib/slug';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/auth';
import { logError } from '@/server/log';
import { auth } from './auth';
import { findInvitation, joinWithInvitation } from './members';
import { firstOrganizationId } from './tenant-context';

export const SignUpInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  // `.invalid` est réservé aux adresses de l'ancien membre (delete-account.ts) : personne ne s'y inscrit.
  email: z.email().refine((email) => !email.toLowerCase().endsWith('.invalid')),
  password: z.string().min(8).max(128),
  organizationName: z.string().trim().min(2).max(100),
});
export type SignUpInput = z.infer<typeof SignUpInputSchema>;

export type SignUpResult =
  | { ok: true; userId: string; tenantId: string }
  | { ok: false; error: 'email_pris' | 'invalide' };

// L'inscription par un lien d'invitation : pas d'organisation à créer, on rejoint celle du lien.
export const JoinInputSchema = SignUpInputSchema.omit({ organizationName: true }).extend({
  token: z.string(),
});
export type JoinInput = z.infer<typeof JoinInputSchema>;
export type JoinResult =
  | { ok: true; userId: string; tenantId: string }
  | { ok: false; error: 'email_pris' | 'lien_invalide' | 'invalide' };

// Suffixe aléatoire : deux organisations de même nom n'ont jamais le même slug.
function organizationSlug(name: string): string {
  const suffix = randomBytes(3).toString('hex');
  return [slugify(name), suffix].filter(Boolean).join('-');
}

async function emailTaken(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return rows.length > 0;
}

export type CreateOrganizationResult =
  | { ok: true; tenantId: string }
  | { ok: false; error: 'deja_membre' | 'invalide' };

// Rangé sur globalThis, comme le pool (db/client.ts) : Next compile ce module en plusieurs copies.
const globalForLocks = globalThis as { leonUserLocks?: Map<string, Promise<unknown>> };
globalForLocks.leonUserLocks ??= new Map();
const userLocks = globalForLocks.leonUserLocks;

// Les appels d'un même utilisateur passent l'un après l'autre ; ceux de deux utilisateurs ne s'attendent pas.
// Aucune connexion du pool n'est tenue pendant l'attente. L'entrée disparaît quand le dernier a fini.
// shortcut: deux instances (recouvrement d'une mise en ligne) ne partagent pas ce verrou, à passer en base si Leon tourne durablement sur plusieurs instances.
async function withUserLock<T>(userId: string, run: () => Promise<T>): Promise<T> {
  const result = (userLocks.get(userId) ?? Promise.resolve()).then(run);
  const tail = result.then(
    () => undefined,
    () => undefined, // la file continue même si `run` échoue
  );
  userLocks.set(userId, tail);
  try {
    return await result;
  } finally {
    if (userLocks.get(userId) === tail) userLocks.delete(userId);
  }
}

// L'espace d'une personne qui n'en a pas (elle en devient propriétaire). Le test « déjà membre » et la création se
// font sous le verrou de l'utilisateur : le second de deux envois simultanés (deux onglets) attend le premier,
// puis trouve l'espace créé et rend `deja_membre`.
export async function createOrganizationForUser(
  userId: string,
  organizationName: string,
): Promise<CreateOrganizationResult> {
  const name = SignUpInputSchema.shape.organizationName.safeParse(organizationName);
  if (!name.success) return { ok: false, error: 'invalide' };

  return withUserLock(userId, async (): Promise<CreateOrganizationResult> => {
    if (await firstOrganizationId(userId)) return { ok: false, error: 'deja_membre' };
    try {
      const org = await auth.api.createOrganization({
        body: { name: name.data, slug: organizationSlug(name.data), userId },
      });
      return { ok: true, tenantId: org.id };
    } catch (error) {
      logError('auth.sign_up.organization', error);
      return { ok: false, error: 'invalide' };
    }
  });
}

// L'inscription crée l'utilisateur et son organisation (il en est propriétaire), ou rien.
export async function createUserWithOrganization(input: SignUpInput): Promise<SignUpResult> {
  const parsed = SignUpInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalide' };
  const { organizationName, ...body } = parsed.data;
  // Avec autoSignIn: false, Better Auth répond à un e-mail déjà pris par un faux utilisateur
  // au lieu d'une erreur (anti-énumération) : on vérifie donc nous-mêmes.
  if (await emailTaken(body.email)) return { ok: false, error: 'email_pris' };

  let userId: string;
  try {
    userId = (await auth.api.signUpEmail({ body })).user.id;
  } catch (error) {
    if (error instanceof APIError) return { ok: false, error: 'invalide' };
    throw error;
  }

  const created = await createOrganizationForUser(userId, organizationName).catch((error) => {
    logError('auth.sign_up.organization', error);
    return null;
  });
  if (created?.ok) return { ok: true, userId, tenantId: created.tenantId };
  // Pas de compte sans organisation : on le supprime (sessions et comptes suivent en cascade).
  await db.delete(users).where(eq(users.id, userId));
  return { ok: false, error: 'invalide' };
}

// L'inscription par un lien d'invitation crée l'utilisateur, membre de l'organisation du lien, ou rien.
export async function createUserWithInvitation(input: JoinInput): Promise<JoinResult> {
  const parsed = JoinInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalide' };
  const { token, ...body } = parsed.data;
  // Vérifié avant de créer le compte (le lien est servi plus bas, une seule fois) : un lien mort ne crée rien.
  if (!(await findInvitation(token))) return { ok: false, error: 'lien_invalide' };
  if (await emailTaken(body.email)) return { ok: false, error: 'email_pris' };

  let userId: string;
  try {
    userId = (await auth.api.signUpEmail({ body })).user.id;
  } catch (error) {
    if (error instanceof APIError) return { ok: false, error: 'invalide' };
    throw error;
  }

  let error: Extract<JoinResult, { ok: false }>;
  try {
    const tenantId = await joinWithInvitation(token, userId);
    if (tenantId) return { ok: true, userId, tenantId };
    error = { ok: false, error: 'lien_invalide' }; // servi ou expiré entre-temps
  } catch (cause) {
    logError('auth.sign_up.invitation', cause);
    error = { ok: false, error: 'invalide' };
  }
  // Pas de compte sans organisation : on le supprime (sessions et comptes suivent en cascade).
  await db.delete(users).where(eq(users.id, userId));
  return error;
}
