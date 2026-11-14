// Les points d'accroche du mouvement de l'accueil. Les composants gardent leur état (la question, la source, la
// personne) et le changent par `commit` ; quand le mouvement est chargé (motion/start.ts remplit ces champs), il joue
// autour de ce changement, sinon le changement est immédiat. Aucun import de bibliothèque ici : ce fichier est minuscule.

export type Commit = () => void;
/** « calm » : la réponse s'écrit de nouveau, plus posément ; « end » : déjà écrite. */
export type Pace = 'calm' | 'end';

export const motionHooks: {
  /** Une autre question (HeroTabs). */
  scenario?: (commit: (pace: Pace) => void, same: boolean) => void;
  /** Une autre source sur le dessus de la pile (la scène du haut seulement). */
  select?: (n: number, commit: Commit) => void;
  /** Julie ou Sophie (règle 3). */
  view?: (i: number, commit: Commit) => void;
  /** Posés par RightsSwitch : le défilement change la personne comme un clic. */
  showView?: (i: number) => void;
  viewIndex?: () => number;
} = {};
