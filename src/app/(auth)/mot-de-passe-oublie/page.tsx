import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { AuthSheet, AuthTitle } from '@/components/verre/auth/frame';
import { RequestPasswordResetForm } from '@/components/verre/auth/password-reset-form';
import { Button } from '@/components/verre/ui/button';
import { nb } from '@/lib/verre/nb';
import { emailEnabled } from '@/server/auth/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('forgotTitle') };
}

export default async function ForgotPasswordPage() {
  // Rendue à chaque requête : la page suit la configuration du serveur, pas celle du build.
  await connection();
  const t = await getTranslations('auth');
  if (emailEnabled) return <RequestPasswordResetForm />;
  // Leon n'envoie pas d'e-mail ici : la page le dit, et ramène à la connexion.
  return (
    <AuthSheet>
      <AuthTitle>{t('forgotTitle')}</AuthTitle>
      <p className="mt-3 text-title leading-[1.5] text-pretty text-fg">{nb(t('emailNotSetUp'))}</p>
      <Button asChild className="mt-6 h-10 w-full max-shell:h-11">
        <Link href="/connexion">{t('backToSignIn')}</Link>
      </Button>
    </AuthSheet>
  );
}
