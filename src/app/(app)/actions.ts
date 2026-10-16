'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { THEME_COOKIE, THEME_COOKIE_OPTIONS, ThemeSchema } from '@/lib/theme-cookie';
import { requireUserContext, signOutCurrentUser } from '@/server/auth/session';
import { type SearchResult, searchMemory } from '@/server/memory/search';

const SearchQuerySchema = z.string().trim().min(1).max(200);

export async function signOutAction(): Promise<void> {
  await requireUserContext();
  await signOutCurrentUser();
  redirect('/connexion');
}

// Recherche ⌘K : sous les droits du lecteur connecté.
export async function searchAction(query: string): Promise<SearchResult[]> {
  const ctx = await requireUserContext();
  return searchMemory(ctx, { query: SearchQuerySchema.parse(query) });
}

// Préférence du navigateur, sans donnée de l'organisation : pas de session à vérifier.
export async function setThemeAction(theme: string): Promise<void> {
  (await cookies()).set(THEME_COOKIE, ThemeSchema.parse(theme), THEME_COOKIE_OPTIONS);
}
