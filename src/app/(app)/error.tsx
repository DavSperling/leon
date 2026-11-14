'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/verre/ui/button';
import { EmptyState } from '@/components/verre/ui/feedback';

// Erreur d'un écran, dans la page (l'ossature reste) : un titre court, une ligne, un seul bouton.
// Le message de l'erreur n'est jamais affiché : il pourrait contenir du texte de la mémoire.
export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations('errors');
  return (
    // annoncée même sans changement de chemin (l'ossature ne déplace alors pas le focus)
    <div role="alert" className="max-w-[720px]">
      <EmptyState
        title={t('loadTitle')}
        description={t('retrySoon')}
        action={
          <Button variant="secondary" size="sm" onClick={reset}>
            {t('retry')}
          </Button>
        }
      />
    </div>
  );
}
