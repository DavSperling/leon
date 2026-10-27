// Le diff ligne à ligne que montre l'aperçu d'une écriture de fichier : ce que l'utilisateur confirme est exactement
// ce qui sera commité. Plus longue sous-suite commune, trois lignes de contexte, « … » pour ce qui est sauté ; chaque
// ligne commence par « + », « - » ou deux espaces. Module pur.

export const DIFF_MAX_LINES = 3000; // de chaque côté : au-delà, pas d'aperçu exact (table de (n+1)×(m+1) cases)
const CONTEXT = 3;

// Les lignes d'un texte ; un saut de ligne final ne fait pas une ligne de plus.
export function linesOf(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

// null quand un des deux textes dépasse DIFF_MAX_LINES lignes. shortcut: un saut de ligne final ajouté ou retiré
// n'apparaît pas, à reprendre si un fichier doit les distinguer.
export function lineDiff(before: string, after: string): string | null {
  const a = linesOf(before);
  const b = linesOf(after);
  if (a.length > DIFF_MAX_LINES || b.length > DIFF_MAX_LINES) return null;

  // Le début et la fin communs ne se comparent pas : la table ne couvre que le milieu.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }
  const x = a.slice(head, a.length - tail);
  const y = b.slice(head, b.length - tail);
  const width = y.length + 1;
  const common = new Uint16Array((x.length + 1) * width);
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      common[i * width + j] =
        x[i] === y[j]
          ? (common[(i + 1) * width + j + 1] as number) + 1
          : Math.max(common[(i + 1) * width + j] as number, common[i * width + j + 1] as number);
    }
  }

  const marked: Array<[mark: '+' | '-' | ' ', line: string]> = a
    .slice(0, head)
    .map((l) => [' ', l]);
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      marked.push([' ', x[i++] as string]);
      j++;
    } else if (
      j === y.length ||
      (i < x.length &&
        (common[(i + 1) * width + j] as number) >= (common[i * width + j + 1] as number))
    ) {
      marked.push(['-', x[i++] as string]);
    } else {
      marked.push(['+', y[j++] as string]);
    }
  }
  for (const line of a.slice(a.length - tail)) marked.push([' ', line]);

  // Les lignes changées et leur contexte ; un « … » à la place de chaque trou.
  const near = marked.map(() => false);
  marked.forEach(([mark], index) => {
    if (mark === ' ') return;
    for (let k = index - CONTEXT; k <= index + CONTEXT; k++) if (k in near) near[k] = true;
  });
  if (!marked.some(([mark]) => mark !== ' ')) return '';
  const out: string[] = [];
  marked.forEach(([mark, line], index) => {
    if (near[index]) out.push(`${mark} ${line}`);
    else if (out.at(-1) !== '…') out.push('…');
  });
  return out.join('\n');
}
