import type { SessionFacts } from '@/capture/session-facts';
import type { TurnRole } from '@/capture/turn';
import { dataAttributes, escapeData } from '@/server/llm/prompt-guard';
import { oneLine } from '@/server/memory/labels';

// Le condensé d'une session, que lit le modèle du résumé (T22, D8 du plan mémoire des sessions) : les faits, avec
// l'état GitHub des PR liées, puis les tours, sans les résumés de Leon (`leon:resume:*`), en 40 000 caractères au
// plus, la fin gardée. Chaque tour, PR et commit porte son id : une `[décision]` du résumé doit en citer un, que le
// serveur vérifie (D23 et D25 du plan de la mémoire à disposition). `preuves` sont ces ids, ceux qui sont restés
// dans le condensé : un message de l'utilisateur, une PR ou un commit, jamais un tour de l'agent ni un tour `user`
// injecté (D36). Chaque champ capté est mis sur une ligne et échappé (prompt-guard.ts), ici et non dans le prompt :
// la borne compte ce que lit le modèle. Module pur : ni base, ni réseau.
// shortcut: la capture ne pose pas encore `injecte` (colonne `turns.injecte`, partie capture de T43) ; un tour injecté
// non marqué compte comme message de l'utilisateur. En attendant, le worker du résumé n'accepte aucun tour comme
// preuve (resume-worker.ts), et le prompt dit qu'un tour de="utilisateur" n'est pas toujours écrit par la personne.

export const CONDENSE_MAX_CHARS = 40_000;
// Les faits ne prennent pas plus de la moitié : la fin de la session est ce qui se résume.
const FACTS_MAX_CHARS = CONDENSE_MAX_CHARS / 2;
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
  // Un tour `user` que l'utilisateur n'a pas écrit : rapport de sous-agent, notification de tâche, message d'un agent.
  injecte?: boolean;
};
export type Condense = { texte: string; preuves: Set<string> };

// Une coupe ne laisse jamais un demi-emoji : l'API du modèle refuse un corps qui en porte. toWellFormed garde la
// longueur, donc la borne.
const field = (text: string) => escapeData(oneLine(text)).slice(0, FIELD_MAX_CHARS).toWellFormed();

export function condenseSession(input: { faits: CondenseFacts; turns: CondenseTurn[] }): Condense {
  const { faits } = input;
  const preuves = new Set<string>();
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
    if (used + line.length + 1 > FACTS_MAX_CHARS) continue;
    facts.push(line);
    used += line.length + 1;
    if (id) preuves.add(id);
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
    const user = turn.role === 'user' && !turn.injecte;
    const tag = `<tour${dataAttributes([
      ['id', turn.id],
      ['de', user ? 'utilisateur' : 'agent'],
      ['date', turn.ts.toISOString()],
    ])}>`;
    const body = escapeData(turn.text);
    const room = CONDENSE_MAX_CHARS - used - tag.length - TURN_CLOSE.length - 1;
    if (room <= 0) break;
    kept.unshift(`${tag}${body.slice(-room).toWellFormed()}${TURN_CLOSE}`);
    used += tag.length + Math.min(body.length, room) + TURN_CLOSE.length + 1;
    if (user) preuves.add(turn.id);
    if (body.length > room) break;
  }

  return { texte: [...facts, ...kept].join('\n'), preuves };
}
