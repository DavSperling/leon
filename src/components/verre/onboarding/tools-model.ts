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

/** « Vos outils de code » vient en tête pour un service dont les outils conseillés comprennent GitHub ou GitLab (il travaille dans un dépôt), à la fin sinon. */
export const codeToolsFirst = (states: ToolState[]): boolean =>
  states.some((s) => s.recommended && (s.item.id === 'github' || s.item.id === 'gitlab'));

/** Les outils cochés d'abord : les conseillés encore à brancher. */
export const defaultChecked = (states: ToolState[]): ReadonlySet<ProviderId> =>
  new Set(
    states
      .filter((s) => s.recommended && s.status === 'free' && s.item.available)
      .map((s) => s.item.id),
  );

/**
 * Les outils cochés gardés dans l'onglet (un branchement OAuth quitte la page) : seulement ceux de la liste ; null
 * pour une valeur illisible ou absente.
 */
export function savedChecked(
  states: ToolState[],
  raw: string | null,
): ReadonlySet<ProviderId> | null {
  let saved: unknown;
  try {
    saved = JSON.parse(raw ?? 'null');
  } catch {
    return null;
  }
  if (!Array.isArray(saved)) return null;
  return new Set(
    states.filter((s) => s.item.available && saved.includes(s.item.id)).map((s) => s.item.id),
  );
}

/** Un propriétaire seul invite ses collaborateurs ensuite ; les autres arrivent à la fin. */
export const nextAfterTools = (
  isSoleOwner: boolean,
): '/bienvenue/collaborateurs' | '/bienvenue/pret' =>
  isSoleOwner ? '/bienvenue/collaborateurs' : '/bienvenue/pret';
