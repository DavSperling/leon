import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthForm } from '@/components/verre/auth/auth-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('createWorkspace') };
}

export default function SignUpPage() {
  return <AuthForm page="inscription" />;
}
