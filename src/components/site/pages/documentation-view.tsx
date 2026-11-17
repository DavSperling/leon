'use client';

import { Terminal } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Pill } from '@/components/verre/ui/pill';

export type DocumentationView = 'human' | 'agent';

// Le choix est pressé, sans encre : l'encre de la page est le bouton du haut (une seule par vue).
const QUIET =
  'pointer-coarse:h-10 aria-pressed:border-line-strong aria-pressed:bg-n-150 aria-pressed:text-fg aria-pressed:[&_svg]:text-fg';

// Les deux choix de l'interrupteur de la page Documentation. Le choix est dans l'adresse (?vue=agent), que la page
// relit côté serveur : le lien se partage, et le Markdown est déjà là au chargement.

export function ViewSwitch({ view }: { view: DocumentationView }) {
  const t = useTranslations('site.documentation.view');
  const router = useRouter();
  const pathname = usePathname();
  const choose = (next: DocumentationView) =>
    router.replace(next === 'agent' ? `${pathname}?vue=agent` : pathname, { scroll: false });

  return (
    // biome-ignore lint/a11y/useSemanticElements: un groupe de boutons bascule (aria-pressed), pas un formulaire (fieldset)
    <div role="group" aria-label={t('label')} className="flex flex-wrap gap-2">
      <Pill aria-pressed={view === 'human'} onClick={() => choose('human')} className={QUIET}>
        {t('human')}
      </Pill>
      <Pill
        icon={Terminal}
        aria-pressed={view === 'agent'}
        onClick={() => choose('agent')}
        className={QUIET}
      >
        {t('agent')}
      </Pill>
    </div>
  );
}
