import { describe, expect, it } from 'vitest';
import { seedTasksScenario } from '@/test/tasks-scenario';
import { assertMember, findMemberByEmail, listMembers } from './members';

describe('listMembers', () => {
  it('liste les membres de l’organisation, par nom, avec initiales et prénom', async () => {
    const { paul, marie, zoe } = await seedTasksScenario();

    const members = await listMembers(paul);

    expect(members).toEqual([
      {
        id: marie.userId,
        name: 'Marie Durand',
        email: expect.stringMatching(/@test\.leon$/),
        initials: 'MD',
        firstName: 'Marie',
      },
      {
        id: paul.userId,
        name: 'Paul Martin',
        email: expect.stringMatching(/@test\.leon$/),
        initials: 'PM',
        firstName: 'Paul',
      },
    ]);
    expect((await listMembers(zoe)).map((m) => m.id)).toEqual([zoe.userId]);
  });
});

describe('findMemberByEmail', () => {
  it('trouve un membre par son e-mail, sans tenir compte de la casse ni des espaces', async () => {
    const { paul, marie } = await seedTasksScenario();
    const email = (await listMembers(paul)).find((m) => m.id === marie.userId)?.email as string;

    const found = await findMemberByEmail(paul, `  ${email.toUpperCase()} `);

    expect(found).toMatchObject({ id: marie.userId, name: 'Marie Durand' });
  });

  it("rend le même résultat nul pour un e-mail inconnu et pour celui d'un autre organisation", async () => {
    const { paul, zoe } = await seedTasksScenario();
    const zoeEmail = (await listMembers(zoe))[0]?.email as string;

    expect(await findMemberByEmail(paul, zoeEmail)).toBeNull();
    expect(await findMemberByEmail(paul, 'personne@test.leon')).toBeNull();
    expect(await findMemberByEmail(zoe, zoeEmail)).toMatchObject({ id: zoe.userId });
  });
});

describe('assertMember', () => {
  it('accepte un membre, l’absence de valeur et null', async () => {
    const { paul, marie } = await seedTasksScenario();

    await expect(assertMember(paul, marie.userId)).resolves.toBeUndefined();
    await expect(assertMember(paul, null)).resolves.toBeUndefined();
    await expect(assertMember(paul, undefined)).resolves.toBeUndefined();
  });

  it("refuse l'utilisateur d'une autre organisation", async () => {
    const { paul, zoe } = await seedTasksScenario();

    await expect(assertMember(paul, zoe.userId)).rejects.toMatchObject({
      code: 'not_found',
      message: 'Membre introuvable.',
    });
  });
});
