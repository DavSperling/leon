import { randomBytes } from 'node:crypto';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { slugify } from '@/lib/slug';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/auth';
import { logError } from '@/server/log';
import { auth } from './auth';

export const SignUpInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email(),
  password: z.string().min(8).max(128),
  organizationName: z.string().trim().min(2).max(100),
});
export type SignUpInput = z.infer<typeof SignUpInputSchema>;

export type SignUpResult =
  | { ok: true; userId: string; tenantId: string }
  | { ok: false; error: 'email_pris' | 'invalide' };

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

  try {
    const org = await auth.api.createOrganization({
      body: { name: organizationName, slug: organizationSlug(organizationName), userId },
    });
    return { ok: true, userId, tenantId: org.id };
  } catch (error) {
    // Pas de compte sans organisation : on le supprime (sessions et comptes suivent en cascade).
    logError('auth.sign_up.organization', error);
    await db.delete(users).where(eq(users.id, userId));
    return { ok: false, error: 'invalide' };
  }
}
