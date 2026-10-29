import type { Metadata } from 'next';
import { Documents } from '@/components/verre/documents';
import { canInvite } from '@/server/auth/members';
import { requireUserContext } from '@/server/auth/session';
import { listDocuments } from '@/server/documents/documents';

export const metadata: Metadata = { title: 'Documents' };

export default async function DocumentsPage() {
  const ctx = await requireUserContext();
  // canInvite : propriétaire ou administrateur, seuls à pouvoir retirer le document d'un ancien membre (0042).
  const [documents, admin] = await Promise.all([listDocuments(ctx), canInvite(ctx)]);
  return <Documents documents={documents} viewerId={ctx.userId} admin={admin} />;
}
