import { randomUUID } from 'node:crypto';
import { sources, turns } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { createTestTenant, seedCard, seedFact } from '@/test/fixtures';

// Un fait tiré d'un commentaire de David (auteur du tour) sur une source GitHub qu'Amos a branchée :
// le fait est écrit sous les droits d'Amos (le créateur de la connexion), mais il vient de David.
// `authorSide` dit, comme l'outil, si David est de l'équipe ou extérieur (absent : l'outil ne le dit pas).
export async function seedGithubFact(
  metadata: Record<string, unknown>,
  authorSide: 'team' | 'external' | null = null,
) {
  const { tenantId, members } = await createTestTenant(['Amos', 'David']);
  const [amos, david] = members;
  if (!amos || !david) throw new Error('membres non créés');
  const [source] = await adminDb
    .insert(sources)
    .values({
      tenantId,
      kind: 'github',
      externalId: randomUUID(),
      ownerUserId: amos.userId,
      title: 'Ticket 12',
      acl: [tenantId],
      metadata,
    })
    .returning({ id: sources.id });
  if (!source) throw new Error('source non créée');
  const [turn] = await adminDb
    .insert(turns)
    .values({
      tenantId,
      sourceId: source.id,
      externalId: 'comment:456',
      role: 'participant',
      text: 'On garde Postgres.',
      ts: new Date(),
      captureMode: 'connector',
      authorName: 'David',
      authorSide,
      acl: [tenantId],
    })
    .returning({ id: turns.id });
  if (!turn) throw new Error('tour non créé');
  const cardId = await seedCard(tenantId, { title: 'Leon', typeSlug: 'projet', acl: [tenantId] });
  const factId = await seedFact(tenantId, {
    cardId,
    sourceId: source.id,
    turnId: turn.id,
    authorId: amos.userId,
    predicate: 'note',
    statement: 'On garde Postgres.',
    acl: [tenantId],
    sourceKind: 'github',
  });
  return { tenantId, amos, david, cardId, factId, sourceId: source.id, turnId: turn.id };
}
