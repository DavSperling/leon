'use client';

import { Terminal } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Pill } from '@/components/verre/ui/pill';

export type DocumentationView = 'human' | 'agent';

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
      <Pill
        variant={view === 'human' ? 'active' : 'default'}
        aria-pressed={view === 'human'}
        onClick={() => choose('human')}
        className="pointer-coarse:h-10"
      >
        {t('human')}
      </Pill>
      <Pill
        icon={Terminal}
        variant={view === 'agent' ? 'active' : 'default'}
        aria-pressed={view === 'agent'}
        onClick={() => choose('agent')}
        className="pointer-coarse:h-10"
      >
        {t('agent')}
      </Pill>
    </div>
  );
}
