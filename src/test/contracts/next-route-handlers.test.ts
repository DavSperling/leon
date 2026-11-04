import { describe, expect, it } from 'vitest';
import { listFiles, readText } from './files';

// Les route handlers de Next (route.ts) ne passent par aucune garde de l'API : les routes de l'API sont toutes derrière
// Hono (route-guards.db.test.ts les vérifie une à une), mais un route.ts ajouté ailleurs serait public sans que rien
// ne le dise. La liste est donc fermée : en ajouter un se décide ici, avec sa raison.
//
// - src/app/api/[[...route]]/route.ts : l'API, gardée route par route (requireApiToken, requireSession).
// - src/app/documentation.md/route.ts : GET /documentation.md, la page Documentation en Markdown pour un agent. Publique
//   comme la page : elle ne porte que l'adresse du serveur (BETTER_AUTH_URL), ni session, ni base, ni cookie posé.
// - src/app/install/route.ts : GET /install, le script que lance `curl -fsSL <leon>/install | sh`. Public par nature
//   (l'ordinateur n'a encore ni jeton ni session), il ne porte que l'adresse du serveur et des empreintes.
describe('route handlers de Next', () => {
  it('ne sont que ceux de l’API, de la documentation en Markdown et du script d’installation', () => {
    expect(listFiles('src/app/**/route.ts')).toEqual([
      'src/app/api/[[...route]]/route.ts',
      'src/app/documentation.md/route.ts',
      'src/app/install/route.ts',
    ]);
  });

  it('GET /documentation.md, public, ne touche ni la base, ni la session, ni les cookies', () => {
    const source = readText('src/app/documentation.md/route.ts');
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

    expect(imports.toSorted()).toEqual([
      '@/components/site/pages/documentation-markdown',
      '@/i18n/request',
      '@/server/cli/install-command',
      'next-intl',
      'next/server',
    ]);
    // les cookies de la requête se lisent (la langue), la réponse n'en pose aucun
    expect(source).not.toMatch(/set-cookie|cookies\(\)|\.cookies\.set/i);
  });

  it('GET /install, public, ne touche ni la base, ni la session, ni les cookies', () => {
    const imports = [...readText('src/app/install/route.ts').matchAll(/from\s+'([^']+)'/g)].map(
      (match) => match[1],
    );

    expect(imports.toSorted()).toEqual([
      '@/server/cli/installer-script',
      '@/server/env',
      '@/server/log',
      'node:fs/promises',
      'node:path',
    ]);
  });
});
