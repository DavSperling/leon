import { PROVIDER_IDS, type ProviderId } from '@/capture/turn';
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
  /** Proposé à l'onboarding : branchable en un clic, ou déjà branché ; sinon « Bientôt ». */
  ready: boolean;
};

/** Un outil qui se branche en un clic sur ce serveur, essayé en vrai ou non (choix de David, 05/11). */
export const onboardingReady = (item: Pick<CatalogItem, 'available' | 'oauthReady'>): boolean =>
  item.available && item.oauthReady;

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
    return {
      item,
      recommended: recommended.includes(item.id),
      status,
      connectedBy,
      broken,
      ready: status !== 'free' || onboardingReady(item),
    };
  });
}

/** « Vos outils de code » vient en tête pour un service dont les outils conseillés comprennent GitHub ou GitLab (il travaille dans un dépôt), à la fin sinon. */
export const codeToolsFirst = (states: ToolState[]): boolean =>
  states.some((s) => s.recommended && (s.item.id === 'github' || s.item.id === 'gitlab'));

/** Les outils cochés d'abord : les conseillés encore à brancher, parmi ceux qu'on propose. */
export const defaultChecked = (states: ToolState[]): ReadonlySet<ProviderId> =>
  new Set(
    states.filter((s) => s.recommended && s.status === 'free' && s.ready).map((s) => s.item.id),
  );

/**
 * La file « Branchez-les un par un », dans l'ordre du catalogue : mes outils déjà branchés (faits, ou à reconnecter)
 * et ceux que j'ai choisis parmi les outils proposés.
 */
export const connectQueue = (states: ToolState[], chosen: ReadonlySet<ProviderId>): ToolState[] =>
  states.filter(
    (s) => s.status === 'mine' || (s.status === 'free' && s.ready && chosen.has(s.item.id)),
  );

// Le choix survit au départ chez l'éditeur (le retour recharge la page) : un cookie lu par la page, au nom de la
// personne pour qu'un autre compte du même navigateur ne le reprenne pas. Rien n'est gardé en base.
export const TOOLS_COOKIE = 'leon_outils';

export const toolsCookieValue = (userId: string, ids: readonly ProviderId[]): string =>
  `${userId}:${ids.join(',')}`;

/** Le choix gardé pour cette personne ; null s'il n'y en a pas (ou qu'il est à quelqu'un d'autre). */
export function chosenTools(raw: string | undefined, userId: string): ProviderId[] | null {
  if (!raw) return null;
  const at = raw.lastIndexOf(':');
  if (at < 0 || raw.slice(0, at) !== userId) return null;
  const ids = raw.slice(at + 1).split(',');
  return PROVIDER_IDS.filter((id) => ids.includes(id));
}

/** Un propriétaire seul invite ses collaborateurs ensuite ; les autres arrivent à la fin. */
export const nextAfterTools = (
  isSoleOwner: boolean,
): '/bienvenue/collaborateurs' | '/bienvenue/pret' =>
  isSoleOwner ? '/bienvenue/collaborateurs' : '/bienvenue/pret';
