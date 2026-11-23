import type { HomeBrouillon, HomeDemande, HomeInconnu } from '@/server/portrait/screen';

// Le panneau de l'agent « Brouillons de réponse » sur l'Accueil (recherche/reply-drafts.tsx) : ce qui l'attend, mail
// par mail, et la ligne qui le compte. Module pur, que le navigateur lit : l'écran ne fait qu'afficher cet état.

// Ce qu'un mail attend : ses réponses aux questions de Leon, ou son oui à un inconnu (un geste d'elle) ; un brouillon
// prêt ; ou rien qu'un peu de temps : Leon écrit.
export type Sorte = 'questions' | 'inconnu' | 'pret' | 'ecrit';
// `key` : le mail et sa sorte (une demande et le brouillon qui la suit partagent la ligne, pas la clé). `id` : la
// ligne, que les gestes visent et que le panneau suit ; pour un inconnu avant son oui, son fil.
export type PanelMail = { key: string; id: string } & (
  | { sorte: 'questions'; mail: HomeDemande }
  | { sorte: 'inconnu'; mail: HomeInconnu }
  | { sorte: 'pret'; mail: HomeBrouillon }
  | { sorte: 'ecrit'; mail: HomeDemande | HomeInconnu }
);
// Ses gestes, par clé : le mail est parti (null : écarté, son non, ou plus ouvert), ou Leon l'écrit sur la ligne `id`
// (ses réponses envoyées, son oui à un inconnu).
export type Done = Record<string, string | null>;

const RANK: Record<Sorte, number> = { questions: 0, inconnu: 0, pret: 1, ecrit: 2 };

function toMail(one: HomeDemande | HomeInconnu | HomeBrouillon, done: Done): PanelMail | null {
  if ('texte' in one) {
    const key = `brouillon-${one.id}`;
    return done[key] === null ? null : { key, id: one.id, sorte: 'pret', mail: one };
  }
  if ('mail' in one) {
    const key = `inconnu-${one.mail.sourceId}`;
    const line = done[key];
    if (line === null) return null;
    return line === undefined
      ? { key, id: one.mail.sourceId, sorte: 'inconnu', mail: one }
      : { key, id: line, sorte: 'ecrit', mail: one };
  }
  const key = `demande-${one.id}`;
  if (done[key] === null) return null;
  return one.repondue || done[key] !== undefined
    ? { key, id: one.id, sorte: 'ecrit', mail: one }
    : { key, id: one.id, sorte: 'questions', mail: one };
}

// Les mails du panneau, dans l'ordre : ce qui attend un geste d'elle, puis les brouillons prêts, puis ce que Leon
// écrit ; les plus récents d'abord dans chaque sorte. Sans ceux qu'elle a fermés ici. `order` : les clés dans l'ordre
// où le panneau les a montrées en s'ouvrant ; tant qu'il est ouvert, un mail garde sa place (des réponses envoyées
// restent « Mail 2 sur 4 »), même quand l'Accueil relu change sa sorte, et ce qui arrive se range après.
export function panelMails(
  demandes: Array<HomeDemande | HomeInconnu>,
  prets: HomeBrouillon[],
  done: Done,
  order: string[] = [],
): PanelMail[] {
  const place = (key: string) => {
    const at = order.indexOf(key);
    return at < 0 ? order.length : at;
  };
  return [...demandes, ...prets]
    .flatMap((one) => toMail(one, done) ?? [])
    .sort(
      (a, b) =>
        RANK[a.sorte] - RANK[b.sorte] || b.mail.receivedAt.getTime() - a.mail.receivedAt.getTime(),
    )
    .sort((a, b) => place(a.key) - place(b.key));
}

// Ce que la ligne de l'Accueil compte : les mails à compléter (un geste d'elle), les brouillons prêts, et ceux que
// Leon écrit.
export function countsOf(mails: PanelMail[]) {
  const count = (...sortes: Sorte[]) => mails.filter((one) => sortes.includes(one.sorte)).length;
  return {
    toComplete: count('questions', 'inconnu'),
    ready: count('pret'),
    writing: count('ecrit'),
  };
}

// Le rang du mail montré : celui que `at` désigne (un brouillon qui arrive garde la ligne de sa demande), sinon le
// premier.
export const shownIndex = (mails: PanelMail[], at: string | null) =>
  Math.max(
    0,
    mails.findIndex((one) => one.id === at),
  );

// Le brouillon déposé dans ses brouillons Gmail : « Écarter » l'en supprime pour de bon, il demande d'abord.
export const confirmsDiscard = (mail: PanelMail) => mail.sorte === 'pret' && mail.mail.depose;

export type Panel = { done: Done; order: string[]; at: string | null };
export const CLOSED: Panel = { done: {}, order: [], at: null };
export type PanelAction =
  // Le panneau s'ouvre sur le premier mail, dans l'ordre de `keys`.
  | { type: 'open'; keys: string[] }
  // « Mail précédent », « Mail suivant ».
  | { type: 'show'; id: string }
  // Un geste a clos le mail `key` de `mails` (la liste montrée) : il s'en va (`id` null), ou Leon l'écrit sur `id`.
  | { type: 'close'; mails: PanelMail[]; key: string; id: string | null };

// Après un geste qui clôt un mail, le panneau passe au suivant. Au dernier, il montre celui d'avant quand le mail s'en
// va, ou reste sur lui quand Leon l'écrit (sa phrase le confirme). Plus rien : `at` vaut null, et la liste est vide.
export function panelReducer(panel: Panel, action: PanelAction): Panel {
  switch (action.type) {
    case 'open':
      return { ...panel, order: action.keys, at: null };
    case 'show':
      return { ...panel, at: action.id };
    case 'close': {
      const at = action.mails.findIndex((one) => one.key === action.key);
      const next = action.mails[at + 1]?.id ?? action.id ?? action.mails[at - 1]?.id ?? null;
      return { ...panel, done: { ...panel.done, [action.key]: action.id }, at: next };
    }
  }
}
