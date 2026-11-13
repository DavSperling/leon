'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { localeOf } from '@/i18n/request';
import { cancelInvitation, invitationToSend } from '@/server/auth/members';
import { setFollowed, setSeeAll } from '@/server/auth/organisation';
import { authAttemptAllowed } from '@/server/auth/rate-limit';
import { getSession, requestHeaders, requireUserContext } from '@/server/auth/session';
import { mailConfigured, sendInvitationEmail } from '@/server/email/invitation';
import { env } from '@/server/env';
import { logError } from '@/server/log';

const FamiliesSchema = z.array(z.string().max(20)).max(20);

// Ce que le lecteur suit d'une personne sous lui ; setFollowed vérifie qu'elle l'est et ne garde que les familles connues.
export async function setFollowedAction(
  memberId: string,
  families: string[],
): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const parsed = FamiliesSchema.safeParse(families);
  const ok = parsed.success && (await setFollowed(ctx, memberId, parsed.data));
  if (ok) revalidatePath('/equipe');
  return { ok };
}

// Le lecteur lit-il le privé d'une personne sous lui (0057) ; setSeeAll vérifie qu'elle l'est.
export async function setSeeAllAction(memberId: string, on: boolean): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const ok = z.boolean().safeParse(on).success && (await setSeeAll(ctx, memberId, on));
  if (ok) revalidatePath('/equipe');
  return { ok };
}

// Annule un lien d'invitation pas encore servi (propriétaire ou administrateur) : l'invité quitte l'organigramme.
export async function cancelInvitationAction(id: string): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const ok = await cancelInvitation(ctx, id);
  if (ok) revalidatePath('/', 'layout');
  return { ok };
}

export type SendInvitationError = 'address' | 'unconfigured' | 'refused' | 'limit' | 'failed';

const AddressSchema = z.email().max(320);
const URL_TOKEN = /\/invitation\/([A-Za-z0-9_-]{43})$/;

// « Envoyer par e-mail » le lien qui vient d'être créé : par le même envoi que la réinitialisation du mot de passe,
// dans la langue de qui l'envoie. Le lien doit être un lien encore utilisable de son organisation, et lui pouvoir
// inviter (members.ts) : Leon n'envoie jamais une adresse choisie par le navigateur. Un serveur sans service d'e-mail
// le dit au lieu de faire semblant.
export async function sendInvitationEmailAction(
  url: string,
  email: string,
): Promise<{ ok: true } | { error: SendInvitationError }> {
  const ctx = await requireUserContext();
  const address = AddressSchema.safeParse(typeof email === 'string' ? email.trim() : email);
  if (!address.success) return { error: 'address' };
  if (!mailConfigured()) return { error: 'unconfigured' };
  const token = typeof url === 'string' ? URL_TOKEN.exec(url)?.[1] : undefined;
  const invitation = token ? await invitationToSend(ctx, token) : null;
  if (!token || !invitation) return { error: 'refused' };
  if (!(await authAttemptAllowed('invitation', address.data, await requestHeaders(), ctx.userId))) {
    return { error: 'limit' };
  }
  try {
    const session = await getSession();
    await sendInvitationEmail({
      to: address.data,
      // reconstruit ici : seul le secret vient du navigateur
      url: new URL(`/invitation/${token}`, env.BETTER_AUTH_URL).toString(),
      locale: localeOf(await getLocale()),
      organizationName: invitation.organizationName,
      inviterName: session?.user.name ?? '',
      expiresAt: invitation.expiresAt,
    });
  } catch (error) {
    logError('team.invitation_email_failed', error);
    return { error: 'failed' };
  }
  return { ok: true };
}
