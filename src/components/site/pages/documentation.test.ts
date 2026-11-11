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

// L'interrupteur « Pour vous » / « Pour un agent » : ses deux pastilles, et le routeur qu'un clic appelle.
const pills: Record<string, unknown>[] = [];
vi.mock('@/components/verre/ui/pill', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/verre/ui/pill')>();
  return {
    ...real,
    Pill: (props: Parameters<typeof real.Pill>[0]) => {
      pills.push({ ...props });
      return real.Pill(props);
    },
  };
});
const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/documentation',
}));

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

const render = (locale: 'en' | 'fr', props: Props = GIVEN, view: 'human' | 'agent' = 'human') => {
  copies.length = 0;
  pills.length = 0;
  const messages = locale === 'en' ? en : fr;
  const markdown = documentationMarkdown({ locale, messages, ...props });
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages,
      // biome-ignore lint/correctness/noChildrenProp: createElement(Fournisseur, props, enfant) ne type pas ses enfants
      children: createElement(DocumentationPage, { ...props, view, markdown }),
    }),
  );
};

// Un clic sur une pastille de l'interrupteur (ses props, capturées au rendu).
const click = (index: number) => (pills[index]?.onClick as (() => void) | undefined)?.();

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
  'lire',
  'mises-a-jour',
  'deconnecter',
  'problemes',
  'clone',
];

describe('la page Documentation', () => {
  it.each(LOCALES)('a ses dix sections et son plan, avec une ancre chacune (%s)', (locale) => {
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
      [
        '--bare',
        '--depot',
        '--oui',
        '--outil',
        '--previous',
        '--read',
        '--url',
        '--with-token',
        '--yes',
      ].toSorted(),
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
      const tools = /developer tools such as (.+?);/.exec(block)?.[1]?.split(/, | or /);
      expect(quoted).toEqual(['claude -p', '--bare', '!', '/', '!']);
      expect(tools).toEqual(['git', 'gh', 'pnpm', 'docker']);

      const sent = Object.values(messages.site.documentation.sent).join('\n');
      for (const term of [...quoted, ...(tools ?? [])])
        expect(sent, term).toContain(`<code>${term}</code>`);
    },
  );

  // `leon setup` branche aussi Codex, Cursor et Antigravity (setup.ts) : la page le dit, avec ce que leurs textes d'accord
  // disent des messages que l'outil écrit lui-même (T43, décision d'Amos du 10/11).
  it.each(LOCALES)('dit ce qui part des autres outils de code (%s)', (locale, messages) => {
    const { tools } = messages.site.documentation.sent;
    const { claude } = messages.site.documentation.requirements;

    for (const tool of ['Codex', 'Cursor', 'Antigravity']) {
      expect(tools).toContain(tool);
      expect(claude).toContain(tool);
    }
    // #162 : ~/.gemini seul est Gemini CLI, que `leon setup` ne branche pas.
    expect(`${tools} ${claude}`).not.toContain('Gemini / Antigravity');
    expect(tools).toContain('<code>!</code>');
    expect(tools).toContain(
      locale === 'en'
        ? 'labeled as written by the tool, not by you'
        : 'marqués comme écrits par l’outil et non par vous',
    );
    expect(claude).not.toContain('not supported yet');
  });

  // `leon setup` propose aussi l'usage `resume` (RESUME_LINES) : la page dit qu'il est à part, ce qu'il envoie, à qui.
  it.each(LOCALES)(
    'dit ce que l’usage resume envoie, et qu’il est demandé à part (%s)',
    (locale, messages) => {
      const { resume } = messages.site.documentation.sent;

      expect(readText('src/cli/install-hooks.ts')).toContain(
        'usage "resume", optional, asked separately',
      );
      expect(resume).toContain('<code>resume</code>');
      expect(resume).toContain('<code>--yes</code>');
      expect(resume).toContain(
        locale === 'en' ? 'Leon’s model provider' : 'fournisseur du modèle de Leon',
      );
      // Le même usage tient à jour l'état des fils (lot 12, D23), au présent : le texte d'accord le dit, la page aussi,
      // avec ce que le retrait en arrête.
      expect(readText('src/cli/install-hooks.ts')).toContain(
        'The same usage also keeps the state of your work threads up to date',
      );
      expect(readText('src/cli/install-hooks.ts')).toContain(
        'Withdrawing your consent stops this too, once the Leon server is told.',
      );
      expect(resume).toContain(
        locale === 'en'
          ? 'The same usage also keeps the state of your work threads up to date'
          : 'Le même usage sert aussi à tenir à jour l’état de vos fils de travail',
      );
      expect(resume).toContain(
        locale === 'en'
          ? 'Withdrawing your consent stops this too, once the Leon server is told.'
          : 'Le retrait de votre accord l’arrête aussi, une fois le serveur de Leon prévenu.',
      );
      expect(resume).not.toContain(locale === 'en' ? 'Later' : 'Plus tard');
      // Un refus est gardé (A16) : la page dit qu'il n'est plus redemandé, comment revenir dessus, et le délai du
      // retrait que dit RESUME_LINES.
      expect(resume).toContain(locale === 'en' ? 'A refusal is kept' : 'Un refus est gardé');
      expect(resume).toContain('<code>~/.leon/bin/leon retirer-crochets</code>');
      expect(readText('src/cli/install-hooks.ts')).toContain('may still be written within an hour');
      expect(resume).toContain(locale === 'en' ? 'within an hour' : 'dans l’heure');
      // Le retrait prévient le serveur de la connexion (T43), et le texte de l'usage le dit aussi.
      expect(readText('src/cli/install-hooks.ts')).toContain('it tells the Leon server');
      expect(resume).toContain(
        locale === 'en' ? 'tells the Leon server' : 'prévient le serveur de Leon',
      );
      // Seulement le serveur et le compte de la connexion du moment (T43 amendé le 10/11).
      expect(readText('src/cli/install-hooks.ts')).toContain(
        'only that server and account: one this computer used before is not told',
      );
      expect(resume).toContain(
        locale === 'en'
          ? 'only that server and account: one this computer used before is not told'
          : 'ce serveur et ce compte seulement : un autre que cet ordinateur a utilisé avant n’en sait rien',
      );
      // Un retrait resté en attente se dit au serveur de la connexion du moment où il part : après un changement de
      // connexion, l'ancien serveur n'en sait rien.
      expect(readText('src/cli/install-hooks.ts')).toContain(
        'Leon later tells the server this computer is connected to by then',
      );
      expect(resume).toContain(
        locale === 'en'
          ? 'Leon later tells the server the computer is connected to by then'
          : 'Leon prévient plus tard le serveur auquel l’ordinateur est alors connecté',
      );
      expect(documentationMarkdown({ locale, messages, ...GIVEN })).toContain('`resume`');
    },
  );

  // L'usage `lecture` (T47, T64) : coché par défaut, demandé une fois pour tous les outils, dans le terminal ou par une
  // case de la page « Autoriser » ; la page dit ce qu'il pousse au démarrage, ce que l'agent peut lire, qu'il ne permet
  // jamais d'écrire, et sa portée : le jeton de l'ordinateur.
  it.each(LOCALES)(
    'dit ce que l’usage lecture pousse et permet, et qu’il se choisit sur la page (%s)',
    (locale, messages) => {
      const { lecture, lead, start } = messages.site.documentation.sent;
      const words = (en: string, fr: string) => (locale === 'en' ? en : fr);

      for (const term of [
        '<code>lecture</code>',
        '<code>[Y/n]</code>',
        '<code>--yes</code>',
        '<code>leon threads</code>',
        '<code>leon thread</code>',
        '<code>leon search</code>',
        '<code>leon versions</code>',
        '<code>leon lessons</code>',
        '<code>retirer-crochets</code>',
      ])
        expect(lecture, term).toContain(term);
      expect(lecture).toContain(words('checked by default', 'coché par défaut'));
      expect(lecture).toContain(
        words('never lets an agent write', 'ne permet jamais à un agent d’écrire'),
      );
      expect(lecture).toContain(words('every agent on the computer', 'tout agent de l’ordinateur'));
      expect(lecture).toContain(words('A refusal is kept', 'Un refus est gardé'));
      expect(lead).toContain(words('gives no usage by itself', 'ne donne aucun usage de lui-même'));
      expect(start).toContain('<code>lecture</code>');
      expect(documentationMarkdown({ locale, messages, ...GIVEN })).toContain(
        lecture.replace(/<\/?code>/g, '`'),
      );
      expect(textOf(render(locale))).toContain(
        words(
          'The lecture usage (reading Leon) is checked by default',
          'L’usage lecture (lire Leon) est coché par défaut',
        ),
      );
    },
  );

  // Les commandes de lecture (T44, T54, T55) : cinq, dont `leon lessons`, et l'outil `lessons` du connecteur MCP, qui ne
  // rend pas la session externe.
  it.each(LOCALES)(
    'la section lire nomme leon lessons et l’outil lessons (%s)',
    (locale, messages) => {
      const { output, external } = messages.site.documentation.read;
      const markdown = documentationMarkdown({ locale, messages, ...GIVEN });

      expect(output).toContain('<code>lessons</code>');
      expect(external).toContain('<code>lessons</code>');
      expect(markdown).toContain('~/.leon/bin/leon lessons [id]');
      expect(textOf(render(locale))).toContain('leon lessons [id]');
    },
  );

  // L'usage `rappel` (T49 ; décisions d'Amos du 11/11 pour le lot 13) : coché par défaut comme `lecture`, pour Claude
  // Code (`leon reminder`), Codex, Cursor et Antigravity ; la page dit ce qui part à chaque message, vers qui, ce
  // qui revient, et ce qui est gardé.
  it.each(LOCALES)(
    'dit ce que l’usage rappel envoie et rend, pour quels outils (%s)',
    (locale, messages) => {
      const { rappel, lead, tools } = messages.site.documentation.sent;
      const words = (en: string, fr: string) => (locale === 'en' ? en : fr);

      for (const term of [
        '<code>rappel</code>',
        '<code>leon reminder</code>',
        '<code>[Y/n]</code>',
        '<code>--yes</code>',
        '<code>retirer-crochets</code>',
        'Claude Code',
        'Codex',
        'Cursor',
        'Antigravity',
        words('2,000', '2 000'),
        words('24 hours', '24 heures'),
        words('1.5 seconds', '1,5 seconde'),
      ])
        expect(rappel, term).toContain(term);
      expect(rappel).toContain(words('checked by default', 'coché par défaut'));
      expect(rappel).toContain(words('neither stores nor logs', 'ne garde ni ne journalise'));
      expect(lead).toContain(words('the reminder', 'le rappel'));
      expect(tools).toContain('<code>rappel</code>');
      // Le rappel vaut aussi pour Antigravity (appli 2.0.6) : l'ancien « jamais pour Antigravity » ne revient pas.
      expect(rappel).toContain('2.0.6');
      expect(rappel).not.toContain(words('never for Antigravity', 'jamais pour Antigravity'));
      expect(tools).not.toContain(
        words(
          'except <code>rappel</code> for Antigravity',
          'sauf <code>rappel</code> pour Antigravity',
        ),
      );
      expect(documentationMarkdown({ locale, messages, ...GIVEN })).toContain(
        rappel.replace(/<\/?code>/g, '`'),
      );
    },
  );

  // T64 : les cases de la page « Autoriser » sont à l'humain ; l'agent qui installe n'y touche pas.
  it.each(LOCALES)(
    'dit que les cases de la page « Autoriser » sont à l’humain (%s)',
    (locale, messages) => {
      const { authorize, claude } = messages.site.documentation;
      const words = (en: string, fr: string) => (locale === 'en' ? en : fr);

      expect(authorize.p1).toContain(words('They are yours', 'Elles sont à vous'));
      expect(authorize.p2).toContain(words('100 seconds', '100 secondes'));
      expect(claude.ask4).toContain('5 minutes');
      expect(claude.ask4).toContain(words('100 seconds', '100 secondes'));
      expect(claude.ask4).toContain(words('a browser it controls', 'un navigateur qu’il pilote'));
      expect(claude.ask3).toContain(
        words('gives no usage by itself', 'ne donne aucun usage de lui-même'),
      );
      expect(messages.claudeCode.withClaudeLead).toContain(
        words(
          'never ticks them or clicks for you',
          'ne les coche jamais et ne clique pas à votre place',
        ),
      );
    },
  );

  // `resume` se propose aussi pour Codex, Cursor et Antigravity (décision d'Amos du 11/11) : leur retrait passe par
  // `--outil`.
  it.each(LOCALES)(
    'dit que resume et lecture se proposent aussi pour Codex, Cursor et Antigravity (%s)',
    (_locale, messages) => {
      const { resume, tools } = messages.site.documentation.sent;
      const { read } = messages.site.documentation;

      expect(resume).toContain('<code>--outil codex</code>');
      expect(tools).toContain('<code>lecture</code>');
      expect(tools).toContain('<code>resume</code>');
      expect(read.consent).not.toMatch(/not offer it yet|ne le propose pas encore/);
      expect(read.consent).toContain('<code>~/.leon/bin/leon setup</code>');
    },
  );

  // Partir : le retrait d'abord, tant que la connexion lui permet de prévenir le serveur ; `logout` l'effacerait, et le
  // lanceur qui le lance part avec le dernier outil.
  it.each(LOCALES)(
    'dit de retirer les crochets avant de révoquer l’ordinateur (%s)',
    (locale, messages) => {
      const { remove, all } = messages.site.documentation.disconnect;

      expect(remove).not.toContain(locale === 'en' ? 'logout</code> first' : 'logout</code> avant');
      // Le lanceur reste tant que le serveur n'a pas appris chaque retrait (removeUnusedLauncher), et révoquer avant
      // rendrait le retrait impossible à dire (401).
      expect(remove).toContain(
        locale === 'en'
          ? 'deletes the launcher once no other tool uses it and the server was told of each withdrawal'
          : 'efface le lanceur une fois qu’aucun outil ne l’utilise plus et que le serveur a appris chaque retrait',
      );
      expect(all).toBe(
        locale === 'en'
          ? 'To leave completely: <code>retirer-crochets</code> (run it again until it no longer says the Leon server could not be told), then revoke the computer in Settings, then delete the <code>~/.leon</code> folder.'
          : 'Pour partir complètement : <code>retirer-crochets</code> (relancez-le tant qu’il dit que le serveur de Leon n’a pas pu être prévenu), puis révoquez l’ordinateur dans Réglages, puis supprimez le dossier <code>~/.leon</code>.',
      );
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

  // L'interrupteur du haut de page : deux choix, l'état annoncé par aria-pressed, l'icône de terminal sur le second.
  describe('l’interrupteur « Pour vous » / « Pour un agent (Markdown) »', () => {
    const group = (html: string, label: string) =>
      new RegExp(`<div role="group" aria-label="${label}"[^>]*>(.*?)</div>`, 's').exec(html)?.[1] ??
      '';
    const buttons = (html: string) =>
      [...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(.*?)<\/button>/gs)].map(
        (match) => ({
          pressed: match[1],
          html: match[2] ?? '',
          text: textOf(match[2] ?? '').trim(),
        }),
      );

    it.each(LOCALES)(
      'propose deux choix, « Pour vous » étant choisi par défaut (%s)',
      (locale, messages) => {
        const { view } = messages.site.documentation;
        const choices = buttons(group(render(locale), view.label));

        expect(choices.map(({ text, pressed }) => [text, pressed])).toEqual([
          [view.human, 'true'],
          [view.agent, 'false'],
        ]);
      },
    );

    it.each(LOCALES)(
      'bascule sur « Pour un agent » : l’autre choix est annoncé choisi (%s)',
      (locale, messages) => {
        const { view } = messages.site.documentation;
        const choices = buttons(group(render(locale, GIVEN, 'agent'), view.label));

        expect(choices.map(({ pressed }) => pressed)).toEqual(['false', 'true']);
      },
    );

    it('porte une icône de terminal cachée aux lecteurs d’écran, devant le libellé de « Pour un agent »', () => {
      const [human, agent] = buttons(group(render('en'), en.site.documentation.view.label));

      expect(human?.html).not.toContain('<svg');
      expect(agent?.html).toMatch(/^<svg[^>]*lucide-terminal[^>]*aria-hidden="true"[^>]*>/);
      expect(agent?.html.indexOf('</svg>')).toBeLessThan(agent?.html.indexOf('For an agent') ?? 0);
    });

    // Le choix est dans l'adresse (?vue=agent) : on peut partager le lien, et la page le relit côté serveur.
    it('met le choix dans l’adresse, sans remonter la page', () => {
      replace.mockClear();
      render('en');
      click(1);
      expect(replace).toHaveBeenLastCalledWith('/documentation?vue=agent', { scroll: false });

      render('en', GIVEN, 'agent');
      click(0);
      expect(replace).toHaveBeenLastCalledWith('/documentation', { scroll: false });
    });
  });

  describe('le mode « Pour un agent »', () => {
    it.each(LOCALES)(
      'montre tout le Markdown à police fixe, avec « Tout copier » et le lien brut (%s)',
      (locale, messages) => {
        const markdown = documentationMarkdown({ locale, messages, ...GIVEN });
        const html = render(locale, GIVEN, 'agent');
        const { view } = messages.site.documentation;

        // dans un <pre> (police fixe) qui garde les retours à la ligne : le texte, tel quel, avec ses \n
        const shown = /<pre[^>]*whitespace-pre-wrap[^>]*><code>(.*?)<\/code><\/pre>/s.exec(
          html,
        )?.[1];
        expect(decode(shown ?? '')).toBe(markdown);
        expect(html).toMatch(/<pre[^>]*font-mono/);
        expect(copies).toEqual([expect.objectContaining({ value: markdown, label: view.copyAll })]);
        expect(html).toContain(`>${view.copyAll}</button>`);
        expect(html).toMatch(
          new RegExp(`<a [^>]*href="/documentation.md"[^>]*>.*?${view.openRaw}</a>`, 's'),
        );
      },
    );

    it.each(LOCALES)(
      'retire le plan et les sections de la page, et garde un seul titre (%s)',
      (locale, messages) => {
        const human = render(locale);
        const html = render(locale, GIVEN, 'agent');

        expect(human).toContain(`aria-label="${messages.site.documentation.toc}"`);
        expect(html).not.toContain(`aria-label="${messages.site.documentation.toc}"`);
        expect(html).not.toContain('<section id=');
        expect(html).not.toContain('href="#claude-code"');
        expect(html.match(/<h1/g)).toHaveLength(1);
      },
    );

    it('n’ajoute pas de lien brut à la page pour vous', () => {
      expect(render('en')).not.toContain('href="/documentation.md"');
    });

    it('montre la forme générique quand l’adresse est refusée', () => {
      const html = decode(render('en', GENERIC, 'agent'));

      expect(html).toContain('curl -fsSL <address of your Leon>/install | sh');
      expect(html).not.toContain('https://');
    });
  });
});
