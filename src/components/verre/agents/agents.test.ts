import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AgentId } from '@/server/portrait/agents';
import type { AgentState } from '@/server/portrait/propositions';
import type { AgentsScreen } from '@/server/portrait/screen';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { Agents } from '.';
import { AgentSheet } from './sheet';

// L'action importe Better Auth : seul le dessin de l'écran se teste ici, pas le panneau (ouvert par un clic).
vi.mock('@/app/(app)/settings/actions', () => ({ answerAgentAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const state = (agent: AgentId, over: Partial<AgentState> = {}): AgentState => ({
  agent,
  oui: null,
  enService: false,
  missing: null,
  ...over,
});

// Un agent dans chaque état : demandé avant sa sortie, actif, à qui il manque Outlook, prêt à activer, sans réponse.
const DATA: AgentsScreen = {
  etat: 'faite',
  agents: [
    state('suite-reunion', { oui: true }),
    state('brouillon-reponse', { enService: true, oui: true }),
    state('brief-rendez-vous', { missing: 'outlook' }),
    state('relance', { enService: true }),
    state('point-du-jour'),
  ],
};

const render = (data: AgentsScreen | null = DATA, locale: 'en' | 'fr' = 'fr') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: createElement(Agents, { data }),
    }),
  );
const card = (html: string, agent: AgentId) =>
  html.match(new RegExp(`<button[^>]*data-agent="${agent}"[\\s\\S]*?</button>`))?.[0] ?? '';
const titles = (html: string) =>
  [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((match) => match[1]);

describe('Agents', () => {
  it('range les agents en service en grand, les autres sous « Bientôt », dans l’ordre du catalogue', () => {
    const html = render();
    const order = [...html.matchAll(/data-agent="([^"]+)"/g)].map((match) => match[1]);

    expect(titles(html)).toEqual(['Prêts à l’emploi', 'Bientôt']);
    expect(titles(render(DATA, 'en'))).toEqual(['Ready to use', 'Coming soon']);
    expect(order).toEqual([
      'brouillon-reponse',
      'relance',
      'suite-reunion',
      'brief-rendez-vous',
      'point-du-jour',
    ]);
    expect(card(html, 'relance')).toContain('agent--wide');
    expect(card(html, 'point-du-jour')).not.toContain('agent--wide');
    expect(html).toContain('Vos propres agents');
  });

  it('dit l’état de chacun sur sa carte : Actif, Activer, Demandé, ou rien', () => {
    const html = render();

    expect(card(html, 'brouillon-reponse')).toContain('Actif');
    expect(card(html, 'relance')).toContain('Activer');
    expect(card(html, 'suite-reunion')).toContain('Demandé');
    for (const agent of ['brief-rendez-vous', 'point-du-jour'] as const) {
      expect(card(html, agent)).not.toMatch(/Actif|Activer|Demandé/);
      expect(card(html, agent)).not.toMatch(/agent__on|tl__pill|agent__asked|tl__chev/);
    }
  });

  it('dit l’état par la pose du personnage : éveillé, endormi, silhouette, silhouette demandée', () => {
    const html = render();
    const classes = (agent: AgentId) => card(html, agent).match(/class="([^"]*)"/)?.[1] ?? '';

    expect(classes('brouillon-reponse')).toContain('is-on');
    expect(classes('relance')).not.toMatch(/is-on|is-soon/);
    expect(classes('suite-reunion')).toContain('is-soon is-wanted');
    expect(classes('point-du-jour')).toMatch(/is-soon$/);
    // Le personnage est un décor : le nom et l'état sont écrits à côté.
    expect(card(html, 'relance')).toMatch(/<svg aria-hidden="true" class="af"/);
  });

  it('montre ce que fait chaque agent par sa feuille : surligneur, heure entière, espaces du français', () => {
    const sheet = (agent: AgentId, large = false) =>
      renderToStaticMarkup(
        createElement(NextIntlClientProvider, {
          locale: 'fr',
          messages: fr,
          // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
          children: createElement(AgentSheet, { agent, large }),
        }),
      );

    expect(sheet('brouillon-reponse')).toContain(
      '<span class="hl">je vous confirme jeudi à 10 h</span>',
    );
    // Sa première ligne (« Réponse à Sophie ») n'est écrite qu'en grand, dans le panneau.
    expect(sheet('brouillon-reponse')).not.toContain('agent-sheet__meta');
    expect(sheet('brouillon-reponse', true)).toContain('agent-sheet__meta');
    expect(sheet('point-du-jour')).toContain('9 h 00');
    expect(sheet('brief-rendez-vous')).toContain('Le dossier : devis');
  });

  it('sans boîte mail, mène à Connexions ; sans lecture, le dit', () => {
    const html = render({ ...DATA, etat: 'sans-boite' });

    expect(html).toContain('Vos agents partent de votre boîte mail.');
    expect(html).toContain('href="/connections"');
    expect(render(null)).toContain('Les agents n’ont pas pu se lire. Rechargez la page.');
    expect(render(null)).not.toContain('data-agent');
  });
});
