'use client';

import { ArrowUpRight, Terminal } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/verre/ui/button';
import { CodeLine, CopyButton } from '@/components/verre/ui/copy';
import { nb } from '@/lib/verre/nb';
import { PreviewCard } from './preview';

// Les outils de code que `leon setup` branche. Un logo de Simple Icons (CC0, public/logos) quand il en a un ; Codex et
// Antigravity n'y sont pas : une icône de terminal neutre, jamais un logo refait à la main.
const TOOLS = [
  { name: 'Claude Code', logo: 'claude-code' },
  { name: 'Codex', logo: null },
  { name: 'Cursor', logo: 'cursor' },
  { name: 'Antigravity', logo: null },
] as const;

const PATH_TITLE = 'mb-1 text-label font-semibold text-fg-2';

/**
 * « Vos outils de code » dans l'étape Vos outils : deux chemins à égalité pour installer la CLI, « Je demande à Claude »
 * (la consigne `instructions` à coller dans Claude Code, bâtie côté serveur par `claudeCodeInstructions`) d'abord, puis
 * la commande (`curl -fsSL <leon>/install | sh`, `installCommand`). Les liens mènent à ce qui part, dans Réglages (S14),
 * et à la documentation (dans un autre onglet : l'étape garde ses cases cochées). Elle ne touche ni aux cases cochées ni
 * au bouton Continuer.
 */
export function CodeToolsCard({
  command,
  instructions,
}: {
  command: string;
  instructions: string | null;
}) {
  const t = useTranslations('onboarding.tools.code');
  const c = useTranslations('claudeCode');
  const common = useTranslations('common');
  return (
    <PreviewCard title={t('title')}>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
        {TOOLS.map(({ name, logo }) => (
          <li key={name} className="inline-flex items-center gap-2 text-ui text-fg">
            {logo ? (
              // Le logo est posé sur du blanc, comme ToolIcon : les logos sombres restent lisibles en thème sombre.
              <span
                aria-hidden="true"
                className="grid size-[22px] shrink-0 place-items-center rounded-chip border border-line bg-white"
              >
                {/* biome-ignore lint/performance/noImgElement: petit SVG statique, rien à optimiser */}
                <img src={`/logos/${logo}.svg`} alt="" className="size-[14px]" />
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="grid size-[22px] shrink-0 place-items-center rounded-chip border border-line bg-glass-3"
              >
                <Terminal strokeWidth={1.6} className="size-[13px] text-fg-2" />
              </span>
            )}
            {name}
          </li>
        ))}
      </ul>
      {/* la colonne peut rétrécir : sans cela la commande, qui ne se coupe pas, élargit la carte et pousse « Copier » dehors à 390 px */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        {instructions !== null && (
          <div>
            <h3 className={PATH_TITLE}>{c('withClaude')}</h3>
            <p className="mb-3 text-ui text-muted">{nb(c('withClaudeLead'))}</p>
            <CopyButton value={instructions} label={c('ask')} copiedMessage={c('copied')} />
          </div>
        )}
        <div className="min-w-0">
          <h3 className={PATH_TITLE}>{c('inTerminal')}</h3>
          <p className="mb-3 text-ui text-muted">{nb(t('lead'))}</p>
          <CodeLine code={command} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <Button asChild variant="link" size="sm">
          <Link href="/reglages#ordinateurs">{t('whatLeaves')}</Link>
        </Button>
        <Button asChild variant="link" size="sm">
          <Link href="/documentation" target="_blank">
            {c('docs')}
            <ArrowUpRight aria-hidden="true" strokeWidth={1.8} />
            <span className="sr-only">{common('newTab')}</span>
          </Link>
        </Button>
      </div>
    </PreviewCard>
  );
}
