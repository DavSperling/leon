import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { pathExists, readText } from '@/test/contracts/files';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { DocumentationPage } from './documentation';
import { documentationMarkdown } from './documentation-markdown';

// Les boutons « Copier » que la page pose elle-même (pas ceux de CodeLine) : ce qu'ils copient et confirment.
const copies: Record<string, unknown>[] = [];
vi.mock('@/components/verre/ui/copy', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/verre/ui/copy')>();
  return {
    ...real,
    CopyButton: (props: Parameters<typeof real.CopyButton>[0]) => {
      copies.push(props);
      return real.CopyButton(props);
    },
  };
});

const ADDRESS = 'https://leon.example';
const COMMAND = `curl -fsSL ${ADDRESS}/install | sh`;
const INSTRUCTIONS = `Install Leon: ${COMMAND} (${ADDRESS}/documentation.md)`;
const LOCALES = [
  ['en', en],
  ['fr', fr],
] as const;
type Props = { command: string | null; address: string | null; instructions: string | null };
const GIVEN: Props = { command: COMMAND, address: ADDRESS, instructions: INSTRUCTIONS };
const GENERIC: Props = { command: null, address: null, instructions: null };

const render = (locale: 'en' | 'fr', props: Props = GIVEN) => {
  copies.length = 0;
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : fr,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: createElement(DocumentationPage, props),
    }),
  );
};

const decode = (html: string) =>
  html
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&');
const textOf = (html: string) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
// Le contenu des éléments <code> : commandes, options et chemins cités par la page.
const codesOf = (html: string) =>
  [...html.matchAll(/<code[^>]*>(.*?)<\/code>/gs)].map((match) => textOf(match[1] ?? ''));

const ANCHORS = [
  'prerequis',
  'claude-code',
  'terminal',
  'autoriser',
  'ce-qui-part',
  'mises-a-jour',
  'deconnecter',
  'problemes',
  'clone',
];

describe('la page Documentation', () => {
  it.each(LOCALES)('a ses neuf sections et son plan, avec une ancre chacune (%s)', (locale) => {
    const html = render(locale);

    for (const id of ANCHORS) {
      expect(html, id).toContain(`<section id="${id}"`);
      expect(html, id).toContain(`href="#${id}"`);
    }
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/<section id=/g)).toHaveLength(ANCHORS.length);
  });

  it('se lit en anglais et en français, du même ordre', () => {
    const english = render('en');
    const french = render('fr');

    // le titre est coupé mot à mot (SplitWords)
    expect(textOf(english)).toContain('Connect Leon to your coding tools');
    expect(english).toContain('What you need');
    expect(textOf(french)).toContain('Brancher Leon à vos outils de code');
    expect(french).toContain('Ce qu’il faut');
    for (const html of [english, french]) {
      const positions = ANCHORS.map((id) => html.indexOf(`<section id="${id}"`));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it.each(LOCALES)(
    'porte la commande du serveur, la consigne et le bouton qui la copie (%s)',
    (locale, messages) => {
      const html = render(locale);

      expect(html).toContain(`>${COMMAND}</code>`);
      expect(decode(html)).toContain(`Install Leon: ${COMMAND}`);
      expect(codesOf(html)).toContain(`~/.leon/bin/leon login --with-token --url ${ADDRESS}`);
      expect(copies).toEqual([
        expect.objectContaining({
          value: INSTRUCTIONS,
          label: messages.claudeCode.ask,
          copiedMessage: messages.claudeCode.copied,
        }),
      ]);
      // Le bouton est dans « Demander à Claude Code », avant la commande du terminal.
      expect(html.indexOf(`>${messages.claudeCode.ask}</button>`)).toBeGreaterThan(
        html.indexOf('<section id="claude-code"'),
      );
      expect(html.indexOf(`>${messages.claudeCode.ask}</button>`)).toBeLessThan(
        html.indexOf('<section id="terminal"'),
      );
    },
  );

  // Sans adresse acceptée (claudeCodeInstructions rend null), la forme générique : à adapter, rien à copier de faux.
  it.each([
    ['en', 'address of your Leon'],
    ['fr', 'adresse de votre Leon'],
  ] as const)(
    'montre une forme générique quand l’adresse est refusée (%s)',
    (locale, placeholder) => {
      const html = render(locale, GENERIC);

      expect(copies).toEqual([]);
      expect(codesOf(html)).toContain(`curl -fsSL <${placeholder}>/install | sh`);
      expect(codesOf(html)).toContain(`~/.leon/bin/leon login --with-token --url <${placeholder}>`);
      expect(html).not.toContain('https://');
      expect(html).not.toContain(`>${(locale === 'en' ? en : fr).claudeCode.ask}</button>`);
      for (const id of ANCHORS) expect(html, id).toContain(`<section id="${id}"`);
    },
  );

  // « La page ne doit rien dire de faux » : les commandes et les options citées sont celles de la CLI.
  it.each(LOCALES)('ne cite que des commandes et des options que la CLI connaît (%s)', (locale) => {
    const cli = readText('src/cli/leon.ts');
    const commands = [...cli.matchAll(/command === '([a-z-]+)'/g)].map((match) => match[1]);
    expect(commands).toEqual(
      expect.arrayContaining([
        'setup',
        'login',
        'logout',
        'update',
        'retirer-crochets',
        'installer-crochets',
      ]),
    );
    const codes = codesOf(render(locale));

    const used = codes.flatMap((code) => [...code.matchAll(/(?:^|[\s/])leon (\S+)/g)]);
    expect(used.length).toBeGreaterThan(8);
    for (const [, command] of used) expect(commands, command).toContain(command);
    // `--bare` et `claude -p` sont ceux de Claude Code, cités par le texte d'accord de `leon setup`.
    const flags = new Set(codes.flatMap((code) => code.match(/--[a-z-]+/g) ?? []));
    expect([...flags].toSorted()).toEqual(
      ['--bare', '--depot', '--oui', '--previous', '--url', '--with-token', '--yes'].toSorted(),
    );
    for (const flag of flags) if (flag !== '--bare') expect(cli, flag).toContain(flag);
    // Les mots seuls, sans « leon » devant, sont aussi des commandes de la CLI.
    for (const word of ['logout', 'retirer-crochets']) expect(commands).toContain(word);
  });

  // Les noms que la page donne aux boutons et aux écrans sont ceux de l'application.
  it.each(LOCALES)(
    'nomme les boutons et les écrans comme l’application (%s)',
    (locale, messages) => {
      const text = textOf(render(locale));
      const { allow, cancel, question } = messages.computer.authorize;

      expect(text).toContain(`${allow}`);
      expect(text).toContain(cancel);
      expect(text).toContain(question.split('{space}')[0]?.trim());
      const s = messages.settings;
      expect(text).toContain(
        `${s.title} › ${s.tabIntegrations} › ${s.computersTitle} › ${s.revoke}`,
      );
      expect(text).toContain(`${s.title} › ${s.tabIntegrations} › ${s.tokensTitle}`);
    },
  );

  // « Ce qui part » reprend, terme à terme, ce que le texte d'accord de `leon setup` met entre apostrophes inverses,
  // et la liste des outils dont il garde la sous-commande.
  it.each(LOCALES)(
    'reprend les termes du texte d’accord de la CLI dans « Ce qui part » (%s)',
    (_locale, messages) => {
      const source = readText('src/cli/install-hooks.ts');
      const start = source.indexOf('const CONSENT_LINES = [');
      const block = source.slice(start, source.indexOf('\n];', start));
      const quoted = [...block.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
      const tools = /such as (.+?);/.exec(block)?.[1]?.split(/, | or /);
      expect(quoted).toEqual(['claude -p', '--bare']);
      expect(tools).toEqual(['git', 'gh', 'pnpm', 'docker']);

      const sent = Object.values(messages.site.documentation.sent).join('\n');
      for (const term of [...quoted, ...(tools ?? [])])
        expect(sent, term).toContain(`<code>${term}</code>`);
    },
  );

  // Le serveur des crochets : celui de `leon login`, sauf LEON_URL et LEON_TOKEN posées toutes les deux (texte d'accord).
  it.each(LOCALES)(
    'dit quand LEON_URL et LEON_TOKEN passent avant la connexion (%s)',
    (_l, messages) => {
      expect(readText('src/cli/install-hooks.ts')).toContain(
        'unless LEON_URL and LEON_TOKEN are both set: those come first',
      );
      const { server } = messages.site.documentation.sent;

      expect(server).toContain('<code>LEON_URL</code>');
      expect(server).toContain('<code>LEON_TOKEN</code>');
    },
  );

  // Claude Code lance la commande à la place de la personne : l'écran d'autorisation (avertissement) et cette page
  // (« Autoriser ») disent la même chose, dans les deux langues.
  it.each(LOCALES)(
    'dit, comme l’écran d’autorisation, que la commande peut être lancée par Claude Code (%s)',
    (_locale, messages) => {
      expect(messages.computer.authorize.warning).toContain('Claude Code');
      expect(messages.site.documentation.authorize.p1).toContain('Claude Code');
    },
  );

  // M4 : le texte neuf ne redit pas la phrase de confidentialité du texte d'accord, il ne promet rien de plus.
  it.each(LOCALES)(
    'ne promet rien sur la confidentialité de plus que le texte d’accord (%s)',
    (_locale, messages) => {
      const sent = Object.values(messages.site.documentation.sent).join('\n');

      expect(sent).not.toMatch(/\bpriv/i);
    },
  );

  // La consigne de « Je demande à Claude » renvoie à /documentation.md (installCommand, côté serveur) : c'est Claude Code
  // qui la lit, il lui faut le Markdown. Cette adresse existe, et elle a la section que la consigne nomme.
  it.each(LOCALES)(
    'a, sur /documentation.md, la section que nomme la consigne de « Je demande à Claude » (%s)',
    (locale, messages) => {
      const path = /docs: `\$\{origin\}(\/[a-z.]+)`/.exec(
        readText('src/server/cli/install-command.ts'),
      )?.[1];
      const { title } = messages.site.documentation.sent;

      expect(path).toBe('/documentation.md');
      expect(pathExists('src/app/documentation.md/route.ts')).toBe(true);
      expect(documentationMarkdown({ locale, messages, ...GIVEN })).toContain(
        `\n## ${title} {#ce-qui-part}\n`,
      );
    },
  );

  it('ne cite aucune adresse de Leon autre que celle du serveur', () => {
    for (const [locale] of LOCALES) {
      const urls = textOf(render(locale)).match(/https?:\/\/[^\s)]+/g) ?? [];
      expect(urls.length).toBeGreaterThan(2);
      for (const url of urls) expect(url).toMatch(/^https?:\/\/(leon\.example|localhost)/);
    }
  });
});
