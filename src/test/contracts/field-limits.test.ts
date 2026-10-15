import { describe, expect, it } from 'vitest';
import {
  COMMENT_MAX_CHARS,
  DESCRIPTION_MAX_CHARS,
  LABEL_NAME_MAX_CHARS,
  TITLE_MAX_CHARS,
} from '@/lib/tasks/limits';
import { productionSources, readText } from './files';

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

  it('le commentaire', () => {
    expect(sqlBound('task_comments', /char_length\(body_md\) between 1 and (\d+)/)).toBe(
      COMMENT_MAX_CHARS,
    );
  });

  it('le nom d’une étiquette', () => {
    expect(sqlBound('task_labels', /char_length\(name\) between 1 and (\d+)/)).toBe(
      LABEL_NAME_MAX_CHARS,
    );
  });

  it('le commentaire : la page, l’outil MCP et le formulaire importent la même borne', () => {
    const imported = /import \{[^}]*\bCOMMENT_MAX_CHARS\b[^}]*\} from '@\/lib\/tasks\/limits'/;
    for (const path of [
      'src/app/(taches)/taches/[ref]/actions.ts',
      'src/server/mcp/tools/task-comment-tool.ts',
      'src/components/tasks/comment-form.tsx',
    ]) {
      expect(readText(path), path).toMatch(imported);
    }
  });

  it('la description : l’action, l’outil MCP et les deux champs importent la même borne', () => {
    const imported = /import \{[^}]*\bDESCRIPTION_MAX_CHARS\b[^}]*\} from '@\/lib\/tasks\/limits'/;
    for (const path of [
      'src/app/(taches)/taches/actions.ts',
      'src/server/mcp/tools/task-fields.ts',
      'src/components/tasks/description-field.tsx',
      'src/components/tasks/create-task-dialog.tsx',
    ]) {
      expect(readText(path), path).toMatch(imported);
    }
  });

  it('un éditeur modifiable relaie toujours la borne de son champ', () => {
    const editors = productionSources('src/components/**/*.tsx').flatMap(({ path, text }) =>
      [...text.matchAll(/<MarkdownEditor\b[\s\S]*?\/>/g)].map(([element]) => ({ path, element })),
    );
    const editable = editors.filter(({ element }) => !/\breadOnly\b/.test(element));
    expect(editable.length).toBeGreaterThanOrEqual(3);
    for (const { path, element } of editable) {
      expect(element, path).toMatch(/\bmaxLength=\{/);
    }
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
