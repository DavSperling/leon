import type { Metadata } from 'next';
import { RequestPasswordResetForm } from '@/components/verre/auth/password-reset-form';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

export default function ForgotPasswordPage() {
  return <><h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">Mot de passe oublié</h1><p className="mt-2 text-ui text-muted">Recevez un lien pour choisir un nouveau mot de passe.</p><RequestPasswordResetForm /></>;
}
