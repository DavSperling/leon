import type { ProviderId } from '@/capture/turn';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';

// Le modèle de l'étape Vos outils : fonctions pures, sans 'use client'.

export type ToolState = {
  item: CatalogItem;
  recommended: boolean;
  /**
   * mine : branché avec mon compte, même s'il est en erreur (voir `broken`) ; team : branché par un collègue
   * (ma lecture suffit) ; free : à brancher.
   */
  status: 'mine' | 'team' | 'free';
  /** Ma propre connexion de cet outil quand elle est en erreur : elle ne lit plus rien, il faut la reconnecter. Jamais celle d'un collègue. */
  broken: ConnectionView | null;
  /** Le premier collègue qui l'a branché pour l'espace ; jamais pour un outil dont le texte reste privé à qui le branche. */
  connectedBy: string | null;
};

/**
 * Où en est chaque outil pour le lecteur, dans l'ordre du catalogue. Une connexion en pause compte pour l'espace ;
 * celle d'un ancien membre ou en erreur ne lit plus rien, l'outil reste à brancher.
 */
export function toolStates(
  catalog: CatalogItem[],
  conns: ConnectionView[],
  recommended: readonly ProviderId[],
): ToolState[] {
  return catalog.map((item) => {
    const own = conns.filter((conn) => conn.provider === item.id);
    const connectedBy = item.privateRaw
      ? null
      : (own.find((conn) => !conn.isCreator && !conn.creatorLeft && conn.status !== 'error')
          ?.createdBy.name ?? null);
    const status = own.some((conn) => conn.isCreator)
      ? 'mine'
      : connectedBy !== null
        ? 'team'
        : 'free';
    const broken = own.find((conn) => conn.isCreator && conn.status === 'error') ?? null;
    return { item, recommended: recommended.includes(item.id), status, connectedBy, broken };
  });
}

/** Un propriétaire seul invite ses collaborateurs ensuite ; les autres arrivent à la fin. */
export const nextAfterTools = (
  isSoleOwner: boolean,
): '/bienvenue/collaborateurs' | '/bienvenue/pret' =>
  isSoleOwner ? '/bienvenue/collaborateurs' : '/bienvenue/pret';
