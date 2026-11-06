// La sortie du crochet de démarrage, par outil (C5 du plan mémoire des sessions). Le serveur assemble le bloc,
// déjà balisé et échappé, en 8 000 octets au plus ; la CLI ne fait que l'envelopper au format de l'outil.
// - Claude Code ajoute la sortie standard de SessionStart au contexte de la session : le texte tel quel.
// - Codex, et les outils hors Claude Code : l'enveloppe de son adaptateur (outils.ts).
import type { CodeSessionKind } from '../capture/turn';
import { ADAPTATEURS } from './outils';

const ENVELOPES: Record<CodeSessionKind, (text: string) => string> = {
  claude_code: (text) => text,
  codex: (text) => ADAPTATEURS.codex.injection(text, 'demarrage'),
  cursor: (text) => ADAPTATEURS.cursor.injection(text, 'demarrage'),
};

export function startOutput(kind: CodeSessionKind, text: string): string {
  return ENVELOPES[kind](text);
}
