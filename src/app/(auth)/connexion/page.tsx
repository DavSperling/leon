import type { Metadata } from 'next';
import { connection } from 'next/server';
import { AuthForm } from '@/components/verre/auth/auth-form';
import { passwordResetEnabled } from '@/server/auth/auth';

export const metadata: Metadata = { title: 'Se connecter' };

export default async function SignInPage() {
  // Rendue à chaque requête : le lien suit la configuration du serveur, pas celle du build.
  await connection();
  return <AuthForm page="connexion" canResetPassword={passwordResetEnabled} />;
}
