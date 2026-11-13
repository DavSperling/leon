import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { AssistantSetup } from './assistants';
import { captionOf, type Token, TokenFacts } from './tokens';

// Les actions importent Better Auth : seul le dessin de la section se teste ici.
vi.mock('@/app/(app)/reglages/actions', () => ({
  revokeTokenAction: vi.fn(),
  createTokenAction: vi.fn(),
}));

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

const wrap = (child: ReturnType<typeof createElement>, locale: 'en' | 'fr' = 'en') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: child,
    }),
  );
const render = (locale: 'en' | 'fr' = 'en') =>
  wrap(createElement(AssistantSetup, { address: ADDRESS }), locale);

// Le texte seul : une commande longue est coupée en <span> aux options (--transport), pour passer à la ligne.
const text = (html: string) => html.replace(/<[^>]+>/g, '');

// M08 : « Connecter un assistant », le panneau de la tuile #assistants, qui remplace « Brancher Claude Code ».
describe('AssistantSetup', () => {
  it('montre l’adresse du MCP, telle quelle, avec son bouton Copier', () => {
    const html = render();

    expect(html).toContain(`>${ADDRESS}</code>`);
    expect(html).toContain('>Copy<');
  });

  it('donne une ligne par client, avec le chemin pour l’ajouter', () => {
    const shown = text(render());

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
    const html = render();
    const shown = text(html);

    expect(shown).toContain(`claude mcp add --transport http leon ${ADDRESS}`);
    expect(shown).toContain(`codex mcp add leon --url ${ADDRESS}`);
    expect(shown).toContain('codex mcp login leon');
    // la commande à jeton de l’ancienne section ne revient pas
    expect(shown).not.toMatch(/--header|Bearer|your token/i);
    // l’adresse, la commande de Claude Code et les deux de Codex : quatre boutons Copier
    expect(html.match(/>Copy</g)).toHaveLength(4);
  });

  it('se lit en français', () => {
    const shown = text(render('fr'));

    expect(shown).toContain('claude.ai et Claude Desktop');
    expect(shown).toContain('Personnaliser › Connecteurs › Ajouter un connecteur personnalisé');
    expect(shown).toContain('Cursor et VS Code');
    expect(shown).toContain(`claude mcp add --transport http leon ${ADDRESS}`);
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

// Un assistant connecté : sa carte dit son hôte ; son panneau, son client, son hôte et ses dates.
describe('TokenFacts et captionOf, pour un assistant', () => {
  it('légende la carte par l’hôte, jamais par l’indice du jeton d’accès (il change à chaque renouvellement)', () => {
    expect(captionOf(CLAUDE, 'Computer')).toBe('claude.ai');
    expect(captionOf(CODEX, 'Computer')).toBe('127.0.0.1');
  });

  it('montre l’hôte, la connexion et la dernière utilisation, sans l’indice ; le client seulement s’il ne redit pas le titre', () => {
    const html = wrap(createElement(TokenFacts, { token: CLAUDE }));

    expect(html).not.toContain('>Assistant<');
    expect(wrap(createElement(TokenFacts, { token: { ...CLAUDE, name: 'Mon Claude' } }))).toContain(
      '>Claude<',
    );
    expect(html).toContain('>claude.ai<');
    expect(html).toContain('>Connected<');
    expect(html).not.toContain('leon_…');
    expect(wrap(createElement(TokenFacts, { token: CODEX }))).toContain('Never used');
  });
});
