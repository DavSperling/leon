import { useTranslations } from 'next-intl';
import { PageSkeleton } from '@/components/verre/ui/feedback';

// Squelette d'une page de lecture ; pas de spinner plein écran. La recherche a ses propres cartes fantômes.
export default function Loading() {
  const t = useTranslations('common');
  return <PageSkeleton label={t('loading')} />;
}
