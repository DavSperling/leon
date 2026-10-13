'use server';

import { redirect } from 'next/navigation';
import { requireUserContext, signOutCurrentUser } from '@/server/auth/session';

export async function signOutAction(): Promise<void> {
  await requireUserContext();
  await signOutCurrentUser();
  redirect('/connexion');
}
