import type { ProviderId } from '@/capture/turn';
import { toolStates } from '@/components/verre/onboarding/tools-model';
import { canReconnect } from '@/lib/connection-form';
import { formatDate } from '@/lib/format';
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

/** « Clé ••••abcd · branché par Julie le 12 oct. 2026 » (« Jeton » pour OAuth), toujours avec la date, même aujourd'hui. */
export const secretText = (c: ConnectionView, locale = 'fr'): string =>
  locale === 'en'
    ? `${canReconnect(c) ? 'Token' : 'Key'} ••••${c.secretHint} · connected by ${c.createdBy.name} on ${formatDate(c.createdAt, locale)}`
    : `${canReconnect(c) ? 'Jeton' : 'Clé'} ••••${c.secretHint} · branché par ${c.createdBy.name} le ${formatDate(c.createdAt)}`;
