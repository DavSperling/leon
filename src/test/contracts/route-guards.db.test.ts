import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { app } from '@/server/api/app';

// Toute route de l'API demande une identité : un jeton (CLI, extension, MCP) ou une session de l'interface. Appelée
// sans rien, elle répond 401 ou 403, jamais 200, 404 ou 500. Une route ajoutée sans `requireApiToken` ni
// `requireSession` fait échouer ce test (le contrat des routes à jeton, api-contract.db.test.ts, ne couvre que la
// liste API_PATHS ; chaque route de session est aussi vérifiée par session-routes.db.test.ts).
//
// Seules exceptions, publiques par nature : la santé du serveur ; Better Auth (inscription, connexion) ; le
// déroulé OAuth des connecteurs, qui garde ses propres contrôles (formulaire posté de la même origine, puis la
// session, sinon renvoi vers /connexion ; retour lié à un cookie signé et à la même session), vérifiés par
// oauth-routes.db.test.ts.
//
// Une exception à la règle « requireApiToken ou requireSession », qui reste pourtant sous ce test : POST /api/v1/ordinateurs
// (`leon login`) n'a ni l'un ni l'autre, le jeton de la CLI n'étant pas encore en base. Elle est gardée par le code signé
// (K4) et par la forme du jeton, et répond 401 sans l'un ni l'autre ; ses cas sont dans computer-routes.db.test.ts.
//
// Le serveur d'autorisation OAuth du MCP distant (/api/oauth/…) est public lui aussi : l'inscription d'un assistant
// (claude.ai, ChatGPT…) et l'échange de son code contre des jetons se font sans jeton ni session, par nature, puisqu'il
// n'a encore rien. Ses routes ont leurs propres contrôles (adresses de retour de la liste fermée L11, code signé à usage
// unique et PKCE, 4 puis 8 Ko d'entrée) ; leurs cas sont dans oauth-routes.db.test.ts, et api-contract.db.test.ts garde
// les deux routes (400 à un POST sans corps valide, ni 401 ni 404).
const PUBLIC = [
  /^\/api\/health$/,
  /^\/api\/auth\//,
  /^\/api\/v1\/connexions\/oauth\//,
  /^\/api\/oauth\//,
];

const guarded = [...new Set(app.routes.map((route) => `${route.method} ${route.path}`))].filter(
  (route) => !PUBLIC.some((pattern) => pattern.test(route.split(' ')[1] ?? '')),
);

describe('gardes des routes de l’API', () => {
  it('trouve les routes à garder : la lecture des routes de l’application fonctionne', () => {
    expect(guarded).toEqual(
      expect.arrayContaining([
        'POST /api/v1/ingest',
        'GET /api/v1/me',
        'ALL /api/mcp',
        'GET /api/v1/recherche/reponse',
        'POST /api/v1/ordinateurs',
      ]),
    );
  });

  it.each(guarded)('%s répond 401 ou 403 sans identité', async (route) => {
    const [declared = 'GET', path = ''] = route.split(' ');
    const method = declared === 'ALL' ? 'POST' : declared;
    const withBody = method !== 'GET' && method !== 'HEAD';
    const response = await app.request(
      path.replace(/:[^/]+/g, () => randomUUID()).replace(/\*/g, 'x'),
      {
        method,
        headers: withBody ? { 'content-type': 'application/json' } : {},
        body: withBody ? '{}' : undefined,
      },
    );

    expect([401, 403]).toContain(response.status);
  });
});
