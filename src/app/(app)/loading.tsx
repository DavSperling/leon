import { useTranslations } from 'next-intl';
import { BrandLoader } from '@/components/verre/shell/brand-loader';

export default function Loading() {
  const t = useTranslations('common');
  return <BrandLoader label={t('loading')} />;
}
