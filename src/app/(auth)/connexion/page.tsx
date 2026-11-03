import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { AuthForm } from '@/components/verre/auth/auth-form';
import { Notice } from '@/components/verre/ui/feedback';
import { emailEnabled } from '@/server/auth/auth';
import { authorizePath, parseAuthorizeParams } from '@/server/auth/computer-authorize';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('signIn') };
}

// `?supprime=` : les actions de suppression (réglages/actions.ts) renvoient ici, la session déjà effacée.
// `?port=&etat=&empreinte=` : /ordinateur/autoriser, sans session. La connexion y revient, par un chemin rebâti à
// partir des trois paramètres validés (computer-authorize.ts) et non copié de l'adresse.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Rendue à chaque requête : le lien suit la configuration du serveur, pas celle du build.
  await connection();
  const query = await searchParams;
  const { supprime } = query;
  const authorization = parseAuthorizeParams(query);
  const t = await getTranslations('deleteAccount');
  return (
    <>
      {(supprime === 'compte' || supprime === 'organisation') && (
        <Notice tone="success" live="status" className="mb-6">
          {t(supprime === 'compte' ? 'doneAccount' : 'doneOrganization')}
        </Notice>
      )}
      <AuthForm
        page="connexion"
        canResetPassword={emailEnabled}
        returnTo={authorization ? authorizePath(authorization) : undefined}
      />
    </>
  );
}
