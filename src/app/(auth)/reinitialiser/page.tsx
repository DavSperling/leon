import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/verre/auth/password-reset-form';

export const metadata: Metadata = { title: 'Réinitialiser le mot de passe' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token } = await searchParams;
  return <><h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">Nouveau mot de passe</h1>{token ? <ResetPasswordForm token={token} /> : <p className="mt-3 text-ui text-muted">Ce lien est invalide ou a expiré. <a href="/mot-de-passe-oublie" className="text-accent underline underline-offset-4">Demander un nouveau lien</a>.</p>}</>;
}
