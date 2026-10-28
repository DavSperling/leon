import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminDashboard } from '@/components/verre/admin';
import { adminStats, isAdmin } from '@/server/admin/stats';
import { getSession } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Admin' };

// Réservée aux e-mails de LEON_ADMINS ; les autres voient une page introuvable, pas un refus.
export default async function AdminPage() {
  const session = await getSession();
  if (!session || !isAdmin(session.user.email)) notFound();
  return <AdminDashboard stats={await adminStats()} now={new Date()} />;
}
