import type { Metadata } from 'next';
import { AuthForm } from '@/components/verre/auth/auth-form';

export const metadata: Metadata = { title: 'Créer un espace' };

export default function SignUpPage() {
  return <AuthForm page="inscription" />;
}
