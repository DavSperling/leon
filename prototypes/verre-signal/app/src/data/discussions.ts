import { useSyncExternalStore } from 'react';
import { minutesAgo, NOW, paris } from '@/lib/format';
import { nb } from '@/lib/nb';
import { fold } from '@/lib/text';
import { getItem } from './corpus';
import { kindLabel, type SourceKind } from './providers';
import { search, TOPICS } from './search';

// Discussions privées avec Leon : 8 fils, dont 3 complets (ACME, budget) et un qui attend sa réponse.
// Dans les textes, {id} est un renvoi vers un élément du corpus ; il devient [n] dans l'ordre d'apparition.

export type CitedSource = { n: number; itemId: string; title: string; url: string | null; kind: SourceKind; kindLabel: string };
export type Message =
  | { id: string; role: 'user'; at: Date; text: string; /** « À partir de N résultats de la recherche » */ seeds?: number }
  | { id: string; role: 'assistant'; at: Date; /** avec renvois [n] */ text: string; sources: CitedSource[]; /** fin fixe (refus, rien trouvé, limite atteinte) */ fixed?: boolean };
export type Discussion = { id: string; title: string; updatedAt: Date; messages: Message[] };

/** Textes de fin et d'activité, copie exacte du vrai Leon. */
export const FIXED_TEXTS = {
  refusal: 'Je ne peux pas répondre à cette demande.',
  empty: nb('Je ne sais pas : je n’ai rien trouvé à répondre.'),
  limit: nb('Je me suis arrêté avant la fin : la limite de recherches et de lectures pour une réponse est atteinte. Posez une question plus précise pour que je continue.'),
} as const;
export const ACTIVITY_LABELS = {
  thinking: 'Leon réfléchit…',
  searching: 'Leon cherche dans la mémoire…',
  reading: 'Leon lit une source…',
  activity: 'Leon regarde l’activité récente…',
  working: 'Leon travaille…',
  resuming: 'Leon termine une réponse commencée plus tôt…',
} as const;

/** Transforme les {id} en [n] (ordre d'apparition) et liste les sources citées. */
export function cite(text: string): { text: string; sources: CitedSource[] } {
  const sources: CitedSource[] = [];
  const out = text.replace(/ ?\{([\w-]+)\}/g, (_, id: string) => {
    const item = getItem(id);
    if (!item) return '';
    let s = sources.find((x) => x.itemId === id);
    if (!s) {
      s = { n: sources.length + 1, itemId: id, title: item.title ?? 'Sans titre', url: item.url, kind: item.kind, kindLabel: kindLabel(item.kind) };
      sources.push(s);
    }
    return ` [${s.n}]`;
  });
  return { text: nb(out), sources };
}

let seq = 0;
const user = (at: string | Date, text: string, seeds?: number): Message => ({ id: `m${++seq}`, role: 'user', at: typeof at === 'string' ? paris(at) : at, text: nb(text), seeds });
const leon = (at: string | Date, text: string): Message => ({ id: `m${++seq}`, role: 'assistant', at: typeof at === 'string' ? paris(at) : at, ...cite(text) });
const thread = (id: string, messages: Message[]): Discussion => ({ id, title: messages[0]!.text, updatedAt: messages.at(-1)!.at, messages });

export const DISCUSSIONS: Discussion[] = [
  thread('ovh-echeance', [user(minutesAgo(4), 'Qui s’occupe du renouvellement OVH, et pour quelle date ?')]),
  thread('acme-renouvellement', [
    user('2026-10-21 08:41', 'Où en est le renouvellement du contrat ACME ?', 5),
    leon('2026-10-21 08:41', TOPICS.find((t) => t.id === 'acme')!.text),
    user('2026-10-21 08:44', 'Quelle remise a-t-on proposée exactement, et jusqu’à quand ?'),
    leon('2026-10-21 08:44', 'Une remise de 15 % la première année sur le plan Zéphyr, valable si le contrat est signé avant le 31 octobre {fathom-call-acme}. C’est la remise de lancement prévue pour un renouvellement ; un nouveau contrat n’aurait que 10 % {notion-zephyr}. David l’a validée le 14 octobre {mcp-remise-acme}. Le brouillon d’avenant prévoit ensuite 10 % la deuxième année {cc-avenant-acme}.'),
    user('2026-10-21 08:52', 'Qu’est-ce qui bloque encore côté produit ?'),
    leon('2026-10-21 08:53', 'Seulement l’export SSO (LIN-42) : ACME en fait une condition de signature {linear-lin-42}. La PR #131 qui ajoute l’export des métadonnées SAML est relue {github-pr-131}, et Thomas Roux confirme le déploiement jeudi 22 octobre {claap-pipeline}. Côté contrat, il reste deux remarques du juridique d’ACME, sur la réversibilité et le plafond de responsabilité {outlook-juridique-acme}.'),
  ]),
  thread('budget-plafond', [
    user('2026-10-20 18:02', 'Combien a-t-on dépensé en outils ce trimestre, et où en est le plafond ?'),
    leon('2026-10-20 18:03', 'En octobre, les dépenses outils atteignent 3 420 €, sous le plafond de 4 000 € par mois {claap-budget}. Ce plafond vaut pour toute l’équipe ; au-delà, David valide, et les abonnements annuels passent par le budget du trimestre {notion-plafond}. Il a été confirmé jusqu’à fin 2026 au comité de septembre {granola-codir}.'),
    user('2026-10-20 18:06', 'Et le salon Produit, il rentre dedans ?'),
    leon('2026-10-20 18:07', 'Pas tel quel : le stand coûte environ 2 500 € {outlook-salon}. Julie a proposé de le prévoir au budget de novembre, et David a accepté à condition de décaler l’abonnement Gong au trimestre prochain {claap-budget}.'),
  ]),
  thread('sauvegardes', [
    user('2026-10-19 11:20', 'Les sauvegardes de la base de production sont-elles en place ?'),
    leon('2026-10-19 11:21', TOPICS.find((t) => t.id === 'sauvegardes')!.text.replace(', et le dernier ce matin, pour 4,2 Go {mcp-restore}', '')),
  ]),
  thread('sso-marc', [
    user('2026-10-16 17:40', 'Qu’a dit Marc Lefèvre sur l’export SSO ?'),
    leon('2026-10-16 17:41', 'Marc n’en parle pas directement : c’est Julie qui annonce, pendant le call du 14 octobre, que l’export SSO sera prêt avant la signature {fathom-call-acme}. Le ticket LIN-42 précise que c’est bloquant pour le contrat {linear-lin-42}.'),
  ]),
  thread('retro-42', [
    user('2026-10-16 18:30', 'Résume la rétro du sprint 42.'),
    leon('2026-10-16 18:30', 'Ce qui a marché : la file d’indexation tient la charge et l’export SSO avance. À améliorer : les tests instables en CI coûtent une heure par jour. Actions : Alice prend les tests instables, Thomas finit LIN-42 avant jeudi {granola-retro-42}. Le test en cause est suivi dans le ticket #127 {github-127}.'),
  ]),
  thread('recrutement', [
    user('2026-10-10 10:05', 'Où en est le recrutement du développeur backend ?'),
    leon('2026-10-10 10:06', 'Le poste est ouvert depuis septembre, avec trois candidats en cours et une décision attendue fin octobre {notion-recrutement}. La rémunération prévue va de 55 à 65 k€ selon l’expérience.'),
  ]),
  thread('lenteurs-export', [
    user('2026-10-02 09:15', 'Quels clients se sont plaints des lenteurs à l’export ?'),
    { id: `m${++seq}`, role: 'assistant', at: paris('2026-10-02 09:16'), text: FIXED_TEXTS.empty, sources: [], fixed: true },
  ]),
];

export const getDiscussion = (id: string): Discussion | undefined => DISCUSSIONS.find((d) => d.id === id);

export type GeneratedAnswer = {
  text: string;
  sources: CitedSource[];
  /** Étapes d'activité à afficher avant le premier mot (libellés de ACTIVITY_LABELS). */
  steps: string[];
};

/** Une réponse plausible à une nouvelle question : un sujet connu, sinon les meilleurs passages, sinon « Je ne sais pas ». */
export function generateAnswer(question: string): GeneratedAnswer {
  const res = search(question);
  const steps = [ACTIVITY_LABELS.thinking, ACTIVITY_LABELS.searching, ACTIVITY_LABELS.reading];
  if (res.total === 0) return { text: FIXED_TEXTS.empty, sources: [], steps: steps.slice(0, 2) };
  const topic = TOPICS.find((t) => t.when(fold(question)));
  if (topic) return { ...cite(topic.text), steps };
  const top = res.results.slice(0, 3).map((r) => `« ${r.title ?? 'Sans titre'} » (${r.kindLabel}, ${r.natureLabel.toLowerCase()}) {${r.id}}`);
  const count = top.length === 1 ? 'une source en parle' : `${top.length === 2 ? 'deux' : 'trois'} sources en parlent`;
  const text = `Je n’ai pas de réponse directe, mais ${count} : ${top.join(', ')}. Ouvrez-${top.length > 1 ? 'les' : 'la'} pour vérifier le contexte.`;
  return { ...cite(text), steps: [...steps, ACTIVITY_LABELS.working] };
}

// La liste vit en mémoire : createDiscussion() prévient les abonnés (compteur de la barre latérale, palette, liste).
let snapshot: readonly Discussion[] = [...DISCUSSIONS];
const listeners = new Set<() => void>();
export const subscribeDiscussions = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

/** La liste à jour (nouvelle référence après chaque création) : const discussions = useDiscussions(). */
export const useDiscussions = (): readonly Discussion[] => useSyncExternalStore(subscribeDiscussions, () => snapshot, () => snapshot);

/** Nouvelle discussion (en mémoire) : renvoie la discussion à ouvrir ; la réponse démarre seule. */
export function createDiscussion(question: string): Discussion {
  const d = thread(`d${Date.now().toString(36)}`, [user(NOW, question)]);
  DISCUSSIONS.unshift(d);
  snapshot = [...DISCUSSIONS];
  listeners.forEach((l) => l());
  return d;
}
