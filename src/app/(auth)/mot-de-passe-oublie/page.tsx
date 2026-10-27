import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { RequestPasswordResetForm } from '@/components/verre/auth/password-reset-form';
import { passwordResetEnabled } from '@/server/auth/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('forgotTitle') };
}

export default async function ForgotPasswordPage() {
  // Rendue à chaque requête : la page suit la configuration du serveur, pas celle du build.
  await connection();
  const t = await getTranslations('auth');
  return (
    <>
      <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{t('forgotTitle')}</h1>
      {passwordResetEnabled ? (
        <>
          <p className="mt-2 text-ui text-muted">{t('forgotIntro')}</p>
          <RequestPasswordResetForm />
        </>
      ) : (
        <p className="mt-2 text-ui text-muted">
          {t('emailNotSetUp')}{' '}
          <Link href="/connexion" className="text-accent underline underline-offset-4">
            {t('backToSignIn')}
          </Link>
        </p>
      )}
    </>
  );
}
