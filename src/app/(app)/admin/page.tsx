import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminDashboard } from '@/components/verre/admin';
import { adminStats, isAdmin } from '@/server/admin/stats';
import { getSession } from '@/server/auth/session';

const allowed = async () => {
  const session = await getSession();
  return Boolean(session && isAdmin(session.user.email));
};

// Le titre aussi : une page introuvable ne doit pas s'appeler « Admin » dans l'onglet.
export async function generateMetadata(): Promise<Metadata> {
  return (await allowed()) ? { title: 'Admin' } : {};
}

// Réservée aux e-mails de LEON_ADMINS ; les autres voient une page introuvable, pas un refus.
export default async function AdminPage() {
  if (!(await allowed())) notFound();
  return <AdminDashboard stats={await adminStats()} now={new Date()} />;
}
