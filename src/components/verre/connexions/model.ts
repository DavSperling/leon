import type { CaptureKind, ProviderId } from '@/capture/turn';
import { toolStates } from '@/components/verre/onboarding/tools-model';
import { canReconnect } from '@/lib/connection-form';
import { formatDate } from '@/lib/format';
import { fold } from '@/lib/verre/text';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';

// Modèle de l'écran Connexions : ordre des outils branchés, ligne de la clé. Fonctions pures, sans 'use client'.

const rank = (c: Pick<ConnectionView, 'status' | 'creatorLeft'>) =>
  c.creatorLeft || c.status === 'error' ? 0 : c.status === 'paused' ? 1 : 2;

/** Les outils qui ont au moins une connexion : les problèmes d'abord (en erreur, arrêtée), puis en pause, puis l'ordre du catalogue. */
export const connectedTools = <T extends Pick<CatalogItem, 'id'>>(
  catalog: T[],
  conns: ReadonlyArray<Pick<ConnectionView, 'provider' | 'status' | 'creatorLeft'>>,
): T[] =>
  catalog
    .map((p) => ({ p, r: Math.min(...conns.filter((c) => c.provider === p.id).map(rank)) }))
    .filter((x) => x.r !== Infinity)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.p);

/** Les outils de `ids` (dans leur ordre) que la personne doit encore brancher : disponibles, et ni les siens ni ceux
 *  qu'un collègue lit déjà pour l'équipe (la règle de `toolStates`, la même qu'à l'étape Vos outils). */
export const recommendedToConnect = (
  catalog: CatalogItem[],
  conns: ConnectionView[],
  ids: readonly ProviderId[],
): CatalogItem[] => {
  const todo = new Map(
    toolStates(catalog, conns, ids)
      .filter((s) => s.status === 'free' && s.item.available)
      .map((s) => [s.item.id, s.item]),
  );
  return ids.flatMap((id) => todo.get(id) ?? []);
};

/** L'endroit des Réglages où chaque canal de capture se règle : les sessions des outils de code par la commande
 *  d'installation des ordinateurs, claude.ai et ChatGPT par l'extension, `remember` (MCP) par un assistant branché. */
export const CAPTURE_SETTINGS: Record<CaptureKind, string> = {
  claude_code: '/reglages#ordinateurs',
  codex: '/reglages#ordinateurs',
  cursor: '/reglages#ordinateurs',
  antigravity: '/reglages#ordinateurs',
  claude_ai: '/reglages#extension',
  chatgpt: '/reglages#extension',
  mcp_remember: '/reglages#assistants',
};

type CardConn = Pick<
  ConnectionView,
  'provider' | 'status' | 'creatorLeft' | 'nextSyncAt' | 'isCreator' | 'createdBy' | 'partage'
>;

/** Qui voit ce qu'une connexion relève : son choix, sinon celui de l'outil (privé à qui branche, ou l'équipe).
 *  GitHub : toujours l'équipe (les dépôts d'équipe, choisis par un administrateur). */
export const scopeOf = (c: Pick<CardConn, 'provider' | 'partage'>, privateRaw: boolean): string =>
  c.provider === 'github' ? 'equipe' : (c.partage ?? (privateRaw ? 'moi' : 'equipe'));

/** Ce qui ne va pas sur une connexion, en un mot : arrêtée (créateur parti), déconnectée (refus d'accès : la relève
 *  ne repartira pas seule, `nextSyncAt` nul), erreur de relève (elle réessaie), sinon rien. */
export const troubleOf = (
  c: Pick<CardConn, 'status' | 'creatorLeft' | 'nextSyncAt'>,
): 'stopped' | 'disconnected' | 'syncError' | null =>
  c.creatorLeft
    ? 'stopped'
    : c.status !== 'error'
      ? null
      : c.nextSyncAt
        ? 'syncError'
        : 'disconnected';

/** La carte d'un outil branché : la connexion qu'elle raconte et sa légende. Un problème d'abord (celui de la
 *  personne, qu'elle peut réparer), puis « En pause » si toutes le sont, sinon qui voit (sa connexion, ou la première).
 *  `reconnect` : la personne a branché la connexion en panne, elle seule peut la reconnecter. */
export function cardOf<C extends CardConn>(
  conns: readonly C[],
  viewerId: string,
): {
  conn: C;
  caption: 'stopped' | 'disconnected' | 'syncError' | 'paused' | 'scope';
  reconnect: boolean;
} | null {
  const broken = conns.filter((c) => troubleOf(c));
  const pick = broken.find((c) => c.isCreator && !c.creatorLeft) ?? broken[0];
  if (pick) {
    const caption = troubleOf(pick) ?? 'syncError';
    return { conn: pick, caption, reconnect: pick.isCreator && caption !== 'stopped' };
  }
  const first = conns.find((c) => c.createdBy.id === viewerId) ?? conns[0];
  if (!first) return null;
  return {
    conn: first,
    caption: conns.every((c) => c.status === 'paused') ? 'paused' : 'scope',
    reconnect: false,
  };
}

/** Le titre d'un bloc quand un outil a plusieurs comptes : qui l'a branché, sinon (la même personne deux fois) le compte. */
export const blockHeading = (
  c: Pick<ConnectionView, 'label' | 'createdBy'>,
  conns: readonly Pick<ConnectionView, 'createdBy'>[],
): string =>
  conns.filter((o) => o.createdBy.id === c.createdBy.id).length > 1 ? c.label : c.createdBy.name;

/** Le filtre du catalogue : une famille (null : toutes) et des lettres, sans accents, dans le nom ou la famille. */
export const matchTool = (
  p: Pick<CatalogItem, 'label' | 'family'>,
  family: string | null,
  query: string,
  familyLabel: string,
): boolean => {
  const q = fold(query.trim());
  return (
    (family === null || p.family === family) &&
    (!q || fold(p.label).includes(q) || fold(familyLabel).includes(q))
  );
};

/** « Clé ••••abcd » (« Jeton » pour une connexion par bouton). */
export const credentialText = (c: ConnectionView, locale = 'fr'): string =>
  `${canReconnect(c) ? (locale === 'en' ? 'Token' : 'Jeton') : locale === 'en' ? 'Key' : 'Clé'} ••••${c.secretHint}`;

/** « Clé ••••abcd · branché par Julie le 12 oct. 2026 » (« Jeton » pour OAuth), toujours avec la date, même aujourd'hui. */
export const secretText = (c: ConnectionView, locale = 'fr'): string =>
  locale === 'en'
    ? `${canReconnect(c) ? 'Token' : 'Key'} ••••${c.secretHint} · connected by ${c.createdBy.name} on ${formatDate(c.createdAt, locale)}`
    : `${canReconnect(c) ? 'Jeton' : 'Clé'} ••••${c.secretHint} · branché par ${c.createdBy.name} le ${formatDate(c.createdAt)}`;

/** L'état d'un outil, tous comptes confondus : en panne dès qu'un compte l'est, en pause si tous le sont. */
export const toolState = (
  conns: ReadonlyArray<Pick<ConnectionView, 'status' | 'creatorLeft'>>,
): 'ok' | 'paused' | 'error' =>
  conns.some((c) => c.creatorLeft || c.status === 'error')
    ? 'error'
    : conns.length > 0 && conns.every((c) => c.status === 'paused')
      ? 'paused'
      : 'ok';
