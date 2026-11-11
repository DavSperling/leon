import { describe, expect, it } from 'vitest';
import { auth } from '@/server/auth/auth';
import { listFiles, readText } from './files';

// T55 (C12, C13, D37) : les actions du site (écrire une leçon, remettre une version) n'acceptent qu'une session du
// navigateur. Ça tient parce que Better Auth n'a pas le plugin bearer : getSession() ne lit que le cookie, et un jeton
// (`Authorization: Bearer …`) ne peut pas appeler une action serveur.
describe('une session du site seulement', () => {
  const ids = (auth.options.plugins ?? []).map((plugin) => plugin.id);

  it('la configuration de Better Auth a ses plugins, sans bearer', () => {
    expect(ids).toContain('two-factor');
    expect(ids).not.toContain('bearer');
  });

  it('aucun fichier n’importe le plugin bearer', () => {
    const offenders = listFiles('src/**/*.{ts,tsx}').filter(
      (path) =>
        path !== 'src/test/contracts/session-only.test.ts' &&
        /better-auth\/plugins\/bearer|\{[^}]*\bbearer\b[^}]*\}\s*from\s*'better-auth\/plugins'/.test(
          readText(path),
        ),
    );
    expect(offenders).toEqual([]);
  });
});
