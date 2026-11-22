import { and, eq } from 'drizzle-orm';
import { linesOf } from '@/lib/fiche-view';
import type { TenantContext } from '@/server/auth/tenant-context';
import { listConnections } from '@/server/connectors/connections';
import { lignesFiche } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { briefingSources } from '@/server/discussion/citation-sources';
import { type FicheLine, readFiche } from './fiche';
import { type Proposal, readProposals } from './propositions';
import { enqueueFicheBuild, ficheBuildCompleted, ficheBuildPending } from './queue';
import { MAIL_KINDS } from './sent-mails';
import { synthesisDone } from './synthese';

// La fiche pour l'écran « Ma fiche » des réglages : son rôle et ses tâches, où en est sa construction, les sources de
// ses tâches, et les agents de départ qui lui sont proposés. Tout se lit sous les droits de la personne, et rien d'autre
// ne lit sa fiche.

// Où en est la construction, dans l'ordre où l'écran le décide :
// - en-cours : une construction demandée ou en cours, ce que la file sait seule (queue.ts) ;
// - faite : son rôle ou ses tâches sont écrits, même corrigés ou retirés depuis : plus de bouton ;
// - a-completer : des lignes calculées, sans rôle ni tâche (pas de modèle, ou une panne) : le bouton reste ;
// - sans-boite : pas de fiche, et aucune boîte branchée par elle : il en faut une ;
// - sans-mail : pas de fiche, sa boîte branchée, et une construction finie qui n'a trouvé aucun mail envoyé : l'écran
//   le dit, le bouton reste ;
// - a-construire : pas de fiche, et une boîte Gmail ou Outlook branchée par elle : le bouton.
export type FicheEtat =
  | 'en-cours'
  | 'faite'
  | 'a-completer'
  | 'sans-boite'
  | 'sans-mail'
  | 'a-construire';
export type FicheSource = { title: string | null; url: string | null; kind: string };
export type FicheScreen = {
  etat: FicheEtat;
  // Son rôle et ses tâches seulement.
  lines: FicheLine[];
  // Les sources des tâches que la personne voit encore, par identifiant.
  sources: Record<string, FicheSource>;
  // Les agents de départ proposés d'après ses outils et sa fiche entière, avec sa réponse à chacun (propositions.ts).
  agents: Proposal[];
};

async function etatOf(ctx: TenantContext, hasLines: boolean): Promise<FicheEtat> {
  if (await ficheBuildPending(ctx)) return 'en-cours';
  if (await withTenant(ctx, (tx) => synthesisDone(tx, ctx))) return 'faite';
  if (hasLines) return 'a-completer';
  const mailbox = (await listConnections(ctx)).some(
    (one) => one.isCreator && MAIL_KINDS.some((kind) => kind === one.provider),
  );
  if (!mailbox) return 'sans-boite';
  // Aucune ligne, même retirée par elle depuis : la construction finie n'avait rien eu à écrire.
  // shortcut: l'écran ne le dit que tant que la file garde ce travail fini (sept jours), à noter en base si cela doit
  // durer.
  const [kept] = await withTenant(ctx, (tx) =>
    tx
      .select({ id: lignesFiche.id })
      .from(lignesFiche)
      .where(and(eq(lignesFiche.tenantId, ctx.tenantId), eq(lignesFiche.userId, ctx.userId)))
      .limit(1),
  );
  return !kept && (await ficheBuildCompleted(ctx)) ? 'sans-mail' : 'a-construire';
}

// Les sources d'une tâche se relisent à chaque affichage, sous ses droits : une source supprimée, ou qu'elle ne voit
// plus, n'est pas rendue, et l'écran ne la compte ni ne la montre. 8 tâches de 20 sources au plus : sous la borne de
// briefingSources (200).
export async function readFicheScreen(ctx: TenantContext): Promise<FicheScreen> {
  const all = await readFiche(ctx);
  // L'écran ne montre que son rôle et ses tâches : les mesures calculées sur ses mails restent en base.
  const lines = all.filter((line) => line.genre === 'role' || line.genre === 'tache');
  const ids = [...new Set(linesOf(lines, 'tache').flatMap((line) => line.valeur.sources))];
  const [etat, seen, agents] = await Promise.all([
    etatOf(ctx, all.length > 0),
    briefingSources(ctx, ids),
    // Les mesures servent à proposer, sans partir vers l'écran : il ne reçoit que l'agent et sa réponse.
    readProposals(ctx, all),
  ]);
  const sources = Object.fromEntries(
    seen.map(({ sourceId, title, url, kind }) => [sourceId, { title, url, kind }]),
  );
  return { etat, lines, sources, agents };
}

// La demande du bouton « Construire ma fiche » : la construction part en file si l'écran la propose à la personne.
// Rend false quand il n'y a rien à construire (aucune boîte) ou que sa fiche est faite ; true aussi quand une
// construction est déjà en cours (elle le fera).
export async function requestFicheBuild(ctx: TenantContext): Promise<boolean> {
  const etat = await etatOf(ctx, (await readFiche(ctx)).length > 0);
  const refused = etat === 'sans-boite' || etat === 'faite';
  if (!refused && etat !== 'en-cours') await enqueueFicheBuild(ctx);
  return !refused;
}
