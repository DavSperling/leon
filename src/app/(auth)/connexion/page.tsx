import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { AuthForm } from '@/components/verre/auth/auth-form';
import { OtherSignIn, type SocialProvider } from '@/components/verre/auth/other-sign-in';
import { Notice } from '@/components/verre/ui/feedback';
import { emailEnabled, socialProviders } from '@/server/auth/auth';
import { authorizePath, parseAuthorizeParams } from '@/server/auth/computer-authorize';
import { anyVerifiedSso } from '@/server/auth/sso';
import { oauthReturnPath } from '@/server/oauth/authorize';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('signIn') };
}

// `?supprime=` : les actions de suppression (réglages/actions.ts) renvoient ici, la session déjà effacée.
// `?port=&etat=&empreinte=` : /ordinateur/autoriser, sans session. La connexion y revient, par un chemin rebâti à
// partir des trois paramètres validés (computer-authorize.ts) et non copié de l'adresse.
// `?response_type=&client_id=…` : /oauth/autoriser (un assistant), sans session ; même retour, rebâti à partir des
// huit paramètres connus (oauthReturnPath : la forme seulement, la page d'autorisation juge le reste).
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Rendue à chaque requête : le lien suit la configuration du serveur, pas celle du build.
  await connection();
  const query = await searchParams;
  const { supprime, error } = query;
  const authorization = parseAuthorizeParams(query);
  const returnTo = authorization
    ? authorizePath(authorization)
    : (oauthReturnPath(query) ?? undefined);
  const t = await getTranslations('deleteAccount');
  const a = await getTranslations('auth');
  return (
    <>
      {(supprime === 'compte' || supprime === 'organisation') && (
        <Notice tone="success" live="status" className="mb-6">
          {t(supprime === 'compte' ? 'doneAccount' : 'doneOrganization')}
        </Notice>
      )}
      {/* `?error=` : Better Auth revient ici quand Google, Microsoft ou le SSO n'a pas abouti. */}
      {typeof error === 'string' && (
        <Notice tone="error" live="alert" className="mb-6">
          {a(/not[_ ]linked/.test(error) ? 'socialNotLinked' : 'socialFailed')}
        </Notice>
      )}
      <AuthForm
        page="connexion"
        canResetPassword={emailEnabled}
        returnTo={returnTo}
        alternatives={
          <OtherSignIn
            providers={Object.keys(socialProviders) as SocialProvider[]}
            sso={await anyVerifiedSso()}
            returnTo={returnTo}
          />
        }
      />
    </>
  );
}
