import { z } from 'zod';

// Deux files pg-boss : le tic (chaque minute) cherche les connexions dues, un job par connexion
// fait le passage. Le job ne porte que des identifiants, jamais la clé ni le moindre contenu.
export const CONNECTOR_QUEUES = { tick: 'connector-tick', sync: 'connector-sync' } as const;

// `userId` est le créateur de la connexion : la relève travaille sous ses droits.
export const ConnectorSyncJobSchema = z.object({
  connectionId: z.uuid(),
  tenantId: z.uuid(),
  userId: z.uuid(),
});
export type ConnectorSyncJob = z.infer<typeof ConnectorSyncJobSchema>;
