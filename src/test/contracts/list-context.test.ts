import { describe, expect, it } from 'vitest';
import { readText } from './files';

describe('contexte de la liste', () => {
  it('la page charge les statuts de tous les projets', () => {
    // La création rapide change de projet : elle a besoin des statuts de chacun. Seuls les groupes
    // se limitent au projet filtré (groupStatuses).
    const page = readText('src/app/(taches)/taches/page.tsx');
    expect(page).toMatch(/listStatuses\(ctx\)/);
    expect(page).not.toMatch(/listStatuses\(ctx,/);
  });
});
