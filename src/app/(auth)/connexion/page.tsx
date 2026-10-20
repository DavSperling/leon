import type { Metadata } from 'next';
import Link from 'next/link';
import { type AuthField, AuthForm } from '@/components/auth-form';
import { signInAction } from '../actions';

export const metadata: Metadata = { title: 'Se connecter' };

const FIELDS: AuthField[] = [
  { name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email' },
  { name: 'password', label: 'Mot de passe', type: 'password', autoComplete: 'current-password' },
];

export default function SignInPage() {
  return (
    <>
      <h1 className="mb-4 text-base font-medium">Se connecter</h1>
      <AuthForm action={signInAction} fields={FIELDS} submitLabel="Se connecter" />
      <p className="mt-4 text-[13px] leading-[18px] text-foreground-2">
        Pas encore de compte ?{' '}
        <Link href="/inscription" className="text-primary underline underline-offset-2">
          Créer un espace
        </Link>
      </p>
    </>
  );
}
