// Le panneau des brouillons de réponse, sur l'Accueil (reply-drafts.tsx), pose les questions de Leon une par une : où
// elle en est, et ce qu'elle a retenu pour chacune. Module pur, que le navigateur lit : l'écran ne fait qu'afficher cet
// état.

// « Autre » : le choix que l'écran ajoute, qui ouvre un texte libre.
export const OTHER = 'autre';

// Ce qu'elle a retenu pour une question : le rang d'un choix proposé, « Autre », ou rien. `text` : son texte libre,
// gardé même quand elle revient à un choix proposé.
export type Picked = { choice: number | typeof OTHER | null; text: string };
// `step` : le rang de la question montrée ; le nombre de questions vaut pour le récapitulatif, après la dernière.
export type Flow = { step: number; picks: Picked[] };
export type FlowAction =
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'goto'; step: number }
  | { type: 'pick'; choice: number | typeof OTHER }
  | { type: 'write'; text: string };

// `choix` : les choix de chaque question, dans l'ordre. Une question sans choix (une demande posée avant eux) n'a que
// son texte libre.
export const startFlow = (choix: string[][]): Flow => ({
  step: 0,
  picks: choix.map((choices) => ({ choice: choices.length === 0 ? OTHER : null, text: '' })),
});

// Aller à la question suivante (au récapitulatif après la dernière), revenir, rouvrir une question depuis le
// récapitulatif, retenir un choix ou « Autre », écrire son texte libre. On passe une question sans y répondre. Une
// étape qui n'existe pas, ou un geste sur le récapitulatif, ne change rien.
export function flowReducer(flow: Flow, action: FlowAction): Flow {
  const recap = flow.picks.length;
  const step = (to: number) => (to < 0 || to > recap ? flow : { ...flow, step: to });
  const keep = (change: Partial<Picked>) => ({
    ...flow,
    picks: flow.picks.map((pick, index) => (index === flow.step ? { ...pick, ...change } : pick)),
  });
  switch (action.type) {
    case 'next':
      return step(flow.step + 1);
    case 'previous':
      return step(flow.step - 1);
    case 'goto':
      return step(action.step);
    case 'pick':
      return keep({ choice: action.choice });
    case 'write':
      return keep({ text: action.text });
  }
}

// Ses réponses à envoyer, une par question, dans l'ordre : le texte du choix retenu, son texte libre sous « Autre », ou
// vide pour une question passée.
export const answersOf = (choix: string[][], picks: Picked[]): string[] =>
  picks.map((pick, index) => {
    if (pick.choice === OTHER) return pick.text.trim();
    return pick.choice === null ? '' : (choix[index]?.[pick.choice] ?? '');
  });
