import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { factCandidates, ingestRuns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb } from '@/test/db';
import { seedCard, seedFact } from '@/test/fixtures';
import { type RightsScenario, seedRightsScenario } from '@/test/rights-scenario';
import { buildPlacementContext, type FactCandidateRow } from './context';

type Subject = { name: string; email: string | null; domain: string | null };

// Un candidat `pending` de l'acteur, dans un run qui lui est propre.
async function seedCandidate(
  ctx: TenantContext,
  source: { sourceId: string; turnId: string },
  input: { subject: Subject; predicate: string; typeHint?: string },
): Promise<FactCandidateRow> {
  const acl = [ctx.userId];
  const [run] = await adminDb
    .insert(ingestRuns)
    .values({ tenantId: ctx.tenantId, sourceId: source.sourceId, turnIds: [source.turnId], acl })
    .returning({ id: ingestRuns.id });
  if (!run) throw new Error('run de test non créé');
  const [candidate] = await adminDb
    .insert(factCandidates)
    .values({
      tenantId: ctx.tenantId,
      ingestRunId: run.id,
      turnId: source.turnId,
      statement: `Fait de test sur ${input.subject.name}.`,
      predicate: input.predicate,
      typeHint: input.typeHint ?? 'client',
      mentions: { subject: input.subject, others: [] },
      quote: 'Tour de test.',
      validFrom: new Date('2026-10-13T00:00:00.000Z'),
      confidence: 0.9,
      sensitivity: 'shareable',
      factAcl: [ctx.tenantId],
      acl,
    })
    .returning();
  if (!candidate) throw new Error('candidat de test non créé');
  return candidate;
}

const subject = (name: string, domain: string | null = null): Subject => ({
  name,
  email: null,
  domain,
});

const paulSource = (s: RightsScenario) => ({ sourceId: s.ids.paulSource, turnId: s.ids.paulTurn });
const marieSource = (s: RightsScenario) => ({
  sourceId: s.ids.marieSource,
  turnId: s.ids.marieTurn,
});

describe('buildPlacementContext', () => {
  it('propose la fiche Orion à Paul', async () => {
    const s = await seedRightsScenario();
    const row = await seedCandidate(s.paul, paulSource(s), {
      subject: subject('Orion'),
      predicate: 'echeance',
      typeHint: 'projet',
    });

    const context = await withTenant(s.paul, (tx) => buildPlacementContext(tx, [row]));

    const [candidate] = context.candidates;
    expect(candidate?.candidateId).toBe(row.id);
    expect(candidate?.fixedCardId).toBeNull();
    expect(candidate?.cardOptions.map((o) => o.id)).toContain(s.ids.orionCard);
    expect(candidate?.cardOptions.find((o) => o.id === s.ids.orionCard)).toMatchObject({
      title: 'Orion',
      typeSlug: 'projet',
      status: 'confirmed',
      aliases: ['orion'],
    });
  });

  it('ne propose jamais Orion à Marie', async () => {
    const s = await seedRightsScenario();
    const row = await seedCandidate(s.marie, marieSource(s), {
      subject: subject('Orion'),
      predicate: 'echeance',
      typeHint: 'projet',
    });

    const context = await withTenant(s.marie, (tx) => buildPlacementContext(tx, [row]));

    expect(context.candidates[0]?.cardOptions).toEqual([]);
    expect(context.catalog.types.map((t) => t.slug)).not.toContain('chantier');
  });

  it('impose la fiche ACME sur la clé dure acme.fr', async () => {
    const s = await seedRightsScenario();
    const row = await seedCandidate(s.marie, marieSource(s), {
      subject: subject('Société Anonyme des Comptoirs', 'ACME.fr'),
      predicate: 'paiement',
    });

    const context = await withTenant(s.marie, (tx) => buildPlacementContext(tx, [row]));

    const [candidate] = context.candidates;
    expect(candidate?.fixedCardId).toBe(s.ids.acmeCard);
    expect(candidate?.cardOptions[0]).toMatchObject({
      id: s.ids.acmeCard,
      title: 'ACME',
      aliases: ['acme.fr'],
    });
  });

  it("donne les faits actifs d'équipe de toute la fiche, quel que soit leur prédicat", async () => {
    const s = await seedRightsScenario();
    const contact = { cardId: s.ids.acmeCard, predicate: 'contact', ...paulSource(s) } as const;
    const teamFact = await seedFact(s.tenantId, {
      ...contact,
      authorId: s.paul.userId,
      statement: 'Le contact ACME est Jeanne.',
      acl: [s.tenantId],
    });
    await seedFact(s.tenantId, {
      ...contact,
      authorId: s.paul.userId,
      statement: 'Le contact privé ACME est Hugo.',
      acl: [s.paul.userId],
    });
    await seedFact(s.tenantId, {
      ...contact,
      authorId: s.paul.userId,
      statement: 'Ancien contact ACME.',
      status: 'superseded',
      acl: [s.tenantId],
    });
    const noteFact = await seedFact(s.tenantId, {
      ...contact,
      predicate: 'note',
      authorId: s.paul.userId,
      statement: 'ACME est un client historique.',
      acl: [s.tenantId],
    });
    const row = await seedCandidate(s.paul, paulSource(s), {
      subject: subject('ACME', 'acme.fr'),
      predicate: 'contact',
    });

    const context = await withTenant(s.paul, (tx) => buildPlacementContext(tx, [row]));

    const acme = context.candidates[0]?.cardOptions.find((o) => o.id === s.ids.acmeCard);
    const statements = acme?.activeFacts.map((fact) => [fact.id, fact.predicate, fact.statement]);
    expect(statements).toEqual(
      expect.arrayContaining([
        [teamFact, 'contact', 'Le contact ACME est Jeanne.'],
        [noteFact, 'note', 'ACME est un client historique.'],
      ]),
    );
    expect(acme?.activeFacts.map((fact) => fact.statement)).not.toContain(
      'Le contact privé ACME est Hugo.',
    );
    expect(acme?.activeFacts.map((fact) => fact.statement)).not.toContain('Ancien contact ACME.');
    // Faits du scénario hors contradiction : aucun fait privé de Paul (« zanzibar ») n'y figure.
    expect(JSON.stringify(acme?.activeFacts)).not.toContain('zanzibar');
  });

  it("n'expose pas un fait actif privé de Paul (Orion, D14)", async () => {
    const s = await seedRightsScenario();
    const row = await seedCandidate(s.paul, paulSource(s), {
      subject: subject('Orion'),
      predicate: 'echeance',
      typeHint: 'projet',
    });

    const context = await withTenant(s.paul, (tx) => buildPlacementContext(tx, [row]));

    const orion = context.candidates[0]?.cardOptions.find((o) => o.id === s.ids.orionCard);
    expect(orion?.activeFacts).toEqual([]);
  });

  it('propose au plus 5 fiches par candidat', async () => {
    const s = await seedRightsScenario();
    for (let n = 1; n <= 7; n++) {
      await seedCard(s.tenantId, {
        title: `Atelier Nord ${n}`,
        typeSlug: 'client',
        acl: [s.tenantId],
        createdBy: s.paul.userId,
      });
    }
    const row = await seedCandidate(s.paul, paulSource(s), {
      subject: subject('Atelier Nord'),
      predicate: 'note',
    });

    const context = await withTenant(s.paul, (tx) => buildPlacementContext(tx, [row]));

    expect(context.candidates[0]?.cardOptions).toHaveLength(5);
  });

  it('recopie le candidat et le catalogue visible', async () => {
    const s = await seedRightsScenario();
    const row = await seedCandidate(s.paul, paulSource(s), {
      subject: { name: 'ACME', email: 'Compta@ACME.fr', domain: null },
      predicate: 'paiement',
    });

    const context = await withTenant(s.paul, (tx) => buildPlacementContext(tx, [row]));

    expect(context.catalog.types.map((t) => t.slug)).toContain('chantier');
    expect(context.candidates[0]).toMatchObject({
      statement: 'Fait de test sur ACME.',
      predicate: 'paiement',
      typeHint: 'client',
      value: null,
      subject: { name: 'ACME', email: 'Compta@ACME.fr', domain: null },
      quote: 'Tour de test.',
      validFrom: '2026-10-13T00:00:00.000Z',
      sensitive: false,
    });
  });
});
