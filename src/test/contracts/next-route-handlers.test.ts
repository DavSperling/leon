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
// - src/app/.well-known/** : la découverte OAuth du MCP distant (RFC 9728 pour la ressource, RFC 8414 pour le serveur
//   d'autorisation). Publics par nature : un client qui n'a encore ni compte ni jeton les lit pour savoir où s'autoriser.
//   Ils ne portent que des adresses tirées de BETTER_AUTH_URL.
const importsOf = (path: string) =>
  [...readText(path).matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]).toSorted();

describe('route handlers de Next', () => {
  it('ne sont que ceux de l’API, de la documentation en Markdown, du script d’installation et de la découverte OAuth', () => {
    // `**` ne descend pas dans les dossiers qui commencent par un point (.well-known) : le second motif les cherche.
    expect(
      [...listFiles('src/app/**/route.ts'), ...listFiles('src/app/**/.*/**/route.ts')].sort(),
    ).toEqual([
      'src/app/.well-known/oauth-authorization-server/route.ts',
      'src/app/.well-known/oauth-protected-resource/api/mcp/route.ts',
      'src/app/.well-known/oauth-protected-resource/route.ts',
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
    expect(importsOf('src/app/install/route.ts')).toEqual([
      '@/server/cli/installer-script',
      '@/server/env',
      '@/server/log',
      'node:fs/promises',
      'node:path',
    ]);
  });

  it.each(listFiles('src/app/**/.*/**/route.ts'))(
    'GET %s, public, ne touche ni la base, ni la session, ni les cookies',
    (path) => {
      expect(importsOf(path)).toEqual(['@/server/oauth/metadata']);
    },
  );

  it('les métadonnées OAuth ne tirent que BETTER_AUTH_URL et les chemins du contrat', () => {
    expect(importsOf('src/server/oauth/metadata.ts')).toEqual([
      '@/capture/api-contract',
      '@/server/env',
    ]);
  });
});
