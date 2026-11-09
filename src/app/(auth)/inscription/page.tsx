import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { AuthForm } from '@/components/verre/auth/auth-form';
import { OtherSignIn, type SocialProvider } from '@/components/verre/auth/other-sign-in';
import { socialProviders } from '@/server/auth/auth';
import { anyVerifiedSso } from '@/server/auth/sso';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('createWorkspace') };
}

// Un compte créé par Google, Microsoft ou le SSO n'a pas encore d'espace : l'onboarding le lui fait créer.
export default async function SignUpPage() {
  await connection(); // les boutons suivent la configuration du serveur, pas celle du build
  return (
    <AuthForm
      page="inscription"
      alternatives={
        <OtherSignIn
          providers={Object.keys(socialProviders) as SocialProvider[]}
          sso={await anyVerifiedSso()}
        />
      }
    />
  );
}
