import { ArrowUpRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Children, type ReactNode } from 'react';
import { Button } from '@/components/verre/ui/button';
import { CodeLine, CopyButton } from '@/components/verre/ui/copy';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { CtaLink } from '../parts';
import { READ_COMMANDS, SECTIONS, settingsPath } from './documentation-markdown';
import { type DocumentationView, ViewSwitch } from './documentation-view';
import { PageHero, PageSection } from './page-hero';

// Page « Documentation » : brancher Leon à ses outils de code (le chemin « Je demande à Claude », puis le terminal) et
// ce qu'il faut en savoir. Chaque commande et chaque option citée existe dans src/cli (documentation.test.ts le vérifie) ;
// « Ce qui part » résume le texte d'accord de `leon setup` (CONSENT_LINES, puis l'usage `resume`, RESUME_LINES,
// install-hooks.ts, état des fils compris), sans rien promettre de plus. « Lire Leon » cite les commandes de lecture
// (read-commands.ts) et le signal externe (leon-mcp.ts).
// Le mode « Pour un agent » montre la même page en Markdown (documentation-markdown.ts, aussi servi sur /documentation.md) ;
// SECTIONS (les ancres du plan et leur clé dans site.documentation) est commune aux deux.

const LIST = 'grid gap-2.5 pl-5 marker:text-muted';
const SUBTITLE = 'mt-2 text-ui font-semibold text-fg';

function Code({ children }: { children?: ReactNode }) {
  return (
    <code className="rounded-chip border border-line bg-glass-3 px-1.5 py-px font-mono text-[12.5px] tracking-normal text-fg [overflow-wrap:anywhere]">
      {children}
    </code>
  );
}

// Du texte qui se lit sans se copier : la consigne montrée, ou une commande dont l'adresse reste à remplacer.
function Block({ children }: { children: ReactNode }) {
  return (
    <pre className="rounded-field border border-line bg-glass-3 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed tracking-normal whitespace-pre-wrap text-fg-2 [overflow-wrap:anywhere]">
      <code>{children}</code>
    </pre>
  );
}

function DocSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titre`}
      className="scroll-mt-24 border-t border-line pt-10 first:border-t-0 first:pt-0"
    >
      <h2 id={`${id}-titre`} className="text-h2 font-bold tracking-[-0.02em] text-fg">
        {nb(title)}
      </h2>
      <div className="mt-4 grid gap-4 text-[15px] leading-[1.7] text-fg-2">{children}</div>
    </section>
  );
}

/**
 * - `command` : `curl -fsSL <leon>/install | sh` (installCommand), null quand l'adresse du serveur est refusée ;
 * - `address` : l'adresse du serveur (serverAddress), null de même ;
 * - `instructions` : la consigne de « Je demande à Claude » (claudeCodeInstructions), null de même.
 * Sans adresse, la page montre la forme générique, à adapter, et pas de bouton.
 * - `view` : `agent` montre `markdown` (documentationMarkdown) à la place des sections ; `human`, la page.
 */
export function DocumentationPage({
  command,
  address,
  instructions,
  view,
  markdown,
}: {
  command: string | null;
  address: string | null;
  instructions: string | null;
  view: DocumentationView;
  markdown: string;
}) {
  const t = useTranslations('site.documentation');
  const claude = useTranslations('claudeCode');
  const settings = useTranslations('settings');

  // Du texte avec des <code> : les morceaux de texte reçoivent la typographie française (espaces fines insécables).
  const rich = (key: Parameters<typeof t.rich>[0], values: Record<string, string> = {}) =>
    Children.map(t.rich(key, { ...values, code: (chunks) => <Code>{chunks}</Code> }), (node) =>
      typeof node === 'string' ? nb(node) : node,
    );
  const p = (key: Parameters<typeof t.rich>[0], values?: Record<string, string>) => (
    <p>{rich(key, values)}</p>
  );
  const pathTo = (...labels: string[]) => settingsPath(settings, ...labels);
  const agent = view === 'agent';

  const placeholder = `<${t('addressPlaceholder')}>`;
  const server = address ?? placeholder;
  const shownCommand = command ?? `curl -fsSL ${server}/install | sh`;
  // Une commande dont l'adresse est à remplacer ne se copie pas : elle serait fausse.
  const withServer = (code: string) =>
    address === null ? <Block>{code}</Block> : <CodeLine code={code} wrap />;

  return (
    <>
      <PageHero
        kicker={t('kicker')}
        title={t('heroTitle')}
        accent={t('heroAccent')}
        lead={t('heroLead')}
        // les boutons mènent aux sections : le mode agent n'en a pas
        actions={
          agent ? undefined : (
            <>
              <CtaLink href="#claude-code">{t('heroClaude')}</CtaLink>
              <CtaLink href="#terminal" variant="secondary">
                {t('heroTerminal')}
              </CtaLink>
            </>
          )
        }
      >
        <ViewSwitch view={view} />
      </PageHero>

      <PageSection className="pt-0 sm:pt-0">
        {agent ? (
          <div className="grid max-w-[760px] min-w-0 gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton value={markdown} label={t('view.copyAll')} />
              <Button asChild variant="quiet" size="sm">
                <a href="/documentation.md">
                  <ArrowUpRight aria-hidden="true" strokeWidth={1.8} />
                  {t('view.openRaw')}
                </a>
              </Button>
            </div>
            <Block>{markdown}</Block>
          </div>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-16">
            <nav aria-label={t('toc')} className="lg:sticky lg:top-24 lg:self-start">
              <p className="mb-3 font-mono text-meta font-medium tracking-[0.08em] text-muted uppercase">
                {t('toc')}
              </p>
              <ol className="flex flex-wrap gap-x-4 gap-y-1 lg:grid lg:gap-0.5">
                {SECTIONS.map(({ id, key }) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="inline-flex min-h-8 items-center rounded-sm text-ui text-fg-2 transition-colors duration-200 hover:text-fg pointer-coarse:min-h-10"
                    >
                      {nb(t(`${key}.title`))}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="grid max-w-[760px] min-w-0 gap-10">
              <DocSection id="prerequis" title={t('requirements.title')}>
                <p>{nb(t('requirements.lead'))}</p>
                <ul className={cn(LIST, 'list-disc')}>
                  {(['system', 'utilities', 'claude', 'account'] as const).map((item) => (
                    <li key={item}>{rich(`requirements.${item}`)}</li>
                  ))}
                </ul>
              </DocSection>

              <DocSection id="claude-code" title={t('claude.title')}>
                <p>{nb(t('claude.lead'))}</p>
                {instructions === null ? (
                  <p>{nb(t('claude.unavailable'))}</p>
                ) : (
                  <>
                    <CopyButton
                      value={instructions}
                      label={claude('ask')}
                      copiedMessage={claude('copied')}
                      className="justify-self-start"
                    />
                    <h3 className={SUBTITLE}>{nb(t('claude.instructionsTitle'))}</h3>
                    <Block>{instructions}</Block>
                  </>
                )}
                <h3 className={SUBTITLE}>{nb(t('claude.askTitle'))}</h3>
                <ul className={cn(LIST, 'list-disc')}>
                  {(['ask1', 'ask2', 'ask3', 'ask4'] as const).map((item) => (
                    <li key={item}>{rich(`claude.${item}`)}</li>
                  ))}
                </ul>
                <p>{nb(t('claude.end'))}</p>
              </DocSection>

              <DocSection id="terminal" title={t('terminal.title')}>
                <p>{nb(t(command === null ? 'terminal.leadGeneric' : 'terminal.lead'))}</p>
                {command === null ? (
                  <Block>{shownCommand}</Block>
                ) : (
                  <CodeLine code={command} wrap />
                )}
                <h3 className={SUBTITLE}>{nb(t('terminal.doesTitle'))}</h3>
                <ol className={cn(LIST, 'list-decimal')}>
                  <li>{rich('terminal.step1')}</li>
                  <li>{rich('terminal.step2')}</li>
                </ol>
                {p('terminal.scope')}
                {p('terminal.again')}
              </DocSection>

              <DocSection id="autoriser" title={t('authorize.title')}>
                {p('authorize.p1')}
                {p('authorize.p2')}
                {p('authorize.p3')}
                <h3 className={SUBTITLE}>{nb(t('authorize.sharedTitle'))}</h3>
                {p('authorize.shared')}
              </DocSection>

              <DocSection id="ce-qui-part" title={t('sent.title')}>
                {p('sent.lead')}
                <ul className={cn(LIST, 'list-disc')}>
                  {(['where', 'end', 'tools', 'secrets', 'start', 'resume'] as const).map(
                    (item) => (
                      <li key={item}>{rich(`sent.${item}`)}</li>
                    ),
                  )}
                </ul>
                {p('sent.server')}
              </DocSection>

              <DocSection id="lire" title={t('read.title')}>
                {p('read.lead')}
                <Block>{READ_COMMANDS}</Block>
                <ul className={cn(LIST, 'list-disc')}>
                  {(['output', 'consent', 'external'] as const).map((item) => (
                    <li key={item}>{rich(`read.${item}`)}</li>
                  ))}
                </ul>
              </DocSection>

              <DocSection id="mises-a-jour" title={t('updates.title')}>
                {p('updates.auto')}
                <p>{nb(t('updates.previous'))}</p>
                <CodeLine code="~/.leon/bin/leon update --previous" wrap />
                <p>{nb(t('updates.previousNote'))}</p>
              </DocSection>

              <DocSection id="deconnecter" title={t('disconnect.title')}>
                <ul className={cn(LIST, 'list-disc')}>
                  <li>
                    {rich('disconnect.fromLeon', {
                      path: pathTo(settings('computersTitle'), settings('revoke')),
                    })}
                  </li>
                  <li>{rich('disconnect.logout')}</li>
                  <li>{rich('disconnect.remove')}</li>
                </ul>
                {p('disconnect.all')}
                <p>{nb(t('disconnect.kept'))}</p>
              </DocSection>

              <DocSection id="problemes" title={t('problems.title')}>
                <h3 className={SUBTITLE}>{nb(t('problems.browser.title'))}</h3>
                <p>{rich('problems.browser.text', { path: pathTo(settings('tokensTitle')) })}</p>
                {withServer(`~/.leon/bin/leon login --with-token --url ${server}`)}
                {p('problems.browser.after')}
                <h3 className={SUBTITLE}>{nb(t('problems.noTerminal.title'))}</h3>
                {p('problems.noTerminal.text')}
                <h3 className={SUBTITLE}>{nb(t('problems.platform.title'))}</h3>
                {p('problems.platform.text')}
                <h3 className={SUBTITLE}>{nb(t('problems.revoked.title'))}</h3>
                {p('problems.revoked.text')}
                <h3 className={SUBTITLE}>{nb(t('problems.interrupted.title'))}</h3>
                {p('problems.interrupted.text')}
              </DocSection>

              <DocSection id="clone" title={t('clone.title')}>
                <p>{nb(t('clone.lead'))}</p>
                <Block>pnpm leon setup --depot {'<clone>'}</Block>
                {p('clone.setup')}
                <CodeLine code="pnpm leon installer-crochets" />
                {p('clone.hooks')}
                {p('clone.note')}
              </DocSection>
            </div>
          </div>
        )}
      </PageSection>
    </>
  );
}
