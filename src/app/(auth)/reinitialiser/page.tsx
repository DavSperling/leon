import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthSheet, AuthTitle } from '@/components/verre/auth/frame';
import { ResetPasswordForm } from '@/components/verre/auth/password-reset-form';
import { Button } from '@/components/verre/ui/button';
import { nb } from '@/lib/verre/nb';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('resetMeta') };
}

// Better Auth renvoie ici depuis le lien de l'e-mail : `?token=` s'il est valable, `?error=` sinon.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (token) return <ResetPasswordForm token={token} />;
  const t = await getTranslations('auth');
  return (
    <AuthSheet>
      <AuthTitle>{t('newPassword')}</AuthTitle>
      <p className="mt-3 text-title leading-[1.5] text-pretty text-fg">
        {nb(t('resetLinkExpired'))}
      </p>
      <Button asChild variant="primary" className="mt-6 h-10 w-full max-shell:h-11">
        <Link href="/mot-de-passe-oublie">{t('requestNewLink')}</Link>
      </Button>
    </AuthSheet>
  );
}
