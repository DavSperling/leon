// La sortie du crochet de démarrage, par outil (C5 du plan mémoire des sessions). Le serveur assemble le bloc,
// déjà balisé et échappé, en 8 000 octets au plus ; la CLI ne fait que l'envelopper au format de l'outil.
// - Claude Code ajoute la sortie standard de SessionStart au contexte de la session : le texte tel quel.
import type { CODE_SESSION_KINDS } from '../capture/turn';

type CodeSessionKind = (typeof CODE_SESSION_KINDS)[number];

const ENVELOPES: Record<CodeSessionKind, (text: string) => string> = {
  claude_code: (text) => text,
};

export function startOutput(kind: CodeSessionKind, text: string): string {
  return ENVELOPES[kind](text);
}
