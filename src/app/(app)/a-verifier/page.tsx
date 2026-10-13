import type { Metadata } from 'next';
import { ReviewList } from '@/components/review-list';
import { requireUserContext } from '@/server/auth/session';
import { listReviewItems } from '@/server/memory/review-list';

export const metadata: Metadata = { title: 'À vérifier' };

export default async function ReviewPage() {
  const ctx = await requireUserContext();
  const [open, resolved] = await Promise.all([
    listReviewItems(ctx, { status: 'open' }),
    listReviewItems(ctx, { status: 'resolved' }),
  ]);
  return <ReviewList open={open} resolved={resolved} />;
}
