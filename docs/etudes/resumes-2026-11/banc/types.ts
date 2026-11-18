// Le contrat des jeux d'essai (jeux/<étape>/*.json) : ce que chaque fichier doit contenir. Les dates sont des
// chaînes ISO 8601 avec fuseau (« 2026-11-17T09:12:00Z »). Les champs reprennent ceux du code de Leon (src/server),
// pour que le banc construise les vrais prompts avec les vraies fonctions.

import type { ItemNature, SourceKind, TurnRole } from '@/capture/turn';

// Ce qu'une bonne sortie doit dire. poids 3 : indispensable (le rater est une faute) ; 2 : important ; 1 : un plus.
// texte : une affirmation qu'un lecteur peut vérifier dans la sortie, seule, sans ambiguïté.
export type Fait = { id: string; texte: string; poids: 1 | 2 | 3 };
// Ce qu'une bonne sortie ne doit PAS dire : du bruit (lettre d'information), une consigne injectée, une information
// périmée, une décision que la personne n'a pas prise, une donnée personnelle d'un tiers, une invention tentante.
export type Interdit = { id: string; texte: string };

export type Attendu = {
  faits: Fait[];
  interdits: Interdit[];
  // Les pièges posés dans le cas, en une phrase chacun : ce qu'ils testent.
  pieges: string[];
};

export type Cas<E, A extends Attendu = Attendu> = {
  id: string; // le nom du fichier, sans .json
  titre: string; // une ligne : ce que le cas met à l'épreuve
  langue: 'fr' | 'en' | 'de' | 'es'; // la langue attendue de la sortie
  entree: E;
  attendu: A;
};

export type Source = {
  id: string; // unique dans le cas
  kind: SourceKind;
  nature: ItemNature;
  titre: string | null;
  url?: string | null;
  date: string; // la date du dernier tour
};
export type Tour = {
  role: TurnRole; // user | assistant | participant | document
  auteur?: string | null;
  date: string;
  texte: string;
};

// --- point : le point du matin (briefing-prompt.ts) ---
export type EntreePoint = {
  maintenant: string;
  projet: string; // « github.com/kestrel-analytics/platform »
  depuis: string; // le début de sa dernière session sur le projet (au plus 14 jours avant)
  apropos?: string | null; // ce qu'il a écrit de lui
  poste?: { department: string | null; job: string | null; seniority: number | null } | null;
  regles?: string[]; // les lignes de ses points précédents qu'il a retirées (réglées)
  sessions: Array<{ source: Source; tours: Tour[] }>; // 3 au plus, ses sessions de code (claude_code, codex, cursor, antigravity)
  changements: Array<{ source: Source; tours: Tour[] }>; // 10 au plus : PR et tickets GitHub du dépôt qui ont bougé
  mentions: Array<{ source: Source; tour: Tour }>; // 10 au plus : passages des outils de l'équipe qui le citent
};
export type AttenduPoint = Attendu & {
  premier: string; // l'id du fait qui doit être la première puce (ce qu'il doit savoir s'il ne lit qu'une ligne)
  rien?: boolean; // true : la seule bonne sortie est « Nothing to report » (ou sa traduction)
};

// --- resume : le résumé d'une session de code (resume-prompt.ts, condense.ts) ---
export type FaitsSession = {
  branche: string | null;
  prs: Array<{ repo: string; numero: number; etat: 'open' | 'merged' | 'closed' | null }>;
  commits: string[]; // sha hexadécimaux de 7 à 40 caractères
  fichiers: string[];
  commandes: Array<{ texte: string; erreur: boolean }>;
  taches: Array<{ texte: string; etat: 'a_faire' | 'en_cours' | 'fait' }>;
  externe?: boolean;
  debut: string | null;
  fin: string | null;
};
export type TourSession = {
  id: string; // unique dans le cas, ex. « t07 »
  role: 'user' | 'assistant';
  // true : un tour `user` que la personne n'a pas tapé (rapport de sous-agent, notification) ; false : tapé par elle ;
  // null : capté avant la marque. Toujours null pour un tour `assistant`.
  injecte: boolean | null;
  date: string;
  texte: string;
};
export type EntreeResume = { faits: FaitsSession; tours: TourSession[] };
export type AttenduResume = Attendu & {
  rien?: boolean; // true : la seule bonne sortie est « rien à retenir »
  // Les décisions que la personne a prises, et les ids qui peuvent les prouver (une PR « repo#n », un commit, un tour
  // `user` avec injecte false). Une [décision] hors de cette liste est une faute.
  decisions: Array<{ texte: string; sources: string[] }>;
};

// --- fil : l'état d'un fil de travail (thread-state.ts) ---
export type SessionFil = {
  id: string;
  kind: 'claude_code' | 'codex' | 'cursor' | 'antigravity';
  date: string;
  faits: FaitsSession;
  resume: string | null; // le résumé de la session déjà écrit par Leon (format « ## Où j'en suis »), ou null
  tours: TourSession[];
};
export type SourceFil = {
  id: string;
  kind: SourceKind; // github, linear, slack, gmail, mcp_remember (une note d'agent)…
  externalId: string; // pour GitHub : « pr:42 » ou « issue:17 »
  nature: ItemNature | null;
  cote: 'equipe' | 'exterieur' | null; // GitHub seulement : PR de l'équipe ou d'un fork/inconnu
  equipe: boolean; // chacun de ses tours vient de l'équipe (pas d'un client ni d'un inconnu)
  outil: string | null; // une note : l'outil qui l'a écrite
  titre: string | null;
  date: string | null;
  texte: string;
};
export type EntreeFil = { sessions: SessionFil[]; sources: SourceFil[] }; // sessions de la plus récente à la plus ancienne
export type AttenduFil = AttenduResume;

// --- agenda : les rendez-vous trouvés dans les mails (agenda-prompt.ts) ---
export type MailAgenda = {
  sourceId: string;
  title: string | null;
  author: string | null;
  at: string; // heure de Paris de l'envoi, « 2026-11-14T09:12 »
  text: string;
};
export type EntreeAgenda = { periode: { first: string; last: string }; mails: MailAgenda[] }; // first/last : « 2026-11-16 »
export type AttenduAgenda = Attendu & {
  // Les rendez-vous de la période, une fois chacun. n : le numéro du mail (1 = le premier de la liste) où il se lit le
  // mieux ; autresN : d'autres mails qui en parlent aussi (acceptés). debut/fin à l'heure de Paris.
  rdv: Array<{
    n: number;
    autresN?: number[];
    debut: string; // « 2026-11-18T14:00 », ou « 2026-11-18 » si l'heure n'est pas dite
    fin?: string;
    titre: string;
    avec?: string;
  }>;
};

// --- reponse : la réponse en tête de la recherche (answer-prompt.ts) ---
export type ResultatReponse = {
  id: string;
  kind: SourceKind;
  nature: ItemNature;
  titre: string | null;
  url?: string | null;
  date: string;
  passages: Array<{
    id: string;
    texte: string;
    date: string;
    auteur?: string | null;
    role?: TurnRole | null; // « raisonnement », « sous_agent », « appel_outil » : une coulisse d'agent
  }>;
};
export type EntreeReponse = { recherche: string; resultats: ResultatReponse[] }; // dans l'ordre affiché (n = rang + 1)
export type AttenduReponse = Attendu & {
  pasAssez?: boolean; // true : la seule bonne sortie est « Les résultats ne suffisent pas pour répondre. »
  contradiction?: boolean; // true : la sortie doit signaler que deux résultats se contredisent
  // Les numéros de résultats (n) qui prouvent la réponse : une bonne sortie les cite.
  cites: number[];
};

// --- discussion : l'agent de discussion avec ses outils (discussion-prompt.ts) ---
export type SourceCorpus = {
  id: string;
  kind: SourceKind;
  nature: ItemNature;
  titre: string | null;
  url?: string | null;
  auteurs: string[]; // les personnes qui y écrivent
  tours: Array<{ id: string; role: TurnRole; auteur: string | null; date: string; texte: string }>;
};
// jeux/discussion/corpus-<entreprise>.json : la mémoire d'une entreprise.
export type Corpus = { entreprise: string; utilisateur: string; maintenant: string; sources: SourceCorpus[] };
export type EntreeDiscussion = {
  corpus: string; // le nom du fichier du corpus, sans .json
  historique?: Array<{ role: 'user' | 'assistant'; content: string }>; // les échanges d'avant, s'il y en a
  question: string;
};
export type AttenduDiscussion = Attendu & {
  sources: string[]; // les ids des sources du corpus qui prouvent la réponse
  jeNeSaisPas?: boolean; // true : le corpus ne permet pas de répondre ; la bonne sortie le dit
};

export type CasPoint = Cas<EntreePoint, AttenduPoint>;
export type CasResume = Cas<EntreeResume, AttenduResume>;
export type CasFil = Cas<EntreeFil, AttenduFil>;
export type CasAgenda = Cas<EntreeAgenda, AttenduAgenda>;
export type CasReponse = Cas<EntreeReponse, AttenduReponse>;
export type CasDiscussion = Cas<EntreeDiscussion, AttenduDiscussion>;
