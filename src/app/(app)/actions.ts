'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { type PreviewView, toPreviewView } from '@/components/search/view-model';
import { requireUserContext, signOutCurrentUser } from '@/server/auth/session';
import { logError } from '@/server/log';
import { fetchPassageContext } from '@/server/search/context';

export async function signOutAction(): Promise<void> {
  await requireUserContext();
  await signOutCurrentUser();
  redirect('/connexion');
}

export type PreviewResult =
  | { ok: true; preview: PreviewView }
  | { ok: false; reason: 'introuvable' | 'erreur' };

// L'aperçu d'un résultat : le passage dans son contexte, les tours voisins, sous les droits de l'utilisateur
// connecté (même lecture que l'outil `fetch` du MCP). Un passage qu'il ne voit pas est « introuvable », comme un
// passage qui n'existe pas. Le message d'une panne ne sort pas : il peut citer du texte de la mémoire. Un
// identifiant qui n'est pas un uuid est « introuvable » sans requête (la base le refuserait par une erreur).
export async function previewPassageAction(passageId: string): Promise<PreviewResult> {
  const ctx = await requireUserContext();
  if (!z.uuid().safeParse(passageId).success) return { ok: false, reason: 'introuvable' };
  try {
    const context = await fetchPassageContext(ctx, passageId);
    return context
      ? { ok: true, preview: toPreviewView(context) }
      : { ok: false, reason: 'introuvable' };
  } catch (error) {
    logError('search.preview_failed', error);
    return { ok: false, reason: 'erreur' };
  }
}
