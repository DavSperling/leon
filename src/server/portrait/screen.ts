import { linesOf } from '@/lib/fiche-view';
import type { TenantContext } from '@/server/auth/tenant-context';
import { listConnections } from '@/server/connectors/connections';
import { withTenant } from '@/server/db/with-tenant';
import { briefingSources } from '@/server/discussion/citation-sources';
import { type FicheLine, readFiche } from './fiche';
import { enqueueFicheBuild, ficheBuildPending } from './queue';
import { MAIL_KINDS } from './sent-mails';
import { synthesisDone } from './synthese';

// La fiche pour l'écran « Ma fiche » des réglages : ses lignes, où en est sa construction, et les sources de ses
// tâches. Tout se lit sous les droits de la personne, et rien d'autre ne lit sa fiche.

// Où en est la construction, dans l'ordre où l'écran le décide :
// - en-cours : une construction demandée ou en cours, ce que la file sait seule (queue.ts) ;
// - faite : son rôle ou ses tâches sont écrits, même corrigés ou retirés depuis : plus de bouton ;
// - a-completer : des lignes calculées, sans rôle ni tâche (pas de modèle, ou une panne) : le bouton reste ;
// - a-construire : pas de fiche, et une boîte Gmail ou Outlook branchée par elle : le bouton ;
// - sans-boite : pas de fiche, et aucune boîte branchée par elle : il en faut une.
export type FicheEtat = 'en-cours' | 'faite' | 'a-completer' | 'a-construire' | 'sans-boite';
export type FicheSource = { title: string | null; url: string | null; kind: string };
export type FicheScreen = {
  etat: FicheEtat;
  lines: FicheLine[];
  // Les sources des tâches que la personne voit encore, par identifiant.
  sources: Record<string, FicheSource>;
};

async function etatOf(ctx: TenantContext, hasLines: boolean): Promise<FicheEtat> {
  if (await ficheBuildPending(ctx)) return 'en-cours';
  if (await withTenant(ctx, (tx) => synthesisDone(tx, ctx))) return 'faite';
  if (hasLines) return 'a-completer';
  const mailbox = (await listConnections(ctx)).some(
    (one) => one.isCreator && MAIL_KINDS.some((kind) => kind === one.provider),
  );
  return mailbox ? 'a-construire' : 'sans-boite';
}

// Les sources d'une tâche se relisent à chaque affichage, sous ses droits : une source supprimée, ou qu'elle ne voit
// plus, n'est pas rendue, et l'écran ne la compte ni ne la montre. 8 tâches de 20 sources au plus : sous la borne de
// briefingSources (200).
export async function readFicheScreen(ctx: TenantContext): Promise<FicheScreen> {
  const lines = await readFiche(ctx);
  const ids = [...new Set(linesOf(lines, 'tache').flatMap((line) => line.valeur.sources))];
  const [etat, seen] = await Promise.all([
    etatOf(ctx, lines.length > 0),
    briefingSources(ctx, ids),
  ]);
  const sources = Object.fromEntries(
    seen.map(({ sourceId, title, url, kind }) => [sourceId, { title, url, kind }]),
  );
  return { etat, lines, sources };
}

// La demande du bouton « Construire ma fiche » : la construction part en file si l'écran la propose à la personne.
// Rend false quand il n'y a rien à construire (aucune boîte) ou que sa fiche est faite ; true aussi quand une
// construction est déjà en cours (elle le fera).
export async function requestFicheBuild(ctx: TenantContext): Promise<boolean> {
  const etat = await etatOf(ctx, (await readFiche(ctx)).length > 0);
  if (etat === 'a-construire' || etat === 'a-completer') await enqueueFicheBuild(ctx);
  return etat !== 'sans-boite' && etat !== 'faite';
}
