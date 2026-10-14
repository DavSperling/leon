import { and, asc, eq } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { cardTypes, predicates } from '@/server/db/schema/memory';
import type { Tx } from '@/server/db/with-tenant';

export type CardTypeRow = {
  id: string;
  slug: string;
  label: string;
  parentSlug: string | null;
  status: 'proposed' | 'validated';
  isBase: boolean;
};
export type PredicateRow = { typeSlug: string; slug: string; label: string; singleValued: boolean };
export type Catalog = { types: CardTypeRow[]; predicates: PredicateRow[] };

const typeColumns = {
  id: cardTypes.id,
  slug: cardTypes.slug,
  label: cardTypes.label,
  parentSlug: cardTypes.parentSlug,
  status: cardTypes.status,
  tenantId: cardTypes.tenantId,
};

// Types visibles sous RLS : le socle et les types du tenant que l'acteur voit.
export async function loadCatalog(tx: Tx): Promise<Catalog> {
  const types = await tx.select(typeColumns).from(cardTypes).orderBy(asc(cardTypes.slug));
  const predicateRows = await tx
    .select({
      typeSlug: predicates.typeSlug,
      slug: predicates.slug,
      label: predicates.label,
      singleValued: predicates.singleValued,
    })
    .from(predicates)
    .orderBy(asc(predicates.typeSlug), asc(predicates.slug));
  return {
    types: types.map(({ tenantId, ...type }) => ({ ...type, isBase: tenantId === null })),
    predicates: predicateRows,
  };
}

// Un type dérivé hérite des prédicats de son parent (il n'en ajoute pas dans ce jet).
export function predicatesForType(catalog: Catalog, typeSlug: string): PredicateRow[] {
  const type = catalog.types.find((t) => t.slug === typeSlug);
  const ownerSlug = type?.parentSlug ?? typeSlug;
  return catalog.predicates.filter((p) => p.typeSlug === ownerSlug);
}

// acl = ACL effective de l'action (D13). Un slug déjà pris par un type invisible de l'acteur
// ne lève pas : l'insertion ne fait rien et la relecture sous RLS renvoie null.
export async function createProposedType(
  tx: Tx,
  ctx: TenantContext,
  input: { slug: string; label: string; parentSlug: string; acl: string[] },
): Promise<CardTypeRow | null> {
  await tx
    .insert(cardTypes)
    .values({ tenantId: ctx.tenantId, status: 'proposed', ...input })
    .onConflictDoNothing();
  const [type] = await tx
    .select(typeColumns)
    .from(cardTypes)
    .where(and(eq(cardTypes.tenantId, ctx.tenantId), eq(cardTypes.slug, input.slug)));
  return type ? { ...type, isBase: false } : null;
}
