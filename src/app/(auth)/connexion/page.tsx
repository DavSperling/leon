import type { Metadata } from 'next';
import { AuthForm } from '@/components/verre/auth/auth-form';

export const metadata: Metadata = { title: 'Se connecter' };

export default function SignInPage() {
  return <AuthForm page="connexion" />;
}
