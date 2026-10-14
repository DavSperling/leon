import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from './client';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Des UUID seulement : le littéral de tableau passé à app.principals ne peut rien contenir d'autre.
const TenantContextSchema = z.object({
  tenantId: z.uuid(),
  userId: z.uuid(),
  principals: z.array(z.uuid()).min(1),
});

// Ouvre une transaction, pose app.tenant et app.principals (set_config(…, true) = SET LOCAL), exécute fn.
// Le contexte disparaît avec la transaction : la connexion rendue au pool n'en garde rien.
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const valid = TenantContextSchema.parse(ctx);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant', ${valid.tenantId}, true),
                                set_config('app.principals', ${`{${valid.principals.join(',')}}`}, true)`);
    return fn(tx);
  });
}
