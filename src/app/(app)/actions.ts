'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
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
