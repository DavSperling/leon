'use server';

import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { ProjectSchema } from '@/capture/turn';
import { type PreviewView, toPreviewView } from '@/components/search/view-model';
import { getSession, requireUserContext, signOutCurrentUser } from '@/server/auth/session';
import {
  BRIEFING_DISMISSED_MAX,
  BRIEFING_LINE_MAX_CHARS,
  dismissBriefingLines,
  restoreBriefingLines,
} from '@/server/briefing/briefings';
import { logError } from '@/server/log';
import { fetchPassageContext } from '@/server/search/context';
import { NOTHING_FOUND, type ShellFound, searchShell } from '@/server/shell/shell';

// Seule la session compte : une personne sans organisation (mauvais compte Google, par exemple) doit pouvoir
// se déconnecter, pas être renvoyée sur /welcome.
export async function signOutAction(): Promise<void> {
  if (!(await getSession())) redirect('/sign-in');
  await signOutCurrentUser();
  redirect('/sign-in');
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

const BriefingLinesSchema = z.object({
  project: ProjectSchema,
  texts: z.array(z.string().min(1).max(BRIEFING_LINE_MAX_CHARS)).min(1).max(BRIEFING_DISMISSED_MAX),
});

// « C'est réglé » sur une ligne du point du matin, ou « Supprimer » sur le point entier (toutes ses lignes), et
// « Annuler » juste après : dans le seul point de la personne connectée, sans appel au modèle. Rien ne se revalide :
// l'écran a déjà ôté (ou remis) les lignes. Rend faux sur une panne, pour que l'écran les remette et le dise.
export async function dismissBriefingLinesAction(
  project: string,
  texts: string[],
): Promise<boolean> {
  return briefingLinesAction('point.retrait', project, texts, dismissBriefingLines);
}

export async function restoreBriefingLinesAction(
  project: string,
  texts: string[],
): Promise<boolean> {
  return briefingLinesAction('point.annulation', project, texts, restoreBriefingLines);
}

async function briefingLinesAction(
  what: string,
  project: string,
  texts: string[],
  apply: typeof dismissBriefingLines,
): Promise<boolean> {
  const ctx = await requireUserContext();
  const parsed = BriefingLinesSchema.safeParse({ project, texts });
  if (!parsed.success) return false;
  try {
    await apply(ctx, parsed.data.project, parsed.data.texts);
    return true;
  } catch (error) {
    logError(what, error);
    return false;
  }
}
