import type { SessionFacts } from '@/capture/session-facts';
import type { TurnRole } from '@/capture/turn';
import { dataAttributes, escapeData } from '@/server/llm/prompt-guard';
import { oneLine } from '@/server/memory/labels';

// Le condensé d'une session, que lit le modèle du résumé (T22, D8 du plan mémoire des sessions) : les faits, avec
// l'état GitHub des PR liées, puis les tours, sans les résumés de Leon (`leon:resume:*`), en 40 000 caractères au
// plus, la fin gardée. Chaque tour, PR et commit porte son id : une `[décision]` du résumé doit en citer un, que le
// serveur vérifie (D23 et D25 du plan de la mémoire à disposition). `preuves` sont ces ids, ceux qui sont restés
// dans le condensé : un message de l'utilisateur, une PR ou un commit, jamais un tour de l'agent ni un tour `user`
// injecté (D36). Un message de l'utilisateur est un tour `user` marqué tapé par la personne (`injecte` false, T43),
// rendu avec preuve="oui" ; un tour injecté est rendu comme l'agent ; un tour sans la marque (capté avant elle) reste
// rendu comme l'utilisateur, sans rien prouver. Chaque champ capté est mis sur une ligne et échappé (prompt-guard.ts),
// ici et non dans le prompt : la borne compte ce que lit le modèle. Module pur : ni base, ni réseau.
// L'état d'un fil (thread-state.ts) condense chaque session dans sa part de la borne, et cite ces ids : `ids` donne la
// provenance de chacun (D23, D36), « toi » pour un message de l'utilisateur seulement, jamais un tour sans la marque.

export const CONDENSE_MAX_CHARS = 40_000;
const FIELD_MAX_CHARS = 200;
const RESUME_PREFIX = 'leon:resume:';
const FACTS_CLOSE = '</faits>';
const TURN_CLOSE = '</tour>';

export type CondenseFacts = Omit<SessionFacts, 'prs'> & {
  // Les PR des faits et celle liée par la branche, avec leur état GitHub (start-context.ts) ; nul : pas de source.
  prs: Array<{ repo: string; numero: number; etat: 'open' | 'merged' | 'closed' | null }>;
};
export type CondenseTurn = {
  id: string;
  externalId: string;
  role: TurnRole;
  ts: Date;
  text: string;
  // `turns.injecte` : un tour `user` que l'utilisateur n'a pas écrit (rapport de sous-agent, notification de tâche,
  // message d'un agent) vaut true, un tour tapé par lui false, un tour capté avant la marque null.
  injecte: boolean | null;
};
// D'où vient un élément du condensé (D23) : la personne, l'agent (et tout ce qui n'est pas sûrement elle), l'équipe (une
// PR, un commit), ou un connecteur.
export type Provenance = 'toi' | 'agent' | 'équipe' | 'connecteur';
export type Condense = { texte: string; preuves: Set<string>; ids: Map<string, Provenance> };

// Une coupe ne laisse jamais un demi-emoji : l'API du modèle refuse un corps qui en porte. toWellFormed garde la
// longueur, donc la borne.
const field = (text: string) => escapeData(oneLine(text)).slice(0, FIELD_MAX_CHARS).toWellFormed();

export function condenseSession(
  input: { faits: CondenseFacts; turns: CondenseTurn[] },
  maxChars = CONDENSE_MAX_CHARS,
): Condense {
  const { faits } = input;
  const preuves = new Set<string>();
  const ids = new Map<string, Provenance>();
  const open = `<faits${dataAttributes([
    ['branche', faits.branche?.slice(0, FIELD_MAX_CHARS).toWellFormed()],
    ['debut', faits.debut],
    ['fin', faits.fin],
  ])}>`;
  // Les clés d'abord (PR, commits) : ce sont des preuves, elles passent avant les listes si la place manque.
  const candidates: Array<[line: string, id?: string]> = [
    ...faits.prs.map((pr): [string, string] => {
      const id = `${pr.repo}#${pr.numero}`;
      return [
        `<pr${dataAttributes([
          ['id', id],
          ['etat', pr.etat ?? 'inconnu'],
        ])}/>`,
        id,
      ];
    }),
    ...faits.commits.map((sha): [string, string] => [
      `<commit${dataAttributes([['id', sha]])}/>`,
      sha,
    ]),
    ...faits.taches.map((t): [string] => [
      `<tache${dataAttributes([['etat', t.etat]])}>${field(t.texte)}</tache>`,
    ]),
    ...faits.commandes.map((c): [string] => [
      `<commande erreur="${c.erreur ? 'oui' : 'non'}">${field(c.texte)}</commande>`,
    ]),
    ...faits.fichiers.map((f): [string] => [`<fichier>${field(f)}</fichier>`]),
  ];
  const facts = [open];
  let used = open.length + 1 + FACTS_CLOSE.length + 1;
  for (const [line, id] of candidates) {
    // Les faits ne prennent pas plus de la moitié : la fin de la session est ce qui se résume.
    if (used + line.length + 1 > maxChars / 2) continue;
    facts.push(line);
    used += line.length + 1;
    if (id) {
      preuves.add(id);
      ids.set(id, 'équipe');
    }
  }
  facts.push(FACTS_CLOSE);

  // Du plus récent au plus ancien, tant que la place le permet ; le premier qui ne tient pas garde sa fin.
  const turns = input.turns
    .filter((turn) => !turn.externalId.startsWith(RESUME_PREFIX))
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const kept: string[] = [];
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (!turn) continue;
    const user = turn.role === 'user' && turn.injecte !== true;
    const proof = user && turn.injecte === false;
    const tag = `<tour${dataAttributes([
      ['id', turn.id],
      ['de', user ? 'utilisateur' : 'agent'],
      ['preuve', proof ? 'oui' : undefined],
      ['date', turn.ts.toISOString()],
    ])}>`;
    const body = escapeData(turn.text);
    const room = maxChars - used - tag.length - TURN_CLOSE.length - 1;
    if (room <= 0) break;
    kept.unshift(`${tag}${body.slice(-room).toWellFormed()}${TURN_CLOSE}`);
    used += tag.length + Math.min(body.length, room) + TURN_CLOSE.length + 1;
    ids.set(turn.id, proof ? 'toi' : 'agent');
    if (proof) preuves.add(turn.id);
    if (body.length > room) break;
  }

  return { texte: [...facts, ...kept].join('\n'), preuves, ids };
}
