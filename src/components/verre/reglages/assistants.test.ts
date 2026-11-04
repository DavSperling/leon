import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { AssistantsSection } from './assistants';
import type { Token } from './tokens';

// Les actions importent Better Auth : seul le dessin de la section se teste ici.
vi.mock('@/app/(app)/reglages/actions', () => ({ revokeTokenAction: vi.fn() }));

const ADDRESS = 'https://leon.example/api/mcp';
const CLAUDE: Token = {
  id: 'a1',
  name: 'Claude',
  hint: 'wxyz',
  createdAt: new Date('2026-11-01T10:00:00Z'),
  lastUsedAt: new Date('2026-11-02T10:00:00Z'),
  kind: 'assistant',
  clientName: 'Claude',
  clientHost: 'claude.ai',
};
const CODEX: Token = {
  ...CLAUDE,
  id: 'a2',
  name: 'Codex',
  lastUsedAt: null,
  clientName: 'Codex',
  clientHost: '127.0.0.1',
};

const render = (assistants: Token[], locale: 'en' | 'fr' = 'en') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: createElement(AssistantsSection, { address: ADDRESS, assistants }),
    }),
  );

// Le texte seul : une commande longue est coupée en <span> aux options (--transport), pour passer à la ligne.
const text = (html: string) => html.replace(/<[^>]+>/g, '');

// M08 : la section « Assistants connectés » de Réglages, ancre #assistants, qui remplace « Brancher Claude Code ».
describe('AssistantsSection', () => {
  it('porte l’ancre #assistants et montre l’adresse du MCP, telle quelle, avec son bouton Copier', () => {
    const html = render([]);

    expect(html).toMatch(/<section id="assistants"/);
    expect(html).toContain('Connected assistants');
    expect(html).toContain(`>${ADDRESS}</code>`);
    expect(html).toContain('>Copy<');
  });

  it('donne une ligne par client, avec le chemin pour l’ajouter', () => {
    const shown = text(render([]));

    for (const line of [
      'claude.ai and Claude Desktop',
      'Customize › Connectors › Add custom connector',
      'ChatGPT',
      'Plugins › Add custom MCP server',
      'Claude Code',
      'Codex',
      'Cursor and VS Code',
      'mcp.json',
    ]) {
      expect(shown, line).toContain(line);
    }
  });

  it('donne les commandes de Claude Code et de Codex, sans jeton ni en-tête', () => {
    const html = render([]);
    const shown = text(html);

    expect(shown).toContain(`claude mcp add --transport http leon ${ADDRESS}`);
    expect(shown).toContain(`codex mcp add leon --url ${ADDRESS}`);
    expect(shown).toContain('codex mcp login leon');
    // la commande à jeton de l’ancienne section ne revient pas
    expect(shown).not.toMatch(/--header|Bearer|your token/i);
    // l’adresse, la commande de Claude Code et les deux de Codex : quatre boutons Copier
    expect(html.match(/>Copy</g)).toHaveLength(4);
  });

  it('liste chaque assistant avec son nom, son hôte, sa création, sa dernière utilisation et Revoke', () => {
    const html = render([CLAUDE, CODEX]);

    expect(html).toContain('>Claude</span>');
    expect(html).toContain('>claude.ai</code>');
    expect(html).toContain('>Codex</span>');
    expect(html).toContain('>127.0.0.1</code>');
    expect(html).toContain('created');
    expect(html).toContain('never used');
    expect(html.match(/data-revoke="/g)).toHaveLength(2);
    expect(html).toContain('>Revoke<');
    expect(html).not.toContain('No assistant connected yet');
  });

  // Le jeton d’accès d’un assistant change à chaque renouvellement : son indice ne dirait rien.
  it('ne montre pas l’indice du jeton d’accès', () => {
    expect(render([CLAUDE])).not.toContain('leon_…');
  });

  it('sans assistant, le dit et garde l’adresse et les clients', () => {
    const html = render([]);

    expect(html).toContain('No assistant connected yet.');
    expect(html).not.toContain('data-revoke');
    expect(html).toContain(ADDRESS);
  });

  it('se lit en français', () => {
    const html = render([CLAUDE], 'fr');
    const shown = text(html);

    expect(html).toContain('Assistants connectés');
    expect(html).toContain('Révoquer');
    expect(shown).toContain('claude.ai et Claude Desktop');
    expect(shown).toContain('Personnaliser › Connecteurs › Ajouter un connecteur personnalisé');
    expect(shown).toContain('Cursor et VS Code');
    expect(shown).toContain(`claude mcp add --transport http leon ${ADDRESS}`);
    expect(render([], 'fr')).toContain('Aucun assistant connecté pour l’instant.');
  });

  it('révoque un assistant avec ses propres mots, dans les deux langues', () => {
    expect(en.settings.assistantRevoked).toBe('Assistant disconnected.');
    expect(fr.settings.assistantRevoked).toBe('Assistant déconnecté.');
    expect(en.settings.assistantRevokeDescription).toMatch(/lose access/);
    expect(fr.settings.assistantRevokeDescription).toMatch(/plus accès/);
  });

  // La section « Brancher Claude Code » (commande à jeton) a disparu avec ses textes.
  it('ne laisse aucun texte de l’ancienne section', () => {
    for (const settings of [en.settings, fr.settings]) {
      expect(settings).not.toHaveProperty('claudeTitle');
      expect(settings).not.toHaveProperty('claudeDescription');
      expect(settings).not.toHaveProperty('tokenPlaceholder');
    }
  });
});
