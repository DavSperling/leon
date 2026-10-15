// Ce que la sélection multiple retient : les tâches cochées, et la dernière touchée, d'où part une plage.
export type Selection = { ids: ReadonlySet<string>; anchor: string | null };

export const EMPTY_SELECTION: Selection = { ids: new Set(), anchor: null };

// Coche ou décoche `id`. Avec `range`, tout ce qui sépare la dernière tâche touchée de `id`, dans
// l'ordre d'affichage `order`, est coché ; sans point de départ affiché, `range` coche `id` seul.
export function selectRow(
  selection: Selection,
  order: readonly string[],
  id: string,
  range: boolean,
): Selection {
  const from = selection.anchor === null ? -1 : order.indexOf(selection.anchor);
  const to = order.indexOf(id);
  const ids = new Set(selection.ids);
  if (range && from !== -1 && to !== -1) {
    for (const between of order.slice(Math.min(from, to), Math.max(from, to) + 1)) {
      ids.add(between);
    }
  } else if (!ids.delete(id)) {
    ids.add(id);
  }
  return { ids, anchor: id };
}

// Les seules tâches cochées que la liste montre encore : une tâche supprimée ou écartée par un
// filtre sort de la sélection.
export function visibleSelection(
  selection: Selection,
  order: readonly string[],
): ReadonlySet<string> {
  const shown = new Set(order);
  return new Set([...selection.ids].filter((id) => shown.has(id)));
}

// La valeur que toutes les tâches partagent, sinon `undefined` : le sélecteur n'en coche aucune.
export function commonValue<T, V>(items: readonly T[], read: (item: T) => V): V | undefined {
  const [first, ...others] = items;
  if (first === undefined) return undefined;
  const value = read(first);
  return others.every((item) => read(item) === value) ? value : undefined;
}
