import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import fr from '../../../../messages/fr.json';
import Page, { generateMetadata } from './page';

vi.mock('@/server/env', () => ({ env: { BETTER_AUTH_URL: 'https://leon.example' } }));

const render = async (searchParams: Record<string, string | string[] | undefined>) =>
  (await Page({ searchParams: Promise.resolve(searchParams) })) as ReactElement<{
    view: string;
    markdown: string;
    command: string | null;
  }>;

describe('la page Documentation', () => {
  // ?vue=agent ouvre le mode « Pour un agent » : le lien se partage. Tout le reste ouvre la page pour vous.
  it('ouvre le mode agent avec ?vue=agent, la page pour vous sinon', async () => {
    const agent = await render({ vue: 'agent' });

    expect(agent.props.view).toBe('agent');
    expect(agent.props.markdown).toContain(`# ${fr.site.documentation.heroTitle}\n`);
    expect(agent.props.markdown).toContain('curl -fsSL https://leon.example/install | sh');
    for (const searchParams of [{}, { vue: 'humain' }, { vue: ['agent', 'agent'] }, { vue: '' }]) {
      expect((await render(searchParams)).props.view, JSON.stringify(searchParams)).toBe('human');
    }
  });

  it('ne bâtit le Markdown que pour le mode agent', async () => {
    expect((await render({})).props.markdown).toBe('');
  });

  // Un agent qui lit la page trouve le Markdown : <link rel="alternate" type="text/markdown" href="/documentation.md">.
  it('annonce /documentation.md dans ses métadonnées', async () => {
    const metadata = await generateMetadata();

    expect(metadata.alternates?.types).toEqual({ 'text/markdown': '/documentation.md' });
    expect(metadata.title).toBe(fr.site.meta.documentationTitle);
  });
});
