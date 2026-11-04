import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import fr from '../../../messages/fr.json';
import { GET } from './route';

const env = vi.hoisted(() => ({ BETTER_AUTH_URL: 'https://leon.example' }));
vi.mock('@/server/env', () => ({ env }));

const get = (query = '', cookie?: string) =>
  GET(
    new NextRequest(`https://leon.example/documentation.md${query}`, {
      headers: cookie ? { cookie } : {},
    }),
  );
const EN_TITLE = `# ${en.site.documentation.heroTitle}\n`;
const FR_TITLE = `# ${fr.site.documentation.heroTitle}\n`;

beforeEach(() => {
  env.BETTER_AUTH_URL = 'https://leon.example';
});

// GET /documentation.md : la page Documentation en Markdown pur, pour un agent. Publique, sans session.
describe('GET /documentation.md', () => {
  it.each([
    ['?lang=en', EN_TITLE],
    ['?lang=fr', FR_TITLE],
  ])('répond en Markdown dans la langue demandée (%s)', async (query, title) => {
    const response = await get(query);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(body.startsWith(title)).toBe(true);
    expect(body).toContain('```sh\ncurl -fsSL https://leon.example/install | sh\n```');
    expect(body).toContain('~/.leon/bin/leon login --with-token --url https://leon.example');
  });

  // La règle de langue du site (src/i18n/request.ts) : le cookie leon-locale, l'anglais sans cookie ; ?lang= passe avant.
  it.each([
    ['sans cookie ni ?lang', '', undefined, EN_TITLE],
    ['cookie fr', '', 'leon-locale=fr', FR_TITLE],
    ['cookie en', '', 'leon-locale=en', EN_TITLE],
    ['?lang=en avant le cookie fr', '?lang=en', 'leon-locale=fr', EN_TITLE],
    ['?lang=fr avant le cookie en', '?lang=fr', 'leon-locale=en', FR_TITLE],
    ['?lang inconnu : le cookie', '?lang=de', 'leon-locale=fr', FR_TITLE],
    ['?lang inconnu, sans cookie : l’anglais', '?lang=de', undefined, EN_TITLE],
    ['cookie inconnu : l’anglais', '', 'leon-locale=de', EN_TITLE],
  ])('choisit la langue : %s', async (_name, query, cookie, title) => {
    expect((await (await get(query, cookie)).text()).startsWith(title)).toBe(true);
  });

  it('ne pose aucun cookie et ne se garde pas en cache', async () => {
    const response = await get('?lang=fr', 'leon-locale=fr');

    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  // L'adresse du serveur est refusée (http hors machine seule, par exemple) : la forme générique, rien d'inventé.
  it.each([
    ['en', 'address of your Leon'],
    ['fr', 'adresse de votre Leon'],
  ])('donne la forme générique quand l’adresse est refusée (%s)', async (lang, placeholder) => {
    env.BETTER_AUTH_URL = 'http://leon.example';

    const response = await get(`?lang=${lang}`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain(`curl -fsSL <${placeholder}>/install | sh`);
    expect(body).toContain(`--url <${placeholder}>`);
    expect(body).not.toContain('leon.example');
    expect(body).not.toContain('```text');
  });
});
