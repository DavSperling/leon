import { describe, expect, it } from 'vitest';
import { adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';

// Migration 0075 : les destinataires d'un courrier sur son tour, deux listes d'adresses vides par défaut et bornées.

type Recipients = { recipients_to: string[]; recipients_cc: string[] };

// Insère un tour dans une session de test, avec ou sans ses destinataires, le relit, puis annule.
async function insertTurn(recipients?: Recipients): Promise<Recipients | undefined> {
  const {
    members: [paul],
  } = await createTestTenant(['Paul']);
  if (!paul) throw new Error('membre de test manquant');
  const { sourceId } = await seedSource(paul);
  const base = [paul.tenantId, sourceId, paul.userId];
  const client = await adminPool.connect();
  try {
    await client.query('begin');
    const { rows } = recipients
      ? await client.query<Recipients>(
          `insert into turns (tenant_id, source_id, external_id, role, text, ts, capture_mode, acl,
                              recipients_to, recipients_cc)
           values ($1, $2, gen_random_uuid()::text, 'participant', 'Tour de test.', now(), 'connector',
                   array[$3::uuid], $4, $5)
           returning recipients_to, recipients_cc`,
          [...base, recipients.recipients_to, recipients.recipients_cc],
        )
      : await client.query<Recipients>(
          `insert into turns (tenant_id, source_id, external_id, role, text, ts, capture_mode, acl)
           values ($1, $2, gen_random_uuid()::text, 'user', 'Tour de test.', now(), 'file', array[$3::uuid])
           returning recipients_to, recipients_cc`,
          base,
        );
    return rows[0];
  } finally {
    await client.query('rollback');
    client.release();
  }
}

const addresses = (count: number, length = 16) =>
  Array.from({ length: count }, (_, index) => `${index}@`.padEnd(length, 'a'));

describe('turns.recipients_to et turns.recipients_cc', () => {
  // Les chemins qui n'en parlent pas (capture, import, tests) continuent d'écrire leurs tours.
  it('sont vides pour un tour écrit sans elles', async () => {
    await expect(insertTurn()).resolves.toEqual({ recipients_to: [], recipients_cc: [] });
  });

  it('gardent les adresses écrites, dans l’ordre', async () => {
    const written = { recipients_to: ['julie@acme.test', 'paul@client.test'], recipients_cc: [] };
    await expect(insertTurn(written)).resolves.toEqual(written);
  });

  it('acceptent 100 adresses et 32 000 caractères par liste, pas plus', async () => {
    const full = addresses(100, 320);
    await expect(insertTurn({ recipients_to: full, recipients_cc: full })).resolves.toBeDefined();
    for (const tooMuch of [addresses(101), addresses(100, 321)]) {
      await expect(insertTurn({ recipients_to: tooMuch, recipients_cc: [] })).rejects.toThrow(
        /turns_recipients_check/,
      );
      await expect(insertTurn({ recipients_to: [], recipients_cc: tooMuch })).rejects.toThrow(
        /turns_recipients_check/,
      );
    }
  });
});
