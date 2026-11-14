import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { AuthForm } from '@/components/verre/auth/auth-form';
import { AuthNote } from '@/components/verre/auth/frame';
import { OtherSignIn, type SocialProvider } from '@/components/verre/auth/other-sign-in';
import { emailEnabled, socialProviders } from '@/server/auth/auth';
import {
  authorizePath,
  MEMORY_RETURN_PATH,
  parseAuthorizeParams,
} from '@/server/auth/computer-authorize';
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
// `?retour=memoire` : la reconnexion de la section Mémoire (T55), qui y revient par une valeur fixe. La page ne
// redirige jamais une personne déjà connectée : une session de plus d'une heure se reconnecte ici.
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
    : (oauthReturnPath(query) ?? (query.retour === 'memoire' ? MEMORY_RETURN_PATH : undefined));
  const t = await getTranslations('deleteAccount');
  const a = await getTranslations('auth');
  // `?supprime=` : un compte ou une organisation vient d'être supprimé. `?error=` : Better Auth revient ici quand
  // Google, Microsoft ou le SSO n'a pas abouti.
  const notice =
    supprime === 'compte' || supprime === 'organisation' ? (
      <AuthNote tone="ok">{t(supprime === 'compte' ? 'doneAccount' : 'doneOrganization')}</AuthNote>
    ) : typeof error === 'string' ? (
      <AuthNote tone="error">
        {a(/not[_ ]linked/.test(error) ? 'socialNotLinked' : 'socialFailed')}
      </AuthNote>
    ) : undefined;
  return (
    <AuthForm
      page="connexion"
      canResetPassword={emailEnabled}
      returnTo={returnTo}
      notice={notice}
      alternatives={
        <OtherSignIn
          providers={Object.keys(socialProviders) as SocialProvider[]}
          sso={await anyVerifiedSso()}
          returnTo={returnTo}
        />
      }
    />
  );
}
