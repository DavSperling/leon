import type { Metadata } from 'next';
import { AuthForm } from '@/components/verre/auth/auth-form';
import { serializeOAuthQuery } from '@/lib/oauth-query';

export const metadata: Metadata = { title: 'Créer un espace' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AuthForm page="inscription" oauthQuery={serializeOAuthQuery(await searchParams)} />;
}
