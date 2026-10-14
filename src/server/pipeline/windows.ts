// Découpe en fenêtres d'au plus maxChars caractères, ordre conservé ; un tour plus long forme sa propre fenêtre.
export function windowTurns<T extends { text: string }>(turns: T[], maxChars: number): T[][] {
  const windows: T[][] = [];
  let size = 0;
  for (const turn of turns) {
    const current = windows.at(-1);
    if (current && size + turn.text.length <= maxChars) {
      current.push(turn);
      size += turn.text.length;
    } else {
      windows.push([turn]);
      size = turn.text.length;
    }
  }
  return windows;
}
