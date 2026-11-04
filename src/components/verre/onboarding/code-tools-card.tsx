'use client';

import { Terminal } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/verre/ui/button';
import { CodeLine } from '@/components/verre/ui/copy';
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

/**
 * « Vos outils de code » dans l'étape Vos outils : la commande qui installe la CLI (`curl -fsSL <leon>/install | sh`,
 * bâtie côté serveur par `installCommand`) et le lien vers ce qui part, dans Réglages (S14). Elle ne touche ni aux cases
 * cochées ni au bouton Continuer.
 */
export function CodeToolsCard({ command }: { command: string }) {
  const t = useTranslations('onboarding.tools.code');
  return (
    <PreviewCard title={t('title')}>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
        {TOOLS.map(({ name, logo }) => (
          <li key={name} className="inline-flex items-center gap-2 text-ui text-fg">
            {logo ? (
              // Le logo est posé sur du blanc, comme ToolIcon : les logos sombres restent lisibles en thème sombre.
              <span
                aria-hidden="true"
                className="grid size-[22px] shrink-0 place-items-center rounded-chip border border-line bg-[#fff]"
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
      <p className="mb-3 text-ui text-muted">{nb(t('lead'))}</p>
      <CodeLine code={command} wrap />
      <Button asChild variant="link" size="sm" className="mt-3">
        <Link href="/reglages#ordinateurs">{t('whatLeaves')}</Link>
      </Button>
    </PreviewCard>
  );
}
