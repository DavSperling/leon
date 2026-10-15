// Plafond des listes d'identifiants reçues d'un appelant (sélection groupée, étiquettes, noms).
export const MAX_IDS = 200;

type TaskErrorCode = 'not_found' | 'invalid' | 'conflict';

// Le message est fixe et ne cite jamais de texte saisi : les server actions le renvoient tel quel,
// et `guarded` journalise le message des erreurs qui ne viennent pas de Postgres.
export class TaskError extends Error {
  override name = 'TaskError';
  readonly code: TaskErrorCode;

  constructor(code: TaskErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// Doublons retirés ; plus de MAX_IDS éléments distincts est refusé.
export function distinctList(items: readonly string[]): string[] {
  const distinct = [...new Set(items)];
  if (distinct.length > MAX_IDS) {
    throw new TaskError('invalid', `Liste trop longue : ${MAX_IDS} éléments au plus.`);
  }
  return distinct;
}

// Drizzle refuse un UPDATE sans valeur : un patch dont tous les champs sont absents ne fait rien.
export const isEmptyPatch = (patch: object): boolean =>
  Object.values(patch).every((value) => value === undefined);

// Drizzle enveloppe l'erreur pg : le code SQLSTATE est dans `cause`. 23505 = violation d'unicité.
function isUniqueViolation(error: unknown): boolean {
  const cause =
    error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  return cause?.code === '23505';
}

// Exécute `run` et traduit un doublon en conflit lisible ; la course entre deux écritures
// concurrentes est tranchée par la contrainte d'unicité.
export async function orConflict<T>(message: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) throw new TaskError('conflict', message);
    throw error;
  }
}
