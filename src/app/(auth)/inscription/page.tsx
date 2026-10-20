import type { Metadata } from 'next';
import Link from 'next/link';
import { type AuthField, AuthForm } from '@/components/auth-form';
import { signUpAction } from '../actions';

export const metadata: Metadata = { title: 'Créer un espace' };

const FIELDS: AuthField[] = [
  { name: 'name', label: 'Nom', type: 'text', autoComplete: 'name' },
  { name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email' },
  {
    name: 'password',
    label: 'Mot de passe',
    type: 'password',
    autoComplete: 'new-password',
    hint: '8 caractères minimum.',
  },
  {
    name: 'organizationName',
    label: "Nom de l'entreprise",
    type: 'text',
    autoComplete: 'organization',
    hint: "Crée l'espace de votre équipe.",
  },
];

export default function SignUpPage() {
  return (
    <>
      <h1 className="mb-4 text-base font-medium">Créer un espace</h1>
      <AuthForm action={signUpAction} fields={FIELDS} submitLabel="Créer l'espace" />
      <p className="mt-4 text-[13px] leading-[18px] text-foreground-2">
        Déjà un compte ?{' '}
        <Link href="/connexion" className="text-primary underline underline-offset-2">
          Se connecter
        </Link>
      </p>
    </>
  );
}
