import { createTranslator } from 'next-intl';
import type fr from '../../../../messages/fr.json';

// La page « Documentation » en Markdown, pour qu'un agent la lise : /documentation.md et le mode « Pour un agent » de la
// page. Les mêmes textes (site.documentation), les mêmes sections dans le même ordre et les mêmes commandes que
// documentation.tsx ; seule la mise en forme change. Rien d'HTML, rien de l'interface (boutons, plan de la page).
//
// Chaque titre porte son ancre en fin de ligne : `## Ce qui part {#ce-qui-part}`. C'est la seule forme qui reste du texte
// brut (pas de balise, pas de ligne en plus) tout en gardant le titre lisible d'un coup d'œil ; les identifiants sont ceux
// des sections de la page.

type Messages = typeof fr;

// Les sections de la page : l'identifiant de l'ancre (le même dans les deux langues) et la clé dans site.documentation.
export const SECTIONS = [
  { id: 'prerequis', key: 'requirements' },
  { id: 'claude-code', key: 'claude' },
  { id: 'terminal', key: 'terminal' },
  { id: 'autoriser', key: 'authorize' },
  { id: 'ce-qui-part', key: 'sent' },
  { id: 'lire', key: 'read' },
  { id: 'mises-a-jour', key: 'updates' },
  { id: 'deconnecter', key: 'disconnect' },
  { id: 'problemes', key: 'problems' },
  { id: 'clone', key: 'clone' },
] as const;

// Les commandes de lecture du poste (read-commands.ts), dans les deux langues : la CLI est en anglais.
export const READ_COMMANDS = [
  '~/.leon/bin/leon threads',
  '~/.leon/bin/leon thread [id]',
  '~/.leon/bin/leon search "<query>"',
  '~/.leon/bin/leon versions <id> --read <n>',
].join('\n');

/** Le chemin d'un écran de Réglages, « Réglages › Intégrations › … » : le même sur la page et dans le Markdown. */
export const settingsPath = (
  settings: (key: 'title' | 'tabIntegrations') => string,
  ...labels: string[]
) => [settings('title'), settings('tabIntegrations'), ...labels].join(' › ');

const fence = (language: string, code: string) => `\`\`\`${language}\n${code}\n\`\`\``;
const list = (items: string[]) => items.map((item) => `- ${item}`).join('\n');
const numbered = (items: string[]) => items.map((item, i) => `${i + 1}. ${item}`).join('\n');

/**
 * - `command`, `address`, `instructions` : ceux de la page (installCommand, serverAddress, claudeCodeInstructions), null
 *   quand l'adresse du serveur est refusée : le Markdown donne alors la forme générique, à adapter ;
 * - `locale` et `messages` : la langue demandée et ses messages.
 */
export function documentationMarkdown({
  locale,
  messages,
  command,
  address,
  instructions,
}: {
  locale: 'en' | 'fr';
  messages: Messages;
  command: string | null;
  address: string | null;
  instructions: string | null;
}): string {
  const t = createTranslator({ locale, messages, namespace: 'site.documentation' });
  const settings = createTranslator({ locale, messages, namespace: 'settings' });
  // Les <code> des messages deviennent des `morceaux de code`.
  const md = (key: Parameters<typeof t.markup>[0], values: Record<string, string> = {}) =>
    t.markup(key, { ...values, code: (chunks) => `\`${chunks}\`` });
  const title = (key: Parameters<typeof t>[0]) => `### ${t(key)}`;

  const server = address ?? `<${t('addressPlaceholder')}>`;
  const body = {
    requirements: [
      md('requirements.lead'),
      list(
        (['system', 'utilities', 'claude', 'account'] as const).map((k) => md(`requirements.${k}`)),
      ),
    ],
    claude: [
      md('claude.lead'),
      ...(instructions === null
        ? [md('claude.unavailable')]
        : [title('claude.instructionsTitle'), fence('text', instructions)]),
      title('claude.askTitle'),
      list((['ask1', 'ask2', 'ask3', 'ask4'] as const).map((k) => md(`claude.${k}`))),
      md('claude.end'),
    ],
    terminal: [
      md(command === null ? 'terminal.leadGeneric' : 'terminal.lead'),
      fence('sh', command ?? `curl -fsSL ${server}/install | sh`),
      title('terminal.doesTitle'),
      numbered([md('terminal.step1'), md('terminal.step2')]),
      md('terminal.scope'),
      md('terminal.again'),
    ],
    authorize: [
      md('authorize.p1'),
      md('authorize.p2'),
      md('authorize.p3'),
      title('authorize.sharedTitle'),
      md('authorize.shared'),
    ],
    sent: [
      md('sent.lead'),
      list(
        (['where', 'end', 'tools', 'secrets', 'start', 'lecture', 'rappel', 'resume'] as const).map(
          (k) => md(`sent.${k}`),
        ),
      ),
      md('sent.server'),
    ],
    read: [
      md('read.lead'),
      fence('sh', READ_COMMANDS),
      list((['output', 'consent', 'external'] as const).map((k) => md(`read.${k}`))),
    ],
    updates: [
      md('updates.auto'),
      md('updates.previous'),
      fence('sh', '~/.leon/bin/leon update --previous'),
      md('updates.previousNote'),
    ],
    disconnect: [
      list([
        md('disconnect.fromLeon', {
          path: settingsPath(settings, settings('computersTitle'), settings('revoke')),
        }),
        md('disconnect.logout'),
        md('disconnect.remove'),
      ]),
      md('disconnect.all'),
      md('disconnect.kept'),
    ],
    problems: [
      title('problems.browser.title'),
      md('problems.browser.text', { path: settingsPath(settings, settings('tokensTitle')) }),
      fence('sh', `~/.leon/bin/leon login --with-token --url ${server}`),
      md('problems.browser.after'),
      title('problems.noTerminal.title'),
      md('problems.noTerminal.text'),
      title('problems.platform.title'),
      md('problems.platform.text'),
      title('problems.revoked.title'),
      md('problems.revoked.text'),
      title('problems.interrupted.title'),
      md('problems.interrupted.text'),
    ],
    clone: [
      md('clone.lead'),
      fence('sh', 'pnpm leon setup --depot <clone>'),
      md('clone.setup'),
      fence('sh', 'pnpm leon installer-crochets'),
      md('clone.hooks'),
      md('clone.note'),
    ],
  } satisfies Record<(typeof SECTIONS)[number]['key'], string[]>;

  const blocks = [
    `# ${t('heroTitle')}`,
    md('heroLead'),
    ...SECTIONS.flatMap(({ id, key }) => [`## ${t(`${key}.title`)} {#${id}}`, ...body[key]]),
  ];
  return `${blocks.join('\n\n')}\n`;
}
