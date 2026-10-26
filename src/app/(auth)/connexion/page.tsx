import type { Metadata } from 'next';
import { AuthForm } from '@/components/verre/auth/auth-form';
import { serializeOAuthQuery } from '@/lib/oauth-query';

export const metadata: Metadata = { title: 'Se connecter' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AuthForm page="connexion" oauthQuery={serializeOAuthQuery(await searchParams)} />;
}
