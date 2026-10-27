import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ResetPasswordForm } from '@/components/verre/auth/password-reset-form';

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
  const t = await getTranslations('auth');
  return (
    <>
      <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{t('newPassword')}</h1>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="mt-3 text-ui text-muted">
          {t('resetLinkExpired')}{' '}
          <Link href="/mot-de-passe-oublie" className="text-accent underline underline-offset-4">
            {t('requestNewLink')}
          </Link>
          .
        </p>
      )}
    </>
  );
}
