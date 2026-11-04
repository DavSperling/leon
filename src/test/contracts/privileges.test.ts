import { describe, expect, it } from 'vitest';
import { listFiles, readText } from './files';

const FILES = [
  ...listFiles('src/**/*.{ts,tsx}'),
  ...listFiles('extension/**/*.{ts,tsx}'),
  ...listFiles('.env.example'),
];

const isTestSupport = (path: string) =>
  path.startsWith('src/test/') || path.endsWith('.db.test.ts');

// Les fichiers qui contiennent le motif, hors fichiers autorisés.
function offenders(pattern: RegExp, isAllowed: (path: string) => boolean): string[] {
  return FILES.filter((path) => !isAllowed(path) && pattern.test(readText(path)));
}

describe('privilèges', () => {
  it('trouve le motif là où il est autorisé', () => {
    expect(FILES.filter((path) => /set_config\(/.test(readText(path)))).toContain(
      'src/server/db/with-tenant.ts',
    );
  });

  // Les tests db peuvent changer d'organisation dans une transaction, comme la boucle du déploiement de 0048.
  it('pose le contexte de tenant à un seul endroit : withTenant', () => {
    const allowed = (path: string) =>
      isTestSupport(path) || path === 'src/server/db/with-tenant.ts';
    expect(offenders(/set_config\(/, allowed)).toEqual([]);
  });

  it('réserve le rôle propriétaire (adminDb, adminPool) aux tests', () => {
    expect(offenders(/\badmin(?:Db|Pool)\b/, isTestSupport)).toEqual([]);
  });

  it('limite DATABASE_URL_ADMIN aux migrations, aux tests et à .env.example', () => {
    const allowed = (path: string) =>
      isTestSupport(path) || path === 'src/server/db/migrate-cli.ts' || path === '.env.example';
    expect(offenders(/DATABASE_URL_ADMIN/, allowed)).toEqual([]);
  });
});
