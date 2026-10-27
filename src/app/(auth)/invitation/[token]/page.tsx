import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthForm } from '@/components/verre/auth/auth-form';
import { Button } from '@/components/verre/ui/button';
import { findInvitation } from '@/server/auth/members';

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
  if (invitation) {
    return (
      <AuthForm
        page="invitation"
        invitation={{ token, organizationName: invitation.organizationName }}
      />
    );
  }

  const t = await getTranslations('auth');
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
