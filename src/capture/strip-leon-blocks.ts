// Un bloc injecté par Leon n'est jamais recapté (T06 du plan mémoire des sessions) : ni le bloc de démarrage
// (`<contexte-leon>`), ni le point du matin qui le suit, ni le rappel du premier prompt (`<rappel-leon>`, T36).
// Recapté, il reviendrait dans le bloc suivant et s'y recopierait de session en session. Le serveur échappe tout ce
// qu'il met dans un bloc : la première balise fermante est donc la vraie fin.
//
// Seulement pour les sessions de code, qui reçoivent ces blocs : appelée par les lecteurs de leurs fichiers et à la
// réception de leurs tours (ingest-turns.ts), jamais dans prepareTurnText, qui sert aussi aux connecteurs (un ticket
// qui cite le bloc garde son texte).
const LEON_BLOCK_TAGS = ['contexte-leon', 'point-du-matin', 'rappel-leon'] as const;

// Retire chaque bloc fermé, en un seul passage ; un bloc sans fermeture reste tel quel (comme les rappels système,
// prepare-turn-text.ts).
function removeBlocks(text: string, tag: string): string {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  let kept = '';
  let position = 0;
  for (;;) {
    const start = text.indexOf(open, position);
    if (start === -1) break;
    const end = text.indexOf(close, start + open.length);
    if (end === -1) break;
    kept += text.slice(position, start);
    position = end + close.length;
  }
  return kept + text.slice(position);
}

export function stripLeonBlocks(text: string): string {
  return LEON_BLOCK_TAGS.reduce(removeBlocks, text);
}
