import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { RequestPasswordResetForm } from '@/components/verre/auth/password-reset-form';
import { passwordResetEnabled } from '@/server/auth/auth';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

export default async function ForgotPasswordPage() {
  // Rendue à chaque requête : la page suit la configuration du serveur, pas celle du build.
  await connection();
  return (
    <>
      <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">Mot de passe oublié</h1>
      {passwordResetEnabled ? (
        <>
          <p className="mt-2 text-ui text-muted">
            Recevez un lien pour choisir un nouveau mot de passe.
          </p>
          <RequestPasswordResetForm />
        </>
      ) : (
        <p className="mt-2 text-ui text-muted">
          Leon n’envoie pas encore d’e-mails : demandez à l’administrateur de votre espace.{' '}
          <Link href="/connexion" className="text-accent underline underline-offset-4">
            Retour à la connexion
          </Link>
        </p>
      )}
    </>
  );
}
