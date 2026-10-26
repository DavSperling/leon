import type { Metadata } from 'next';
import { Documents } from '@/components/verre/documents';
import { requireUserContext } from '@/server/auth/session';
import { listDocuments } from '@/server/documents/documents';

export const metadata: Metadata = { title: 'Documents' };

export default async function DocumentsPage() {
  const ctx = await requireUserContext();
  const documents = await listDocuments(ctx);
  return <Documents documents={documents} viewerId={ctx.userId} />;
}
