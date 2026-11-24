import { and, eq } from 'drizzle-orm';
import { linesOf } from '@/lib/fiche-view';
import type { TenantContext } from '@/server/auth/tenant-context';
import { listConnections } from '@/server/connectors/connections';
import { lignesFiche, reponsesAgent } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { briefingSources } from '@/server/discussion/citation-sources';
import { logError } from '@/server/log';
import type { AgentId } from './agents';
import { type Demande, HOME_MAX, type ReadyBrouillon, readShown } from './brouillons';
import { type FicheLine, readFiche } from './fiche';
import { type ProposedPreference, readProposedPreferences } from './preferences';
import { type Proposal, readProposals } from './propositions';
import { enqueueFicheBuild, ficheBuildCompleted, ficheBuildPending } from './queue';
import { MAIL_KINDS } from './sent-mails';
import { synthesisDone } from './synthese';
import { readUnansweredMails, type UnansweredMail } from './unanswered-mails';
import { readUnknownMails, type UnknownMail } from './waiting-mails';

// La fiche pour l'écran « Ma fiche » des réglages : son rôle et ses tâches, les préférences d'écriture qu'elle a
// acceptées, où en est sa construction, les sources de ses tâches, et les agents de départ qui lui sont proposés. Et,
// pour l'accueil seulement, ce que les agents « Brouillons de réponse » et « Relances » ont pour elle
// (readHomeBrouillons). Tout se lit sous les droits de la personne, et rien d'autre ne lit sa fiche.

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
  // Son rôle, ses tâches et ses préférences d'écriture acceptées seulement.
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
// briefingSources (200). Ses brouillons de réponse ne se lisent pas ici : ils ne se montrent que sur l'accueil.
export async function readFicheScreen(ctx: TenantContext): Promise<FicheScreen> {
  const all = await readFiche(ctx);
  // L'écran ne montre que son rôle, ses tâches et ses préférences acceptées : les mesures calculées sur ses mails, les
  // préférences proposées ou refusées et l'issue de ses brouillons restent en base.
  const lines = all.filter(
    (line) =>
      line.genre === 'role' ||
      line.genre === 'tache' ||
      (line.genre === 'preference' && 'etat' in line.valeur && line.valeur.etat === 'acceptee'),
  );
  const taskIds = [...new Set(linesOf(lines, 'tache').flatMap((line) => line.valeur.sources))];
  const [etat, seen, agents] = await Promise.all([
    etatOf(ctx, all.length > 0),
    briefingSources(ctx, taskIds),
    // Les mesures servent à proposer, sans partir vers l'écran : il ne reçoit que l'agent et sa réponse.
    readProposals(ctx, all),
  ]);
  const found = new Map(
    seen.map(({ sourceId, title, url, kind }) => [sourceId, { title, url, kind }]),
  );
  const sources = Object.fromEntries(
    taskIds.flatMap((id) => {
      const source = found.get(id);
      return source ? [[id, source]] : [];
    }),
  );
  return { etat, lines, sources, agents };
}

// Une demande de Leon, telle que l'accueil la montre : le correspondant, le fil (son objet, lié à son outil), la date du
// mail reçu, les questions et leurs choix, et si elle y a répondu. `id` sert à lui répondre ou à l'écarter. Ni ses
// réponses, ni rien d'autre, ne part vers l'accueil.
export type HomeDemande = Omit<Demande, 'sourceId'> & { source: FicheSource };
// Un brouillon prêt, tel que l'accueil le montre : le correspondant, le fil (son objet, lié à son outil), la date du
// mail reçu, le texte du brouillon, s'il est déposé dans ses brouillons Gmail, et, pour une relance, le nombre de ses
// autres destinataires (la question avant « Envoyer »). `id` sert aux gestes « Écarter » et « Envoyer ».
export type HomeBrouillon = Omit<ReadyBrouillon, 'sourceId'> & { source: FicheSource };
// Le mail d'un inconnu qui l'attend, tel que l'accueil le montre : son auteur, le fil (son objet, lié à son outil), la
// date du mail. `mail` sert à lui répondre « Oui » ou « Non ». Rien de son texte.
export type HomeInconnu = Pick<UnknownMail, 'from' | 'receivedAt'> & {
  mail: Pick<UnknownMail, 'sourceId' | 'message'>;
  source: FicheSource;
};
// Une préférence d'écriture que Leon a tirée d'une retouche, telle que l'accueil la propose : le correspondant du mail
// dont elle a retouché le brouillon, la date de ce mail, le fil (son objet, lié à son outil), et la préférence. `id`
// sert à lui répondre « Oui » ou « Non ». Rien du mail, ni de sa réponse.
export type HomePreference = Omit<ProposedPreference, 'sourceId'> & { source: FicheSource };
// Son mail resté sans réponse, tel que l'accueil lui demande si elle veut une relance : `from`, le nom de son premier
// destinataire qui n'est pas elle, et `others`, ses autres destinataires en « à » ; `receivedAt`, la date de son mail
// (les mots du panneau sont ceux de tous ses mails) ; le fil (son objet, lié à son outil). `mail` sert à lui répondre
// « Oui » ou « Non ». Rien de son texte, ni d'adresse que le nom.
export type HomeRelance = Pick<UnansweredMail, 'others'> & {
  relance: true;
  from: string;
  receivedAt: Date;
  mail: Pick<UnansweredMail, 'sourceId' | 'message'>;
  source: FicheSource;
};
export type HomeBrouillons = {
  demandes: Array<HomeDemande | HomeInconnu | HomePreference | HomeRelance>;
  prets: HomeBrouillon[];
};

// Elle a dit oui à « Relances » : sa réponse enregistrée, une ligne. Sans ce oui, ses mails sans réponse ne se lisent
// pas (une lecture du coût de celle des mails d'inconnus, pour rien) ; avec lui, readProposals redit ensuite que
// l'agent lui est toujours proposé.
async function saidYesToRelances(ctx: TenantContext): Promise<boolean> {
  const [answer] = await withTenant(ctx, (tx) =>
    tx
      .select({ oui: reponsesAgent.oui })
      .from(reponsesAgent)
      .where(
        and(
          eq(reponsesAgent.tenantId, ctx.tenantId),
          eq(reponsesAgent.userId, ctx.userId),
          eq(reponsesAgent.agent, 'relance'),
        ),
      ),
  );
  return answer?.oui === true;
}

// Ce que les agents « Brouillons de réponse » et « Relances » ont pour elle, pour l'accueil : les demandes de Leon, les
// mails d'inconnus qui l'attendent (waiting-mails.ts), les préférences d'écriture qu'il lui propose (preferences.ts) et
// ses mails restés sans réponse, à relancer ou non (unanswered-mails.ts), puis les brouillons prêts, relances comprises,
// les plus récents d'abord, HOME_MAX (vingt) au plus de chaque sorte (brouillons.ts). L'accueil n'en montre qu'une
// ligne ; son panneau les range (lib/reply-drafts.ts). Ce qui vient d'un agent ne se montre que tant qu'elle lui dit oui,
// à lui, et qu'il lui est proposé : après un « non », ses lignes restent en base, et un nouveau « oui » les remontre
// sans rappeler le modèle. Lu à chaque chargement de l'accueil : ses lignes, les mails d'inconnus et, après son oui à
// « Relances », ses mails sans réponse d'abord, sa fiche et ses outils seulement s'il y a de quoi montrer.
export async function readHomeBrouillons(ctx: TenantContext): Promise<HomeBrouillons> {
  const [shown, unknown, preferences, unanswered] = await Promise.all([
    readShown(ctx),
    // En panne, les mails d'inconnus manquent, sans emporter ses demandes ni ses brouillons prêts.
    readUnknownMails(ctx, HOME_MAX).catch((error) => {
      logError('accueil.inconnus', error, { userId: ctx.userId });
      return [];
    }),
    readProposedPreferences(ctx, HOME_MAX),
    // De même ses mails sans réponse, lus seulement après son oui à « Relances ».
    saidYesToRelances(ctx)
      .then((oui) => (oui ? readUnansweredMails(ctx, HOME_MAX) : []))
      .catch((error) => {
        logError('accueil.relances', error, { userId: ctx.userId });
        return [];
      }),
  ]);
  const inconnus = unknown.map(({ message, ...one }) => ({
    ...one,
    mail: { sourceId: one.sourceId, message },
  }));
  const aRelancer = unanswered.map(({ message, to, sentAt, ...one }) => ({
    ...one,
    relance: true as const,
    from: to,
    receivedAt: sentAt,
    mail: { sourceId: one.sourceId, message },
  }));
  const sourceIds = [
    ...shown.demandes,
    ...inconnus,
    ...preferences,
    ...aRelancer,
    ...shown.prets,
  ].map((one) => one.sourceId);
  if (sourceIds.length === 0) return { demandes: [], prets: [] };
  const [agents, seen] = await Promise.all([
    readProposals(ctx, await readFiche(ctx)),
    briefingSources(ctx, sourceIds),
  ]);
  const oui = (agent: AgentId) => agents.some((one) => one.agent === agent && one.oui);
  const reponses = oui('brouillon-reponse');
  const relances = oui('relance');
  if (!reponses && !relances) return { demandes: [], prets: [] };
  // Ses lignes, chacune sur le oui à son agent.
  const mine = <T extends { relance: boolean }>(rows: T[]) =>
    rows.filter((one) => (one.relance ? relances : reponses));
  // Le fil se relit sous ses droits : une ligne dont elle ne voit plus le fil ne part pas vers l'accueil.
  const withSource = <T extends { sourceId: string }>(rows: T[]) =>
    rows.flatMap(({ sourceId, ...one }) => {
      const source = seen.find((found) => found.sourceId === sourceId);
      return source
        ? [{ ...one, source: { title: source.title, url: source.url, kind: source.kind } }]
        : [];
    });
  // Les mails d'inconnus, les préférences proposées et ses mails sans réponse partagent les places des demandes : celles qui attendent un geste
  // d'elle se comptent d'abord, les plus récentes d'abord, puis tout se rend par date du mail.
  const recent = (a: { receivedAt: Date }, b: { receivedAt: Date }) =>
    b.receivedAt.getTime() - a.receivedAt.getTime();
  const writing = (one: HomeBrouillons['demandes'][number]) => 'repondue' in one && one.repondue;
  const demandes = [
    ...withSource(mine(shown.demandes)),
    ...(reponses ? [...withSource(inconnus), ...withSource(preferences)] : []),
    ...(relances ? withSource(aRelancer) : []),
  ]
    .sort((a, b) => Number(writing(a)) - Number(writing(b)) || recent(a, b))
    .slice(0, HOME_MAX)
    .sort(recent);
  return { demandes, prets: withSource(mine(shown.prets)).slice(0, HOME_MAX) };
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
