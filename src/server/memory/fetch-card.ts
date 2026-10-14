import { eq } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { cards, readLog } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { type CardData, loadCardData } from './card-data';
import { renderCard } from './render-card';

// D9 : la lecture porte l'ACL de la fiche au moment de la lecture.
async function logRead(tx: Tx, ctx: TenantContext, cardId: string, client: string): Promise<void> {
  const [card] = await tx.select({ acl: cards.acl }).from(cards).where(eq(cards.id, cardId));
  if (!card) throw new Error('fiche introuvable ou invisible');
  await tx
    .insert(readLog)
    .values({ tenantId: ctx.tenantId, userId: ctx.userId, client, cardId, acl: card.acl });
}

// Charge, rend et journalise dans une seule transaction ; fiche absente ou invisible → null.
export async function fetchCard(
  ctx: TenantContext,
  input: { id: string; section?: string; asOf?: Date; client: string },
): Promise<{ card: CardData; text: string } | null> {
  return withTenant(ctx, async (tx) => {
    const card = await loadCardData(tx, ctx, input.id, input);
    if (!card) return null;
    await logRead(tx, ctx, card.id, input.client);
    return { card, text: renderCard(card, { asOf: input.asOf }) };
  });
}
