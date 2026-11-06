// Les adaptateurs des outils hors Claude Code (T16 du plan mémoire des sessions) : ce que chaque outil attend de nos
// crochets. Au lot 4, Codex au démarrage ; la lecture de sa session, ses faits et le rattrapage arrivent au lot 5.
//
// Codex (essai réel du 06/11, docs/etudes/memoire-sessions-2026-11/annexes/03-essai-codex.md) : la sortie JSON de C5
// arrive au modèle au premier message, rôle developer, sans autre champ (Codex refuse un champ inconnu). Jamais
// `continue: false`, qui arrêterait la session.
import type { Outil } from './hook-commands';

export type Adaptateur = {
  label: string;
  // La sortie du crochet de démarrage, autour du bloc (C5).
  demarrage: (texte: string) => string;
};

export const ADAPTATEURS: Record<Outil, Adaptateur> = {
  codex: {
    label: 'Codex',
    demarrage: (texte) =>
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: texte },
      }),
  },
};
