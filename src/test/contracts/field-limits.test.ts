import { describe, expect, it } from 'vitest';
import { DESCRIPTION_MAX_CHARS, LABEL_NAME_MAX_CHARS, TITLE_MAX_CHARS } from '@/lib/tasks/limits';
import { readText } from './files';

const MIGRATION = readText('src/server/db/migrations/0007-taches.sql');

// La borne que le `create table` de `table` donne à une colonne ; `check` en capture le nombre.
function sqlBound(table: string, check: RegExp): number {
  const body = new RegExp(`create table ${table} \\(([\\s\\S]*?)\\n\\);`).exec(MIGRATION)?.[1];
  const bound = check.exec(body ?? '')?.[1];
  expect(bound, `${table} : borne introuvable`).toBeDefined();
  return Number(bound);
}

describe('bornes des champs des tâches', () => {
  it('le titre', () => {
    expect(sqlBound('tasks', /char_length\(title\) between 1 and (\d+)/)).toBe(TITLE_MAX_CHARS);
  });

  it('la description', () => {
    expect(sqlBound('tasks', /char_length\(description_md\) <= (\d+)/)).toBe(DESCRIPTION_MAX_CHARS);
  });

  it('le nom d’une étiquette', () => {
    expect(sqlBound('task_labels', /char_length\(name\) between 1 and (\d+)/)).toBe(
      LABEL_NAME_MAX_CHARS,
    );
  });

  it('la sélection groupée : la barre et les actions partagent un seul plafond', () => {
    const imported = /import \{[^}]*\bMAX_IDS\b[^}]*\} from '@\/lib\/tasks\/limits'/;
    for (const path of [
      'src/components/tasks/selection-bar.tsx',
      'src/app/(taches)/taches/actions.ts',
    ]) {
      expect(readText(path), path).toMatch(imported);
    }
  });
});
