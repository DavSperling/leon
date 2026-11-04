import { describe, expect, it } from 'vitest';
import { listFiles, readText } from './files';

// Les route handlers de Next (route.ts) ne passent par aucune garde de l'API : les routes de l'API sont toutes derrière
// Hono (route-guards.db.test.ts les vérifie une à une), mais un route.ts ajouté ailleurs serait public sans que rien
// ne le dise. La liste est donc fermée : en ajouter un se décide ici, avec sa raison.
//
// - src/app/api/[[...route]]/route.ts : l'API, gardée route par route (requireApiToken, requireSession).
// - src/app/install/route.ts : GET /install, le script que lance `curl -fsSL <leon>/install | sh`. Public par nature
//   (l'ordinateur n'a encore ni jeton ni session), il ne porte que l'adresse du serveur et des empreintes.
describe('route handlers de Next', () => {
  it('ne sont que ceux de l’API et du script d’installation', () => {
    expect(listFiles('src/app/**/route.ts')).toEqual([
      'src/app/api/[[...route]]/route.ts',
      'src/app/install/route.ts',
    ]);
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
