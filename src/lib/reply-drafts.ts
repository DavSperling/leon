import type {
  HomeBrouillon,
  HomeDemande,
  HomePreference,
  HomeRelance,
  HomeSansReponse,
} from '@/server/portrait/screen';

// Le panneau des agents « Brouillons de réponse » et « Relances » sur l'Accueil (recherche/reply-drafts.tsx) : ce qui
// l'attend, mail par mail, et la ligne qui le compte. Module pur, que le navigateur lit : l'écran ne fait qu'afficher
// cet état.

// Ce qu'un mail attend : ses réponses aux questions de Leon, son oui ou son non à une relance de son mail resté sans
// réponse, ou à une préférence d'écriture tirée de sa retouche (un geste d'elle) ; un brouillon prêt ; ou rien qu'un
// peu de temps : Leon écrit. À part de la pile, un mail que Leon a jugé sans réponse à donner (sansReponse) : il
// n'attend rien d'elle, et ne se montre que par l'entrée du bas de « À vous » (quietMails).
export type Sorte = 'questions' | 'relance' | 'preference' | 'pret' | 'ecrit' | 'sansReponse';
// `key` : le mail et sa sorte (une demande et le brouillon qui la suit partagent la ligne, pas la clé). `id` : la
// ligne, que les gestes visent et que le panneau suit ; pour une relance avant son oui, son fil.
export type PanelMail = { key: string; id: string } & (
  | { sorte: 'questions'; mail: HomeDemande }
  | { sorte: 'relance'; mail: HomeRelance }
  | { sorte: 'preference'; mail: HomePreference }
  | { sorte: 'pret'; mail: HomeBrouillon }
  | { sorte: 'ecrit'; mail: HomeDemande | HomeRelance }
  | { sorte: 'sansReponse'; mail: HomeSansReponse }
);
// Ses gestes, par clé : le mail est parti (null : écarté, son non, ou plus ouvert), ou Leon l'écrit sur la ligne `id`
// (ses réponses envoyées, son oui à une relance).
export type Done = Record<string, string | null>;

const RANK: Record<Sorte, number> = {
  questions: 0,
  relance: 0,
  preference: 0,
  pret: 1,
  ecrit: 2,
  sansReponse: 3,
};

function toMail(
  one: HomeDemande | HomePreference | HomeRelance | HomeBrouillon,
  done: Done,
): PanelMail | null {
  if ('texte' in one) {
    const key = `brouillon-${one.id}`;
    return done[key] === null ? null : { key, id: one.id, sorte: 'pret', mail: one };
  }
  // Son mail resté sans réponse : sa question, puis, après son oui, Leon écrit sur sa ligne.
  if ('mail' in one) {
    const key = `relance-${one.mail.sourceId}`;
    const line = done[key];
    if (line === null) return null;
    return line === undefined
      ? { key, id: one.mail.sourceId, sorte: 'relance', mail: one }
      : { key, id: line, sorte: 'ecrit', mail: one };
  }
  if ('preference' in one) {
    const key = `preference-${one.id}`;
    return done[key] === null ? null : { key, id: one.id, sorte: 'preference', mail: one };
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
  demandes: Array<HomeDemande | HomePreference | HomeRelance>,
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

// Ses mails que Leon a jugés sans réponse à donner (portrait/sans-reponse.ts), que l'entrée du bas de « À vous » compte
// et que son panneau montre, dans l'ordre où l'Accueil les a lus (les plus récents d'abord). Sans ceux qu'un geste a
// fait partir ici : vu (« Terminé »), supprimé, ou sa réponse demandée, que Leon écrit alors dans la pile.
export const quietMails = (sansReponse: HomeSansReponse[], done: Done): PanelMail[] =>
  sansReponse
    .map(
      (mail): PanelMail => ({
        key: `sans-reponse-${mail.id}`,
        id: mail.id,
        sorte: 'sansReponse',
        mail,
      }),
    )
    .filter((one) => done[one.key] !== null);

// Ce que la ligne de l'Accueil compte : les mails à compléter, les préférences à valider et les relances à décider (un
// geste d'elle), les brouillons prêts, et ceux que Leon écrit.
export function countsOf(mails: PanelMail[]) {
  const count = (...sortes: Sorte[]) => mails.filter((one) => sortes.includes(one.sorte)).length;
  return {
    toComplete: count('questions'),
    toConfirm: count('preference'),
    toFollowUp: count('relance'),
    ready: count('pret'),
    writing: count('ecrit'),
  };
}

// Un mail de l'agent « Relances » : sa question, ses questions, la relance que Leon écrit ou qui est prête. Ses mots
// le disent (« Envoyé le », « Relance prête »).
export const isRelance = (mail: PanelMail) => 'relance' in mail.mail && mail.mail.relance;

// Le rang du mail montré : celui que `at` désigne (un brouillon qui arrive garde la ligne de sa demande), sinon le
// premier.
export const shownIndex = (mails: PanelMail[], at: string | null) =>
  Math.max(
    0,
    mails.findIndex((one) => one.id === at),
  );

// Le brouillon déposé dans ses brouillons Gmail : « Écarter » l'en supprime pour de bon, il demande d'abord.
export const confirmsDiscard = (mail: PanelMail) => mail.sorte === 'pret' && mail.mail.depose;

// « Supprimer » met le mail reçu à la corbeille de sa boîte Gmail (portrait/brouillon-depot.ts, trashMail) : seulement
// un mail reçu qui a sa ligne (ses questions, son brouillon prêt, la réponse que Leon écrit, ou un mail jugé sans
// réponse à donner), relevé par Gmail. Jamais son propre mail (une relance, à chaque étape), ni une préférence.
export const canTrash = (mail: PanelMail) =>
  mail.sorte !== 'relance' &&
  mail.sorte !== 'preference' &&
  !isRelance(mail) &&
  mail.mail.source.kind === 'gmail';

// La confirmation ouverte (« Écarter ce brouillon ? », « Envoyer … ? », « Supprimer ce mail ? ») ne vaut que pour le
// mail qui l'a demandée : un autre mail montré (un clic dans la liste, un accueil relu), elle se ferme, et rien ne
// tombe sur lui.
export type Asking = { type: 'discard' | 'send' | 'trash'; key: string } | null;
export const askingFor = (asking: Asking, shown: PanelMail | undefined) =>
  asking !== null && asking.key === shown?.key ? asking.type : false;

// La question avant « Envoyer » un brouillon déposé (draftQuestions.sendDraft) : à qui il part, de la façon la plus
// courte. Une réponse nomme son correspondant ; une relance, son premier destinataire, et compte les autres, en « à »
// et en copie. Sans nom, la question ne nomme personne : une relance déposée en a toujours un (brouillon-depot.ts).
export function sendQuestion(mail: PanelMail): {
  key: 'confirm' | 'confirmAnon' | 'confirmRelance' | 'confirmRelanceMany';
  values: Record<string, string | number>;
} {
  const { from } = mail.mail;
  const others = mail.sorte === 'pret' ? mail.mail.others : 0;
  if (from === null) return { key: 'confirmAnon', values: {} };
  if (!isRelance(mail)) return { key: 'confirm', values: { name: from } };
  return others > 0
    ? { key: 'confirmRelanceMany', values: { name: from, count: others } }
    : { key: 'confirmRelance', values: { name: from } };
}

// « Ne plus me demander », coché dans une confirmation (envoyer un brouillon, supprimer un mail) : retenu dans ce
// navigateur seulement, geste par geste, et relu au moment du clic. Un navigateur sans stockage, ou qui le refuse,
// demande toujours.
export const SKIP_SEND = 'leon-envoyer-sans-demander';
export const SKIP_TRASH = 'leon-supprimer-sans-demander';
export function skipsConfirm(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'oui';
  } catch {
    return false;
  }
}
export function rememberSkip(key: string): void {
  try {
    localStorage.setItem(key, 'oui');
  } catch {}
}

// « Ne plus me demander » ne vaut pas pour une relance qui part à plusieurs : la question est le seul endroit qui dit
// à combien de personnes elle part, et un mail envoyé ne se rattrape pas.
export const sendAlwaysAsks = (mail: PanelMail) => sendQuestion(mail).key === 'confirmRelanceMany';

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
