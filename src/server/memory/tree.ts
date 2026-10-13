import { isNull } from 'drizzle-orm';
import type { CardStatus } from '@/lib/enums';
import type { TenantContext } from '@/server/auth/tenant-context';
import { cards } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { type CardTypeRow, loadCatalog } from './catalog';

type TreeCard = { id: string; title: string; status: CardStatus };
export type TreeType = {
  slug: string;
  label: string;
  status: 'proposed' | 'validated';
  isBase: boolean;
  cardCount: number; // fiches de ce type, hors types enfants
  cards: TreeCard[];
  children: TreeType[];
};

const byFr = (a: string, b: string) => a.localeCompare(b, 'fr');

function typeNode(type: CardTypeRow, visibleCards: Array<TreeCard & { typeId: string }>): TreeType {
  const typeCards = visibleCards
    .filter((card) => card.typeId === type.id)
    .map(({ id, title, status }) => ({ id, title, status }))
    .sort((a, b) => byFr(a.title, b.title));
  return {
    slug: type.slug,
    label: type.label,
    status: type.status,
    isBase: type.isBase,
    cardCount: typeCards.length,
    cards: typeCards,
    children: [],
  };
}

// Arborescence des types visibles (le socle toujours, compteur 0 compris) et des fiches visibles
// non fusionnées. Un type dérivé a pour parent un type du socle (un seul niveau dans ce jet) ;
// sans parent visible du socle, il reste à la racine.
export async function listCardTree(ctx: TenantContext): Promise<TreeType[]> {
  const { types, visibleCards } = await withTenant(ctx, async (tx) => ({
    types: (await loadCatalog(tx)).types,
    visibleCards: await tx
      .select({ id: cards.id, title: cards.title, status: cards.status, typeId: cards.typeId })
      .from(cards)
      .where(isNull(cards.mergedInto)),
  }));
  const baseSlugs = new Set(types.filter((type) => type.isBase).map((type) => type.slug));
  const isChild = (type: CardTypeRow) =>
    !type.isBase && type.parentSlug !== null && baseSlugs.has(type.parentSlug);
  return types
    .filter((type) => !isChild(type))
    .map((type) => ({
      ...typeNode(type, visibleCards),
      children: type.isBase
        ? types
            .filter((child) => isChild(child) && child.parentSlug === type.slug)
            .map((child) => typeNode(child, visibleCards))
            .sort((a, b) => byFr(a.label, b.label))
        : [],
    }))
    .sort((a, b) => byFr(a.label, b.label));
}
