import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { joinWithSessionAction } from '@/app/(auth)/actions';
import { AuthForm } from '@/components/verre/auth/auth-form';
import { OtherSignIn, type SocialProvider } from '@/components/verre/auth/other-sign-in';
import { Button } from '@/components/verre/ui/button';
import { socialProviders } from '@/server/auth/auth';
import { findInvitation } from '@/server/auth/members';
import { getSession, getUserContext } from '@/server/auth/session';

// Le secret est dans l'adresse : elle ne part dans aucun en-tête Referer et la page n'est pas indexée.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return {
    title: t('joinWorkspaceMeta'),
    referrer: 'no-referrer',
    robots: { index: false, follow: false },
  };
}

type Params = Promise<{ token: string }>;

// Le lien d'invitation (Réglages, « Inviter ») : le formulaire d'inscription dans l'espace du lien, ou un message
// si le lien a servi, a expiré, ou si son auteur n'est plus administrateur.
export default async function InvitationPage({ params }: { params: Params }) {
  const { token } = await params;
  const invitation = await findInvitation(token);
  const t = await getTranslations('auth');
  if (invitation) {
    // Revenu de Google ou Microsoft sans espace : un clic sur le lien fait entrer ce compte-là.
    const session = await getSession();
    if (session && !(await getUserContext())) {
      return (
        <div className="fade-in">
          <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">
            {t('joinWorkspace')}
          </h1>
          <p className="mt-2 text-ui [overflow-wrap:anywhere] text-muted">
            {t('joinAs', { name: invitation.organizationName, email: session.user.email })}
          </p>
          <form action={joinWithSessionAction} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant="primary" size="lg" className="w-full">
              {t('joinWorkspace')}
            </Button>
          </form>
        </div>
      );
    }
    return (
      <AuthForm
        page="invitation"
        invitation={{ token, organizationName: invitation.organizationName }}
        alternatives={
          <OtherSignIn
            providers={Object.keys(socialProviders) as SocialProvider[]}
            sso={false}
            token={token}
          />
        }
      />
    );
  }

  return (
    <div className="fade-in">
      <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{t('expiredTitle')}</h1>
      <p className="mt-3 text-ui text-muted">{t('expiredText')}</p>
      <Button asChild variant="secondary" size="lg" className="mt-6 w-full">
        <Link href="/connexion">{t('signIn')}</Link>
      </Button>
    </div>
  );
}
