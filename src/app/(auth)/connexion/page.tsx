import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { AuthForm } from '@/components/verre/auth/auth-form';
import { Notice } from '@/components/verre/ui/feedback';
import { emailEnabled } from '@/server/auth/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('signIn') };
}

// `?supprime=` : les actions de suppression (réglages/actions.ts) renvoient ici, la session déjà effacée.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ supprime?: string }>;
}) {
  // Rendue à chaque requête : le lien suit la configuration du serveur, pas celle du build.
  await connection();
  const { supprime } = await searchParams;
  const t = await getTranslations('deleteAccount');
  return (
    <>
      {(supprime === 'compte' || supprime === 'organisation') && (
        <Notice tone="success" live="status" className="mb-6">
          {t(supprime === 'compte' ? 'doneAccount' : 'doneOrganization')}
        </Notice>
      )}
      <AuthForm page="connexion" canResetPassword={emailEnabled} />
    </>
  );
}
