'use server';

import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { type PreviewView, toPreviewView } from '@/components/search/view-model';
import { getSession, requireUserContext, signOutCurrentUser } from '@/server/auth/session';
import { logError } from '@/server/log';
import { fetchPassageContext } from '@/server/search/context';
import { NOTHING_FOUND, type ShellFound, searchShell } from '@/server/shell/shell';

// Seule la session compte : une personne sans organisation (mauvais compte Google, par exemple) doit pouvoir
// se déconnecter, pas être renvoyée sur /bienvenue.
export async function signOutAction(): Promise<void> {
  if (!(await getSession())) redirect('/connexion');
  await signOutCurrentUser();
  redirect('/connexion');
}

export type PreviewResult =
  | { ok: true; preview: PreviewView }
  | { ok: false; reason: 'introuvable' | 'erreur' };

// L'aperçu d'un résultat : le passage dans son contexte, les tours voisins, sous les droits de l'utilisateur
// connecté (même lecture que l'outil `fetch` du MCP), plus le privé des gens sous lui, comme la recherche (0057). Un passage qu'il ne voit pas est « introuvable », comme un
// passage qui n'existe pas. Le message d'une panne ne sort pas : il peut citer du texte de la mémoire. Un
// identifiant qui n'est pas un uuid est « introuvable » sans requête (la base le refuserait par une erreur).
export async function previewPassageAction(passageId: string): Promise<PreviewResult> {
  const ctx = await requireUserContext();
  if (!z.uuid().safeParse(passageId).success) return { ok: false, reason: 'introuvable' };
  try {
    const context = await fetchPassageContext({ ...ctx, equipe: true }, passageId);
    return context
      ? { ok: true, preview: toPreviewView(context, await getLocale()) }
      : { ok: false, reason: 'introuvable' };
  } catch (error) {
    logError('search.preview_failed', error);
    return { ok: false, reason: 'erreur' };
  }
}

// Ce que la barre de commande trouve pour quelques lettres : outils, personnes, documents et discussions, sous les
// droits de la personne connectée (searchShell). Une panne ne sort pas : la barre garde ses autres lignes (demander,
// chercher, les écrans).
export async function searchShellAction(query: string): Promise<ShellFound> {
  const ctx = await requireUserContext();
  if (typeof query !== 'string') return NOTHING_FOUND;
  try {
    return await searchShell(ctx, query);
  } catch (error) {
    logError('shell.search_failed', error);
    return NOTHING_FOUND;
  }
}
