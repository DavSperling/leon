import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeMemberStep,
  completeOwnerStep,
  isSoleMember,
  type OnboardingMember,
  readOnboardingMember,
} from '@/server/auth/onboarding';
import { getSession, getUserContext } from '@/server/auth/session';
import { createOrganizationForUser } from '@/server/auth/sign-up';
import { resolveTenantContext } from '@/server/auth/tenant-context';
import { completeAboutStepAction } from './actions';

// sign-up.ts importe auth.ts, qui ouvrirait Better Auth sur la base : inutile ici.
vi.mock('@/server/auth/auth', () => ({ auth: { api: {} } }));
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), getUserContext: vi.fn() }));
vi.mock('@/server/auth/sign-up', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/auth/sign-up')>()),
  createOrganizationForUser: vi.fn(),
}));
// spaceRole reste réel : c'est lui qui décide, d'après le rôle, de ce que l'action a le droit d'écrire.
vi.mock('@/server/auth/onboarding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/auth/onboarding')>()),
  readOnboardingMember: vi.fn(),
  completeOwnerStep: vi.fn(),
  completeMemberStep: vi.fn(),
  isSoleMember: vi.fn(),
}));
vi.mock('@/server/auth/tenant-context', () => ({ resolveTenantContext: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const ctx = { userId: USER_ID, tenantId: TENANT_ID, principals: [USER_ID, TENANT_ID] };

const member = (over: Partial<OnboardingMember> = {}): OnboardingMember => ({
  role: 'owner',
  department: null,
  job: null,
  seniority: null,
  goals: [],
  onboardedAt: null,
  ...over,
});

// Chaque attente est un `goals` de plus dans le formulaire (formData.getAll côté action).
const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of [value].flat()) data.append(key, item);
  }
  return data;
};

const validOwner = {
  department: 'engineering',
  job: 'backend',
  seniority: '5',
  size: '11-50',
  goals: ['find', 'briefing'],
};
const run = (fields: Record<string, string | string[]>) =>
  completeAboutStepAction({}, form(fields));

// `rejects.toThrow('NEXT_REDIRECT /')` passerait aussi pour '/bienvenue/outils' : on compare le chemin entier.
const redirectsTo = async (result: Promise<unknown>, path: string) => {
  await expect(result).rejects.toThrow('NEXT_REDIRECT');
  expect(redirect).toHaveBeenLastCalledWith(path);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ user: { id: USER_ID } } as never);
  vi.mocked(getUserContext).mockResolvedValue(ctx);
  vi.mocked(readOnboardingMember).mockResolvedValue(member());
  vi.mocked(completeOwnerStep).mockResolvedValue(true);
  vi.mocked(completeMemberStep).mockResolvedValue(true);
  vi.mocked(isSoleMember).mockResolvedValue(false);
});

describe('completeAboutStepAction', () => {
  it('sans session, renvoie vers la connexion', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(run(validOwner)).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(getUserContext).not.toHaveBeenCalled();
    expect(createOrganizationForUser).not.toHaveBeenCalled();
    expect(completeOwnerStep).not.toHaveBeenCalled();
    expect(completeMemberStep).not.toHaveBeenCalled();
  });

  describe('propriétaire', () => {
    it("enregistre service, poste, niveau, taille et attentes, puis ouvre l'appli", async () => {
      await redirectsTo(run(validOwner), '/');

      expect(completeOwnerStep).toHaveBeenCalledWith(ctx, {
        department: 'engineering',
        job: 'backend',
        seniority: 5,
        size: '11-50',
        goals: ['find', 'briefing'],
      });
    });

    it("seul dans l'espace : l'étape Vos outils suit", async () => {
      vi.mocked(isSoleMember).mockResolvedValue(true);

      await redirectsTo(run(validOwner), '/bienvenue/outils');

      expect(isSoleMember).toHaveBeenCalledWith(ctx);
      expect(completeOwnerStep).toHaveBeenCalled();
    });

    it("avec une équipe déjà là : l'appli", async () => {
      vi.mocked(isSoleMember).mockResolvedValue(false);

      await redirectsTo(run(validOwner), '/');

      expect(isSoleMember).toHaveBeenCalledWith(ctx);
    });

    it('accepte un poste « other » et aucune attente', async () => {
      await redirectsTo(run({ ...validOwner, job: 'other', goals: [] }), '/');

      expect(completeOwnerStep).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({ job: 'other', goals: [] }),
      );
    });

    it('ne garde qu’une fois une attente répétée', async () => {
      await redirectsTo(run({ ...validOwner, goals: ['find', 'find', 'team'] }), '/');

      expect(completeOwnerStep).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({ goals: ['find', 'team'] }),
      );
    });

    it("refuse un poste qui n'appartient pas au service", async () => {
      const state = await run({ ...validOwner, department: 'sales', job: 'backend' });

      expect(state.errors).toEqual({ job: 'job' });
      expect(completeOwnerStep).not.toHaveBeenCalled();
    });

    it.each(['0', '9', '5.5', 'abc', ''])(
      'refuse un niveau hors de 1 à 8 (%j)',
      async (seniority) => {
        const state = await run({ ...validOwner, seniority });

        expect(state.errors).toEqual({ seniority: 'seniority' });
        expect(completeOwnerStep).not.toHaveBeenCalled();
      },
    );

    it.each(['toString', '__proto__', 'Engineering', ''])(
      'refuse un service inconnu (%j)',
      async (department) => {
        const state = await run({ ...validOwner, department });

        expect(state.errors?.department).toBe('department');
        expect(completeOwnerStep).not.toHaveBeenCalled();
      },
    );

    it('refuse une taille inconnue', async () => {
      const state = await run({ ...validOwner, size: '12-49' });

      expect(state.errors).toEqual({ size: 'size' });
      expect(completeOwnerStep).not.toHaveBeenCalled();
    });

    it('refuse une attente inconnue, sans champ à signaler', async () => {
      const state = await run({ ...validOwner, goals: ['find', 'world-domination'] });

      expect(state.errors).toEqual({ form: 'form' });
      expect(completeOwnerStep).not.toHaveBeenCalled();
    });

    it('signale chaque champ faux à la fois', async () => {
      const state = await run({
        department: 'sales',
        job: 'backend',
        seniority: '9',
        size: '3',
        goals: ['find'],
      });

      expect(state.errors).toEqual({ job: 'job', seniority: 'seniority', size: 'size' });
      expect(completeOwnerStep).not.toHaveBeenCalled();
    });

    it("avec une équipe, l'étape validée entre-temps ailleurs mène quand même à l'appli", async () => {
      vi.mocked(completeOwnerStep).mockResolvedValue(false);
      vi.mocked(isSoleMember).mockResolvedValue(false);

      await redirectsTo(run(validOwner), '/');
    });

    it("seul, l'étape validée entre-temps ailleurs mène quand même à l'étape Vos outils", async () => {
      vi.mocked(completeOwnerStep).mockResolvedValue(false);
      vi.mocked(isSoleMember).mockResolvedValue(true);

      await redirectsTo(run(validOwner), '/bienvenue/outils');
    });
  });

  describe('autres rôles', () => {
    it.each(['member', 'admin'])(
      "%s : n'enregistre que les attentes, même si le formulaire envoie un poste, puis l'étape Vos outils",
      async (role) => {
        vi.mocked(readOnboardingMember).mockResolvedValue(member({ role }));

        await redirectsTo(
          run({
            ...validOwner,
            department: 'sales',
            job: 'sdr',
            seniority: '8',
            goals: ['meetings'],
          }),
          '/bienvenue/outils',
        );

        expect(completeMemberStep).toHaveBeenCalledWith(ctx, ['meetings']);
        expect(completeOwnerStep).not.toHaveBeenCalled();
        expect(isSoleMember).not.toHaveBeenCalled();
      },
    );

    it("ne lit pas les champs du propriétaire : un service inconnu n'empêche pas un membre", async () => {
      vi.mocked(readOnboardingMember).mockResolvedValue(member({ role: 'member' }));

      await redirectsTo(
        run({ department: 'toString', job: 'x', seniority: '99', goals: ['team'] }),
        '/bienvenue/outils',
      );

      expect(completeMemberStep).toHaveBeenCalledWith(ctx, ['team']);
    });

    it('accepte des rôles multiples sans propriétaire (« member,admin »)', async () => {
      vi.mocked(readOnboardingMember).mockResolvedValue(member({ role: 'member,admin' }));

      await redirectsTo(run({ ...validOwner, goals: ['find'] }), '/bienvenue/outils');

      expect(completeMemberStep).toHaveBeenCalledWith(ctx, ['find']);
      expect(completeOwnerStep).not.toHaveBeenCalled();
    });

    it('refuse une attente inconnue', async () => {
      vi.mocked(readOnboardingMember).mockResolvedValue(member({ role: 'member' }));

      const state = await run({ goals: ['find', 'nope'] });

      expect(state.errors).toEqual({ form: 'form' });
      expect(completeMemberStep).not.toHaveBeenCalled();
    });
  });

  describe('étape déjà validée ou membre introuvable', () => {
    it("ouvre l'appli sans rien réécrire", async () => {
      vi.mocked(readOnboardingMember).mockResolvedValue(member({ onboardedAt: new Date() }));
      vi.mocked(isSoleMember).mockResolvedValue(true);

      await redirectsTo(run(validOwner), '/');

      expect(isSoleMember).not.toHaveBeenCalled();
      expect(completeOwnerStep).not.toHaveBeenCalled();
      expect(completeMemberStep).not.toHaveBeenCalled();
    });

    it("ouvre l'appli sans rien réécrire pour un membre non plus", async () => {
      vi.mocked(readOnboardingMember).mockResolvedValue(
        member({ role: 'member', onboardedAt: new Date() }),
      );

      await redirectsTo(run({ goals: ['find'] }), '/');

      expect(completeMemberStep).not.toHaveBeenCalled();
    });

    it("rend une erreur si l'appartenance n'est pas trouvée", async () => {
      vi.mocked(readOnboardingMember).mockResolvedValue(null);

      const state = await run(validOwner);

      expect(state.errors).toEqual({ form: 'form' });
      expect(completeOwnerStep).not.toHaveBeenCalled();
      expect(completeMemberStep).not.toHaveBeenCalled();
    });
  });

  describe('nouveau venu', () => {
    const newcomer = { ...validOwner, organizationName: 'Acme' };

    beforeEach(() => {
      vi.mocked(getUserContext).mockResolvedValueOnce(null);
    });

    it("crée l'organisation, puis enregistre l'étape du propriétaire", async () => {
      vi.mocked(createOrganizationForUser).mockResolvedValue({ ok: true, tenantId: TENANT_ID });
      vi.mocked(resolveTenantContext).mockResolvedValue(ctx);

      await redirectsTo(run(newcomer), '/');

      expect(createOrganizationForUser).toHaveBeenCalledWith(USER_ID, 'Acme');
      expect(resolveTenantContext).toHaveBeenCalledWith(USER_ID, TENANT_ID);
      expect(readOnboardingMember).toHaveBeenCalledWith(ctx);
      expect(completeOwnerStep).toHaveBeenCalledWith(ctx, {
        department: 'engineering',
        job: 'backend',
        seniority: 5,
        size: '11-50',
        goals: ['find', 'briefing'],
      });
    });

    it("l'espace créé, l'étape Vos outils suit", async () => {
      vi.mocked(createOrganizationForUser).mockResolvedValue({ ok: true, tenantId: TENANT_ID });
      vi.mocked(resolveTenantContext).mockResolvedValue(ctx);
      vi.mocked(isSoleMember).mockResolvedValue(true);

      await redirectsTo(run(newcomer), '/bienvenue/outils');

      expect(isSoleMember).toHaveBeenCalledWith(ctx);
    });

    it("un double clic poursuit avec l'espace déjà créé", async () => {
      vi.mocked(createOrganizationForUser).mockResolvedValue({ ok: false, error: 'deja_membre' });
      vi.mocked(getUserContext).mockResolvedValueOnce(ctx);

      await redirectsTo(run(newcomer), '/');

      expect(resolveTenantContext).not.toHaveBeenCalled();
      expect(completeOwnerStep).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({ job: 'backend' }),
      );
    });

    it('« déjà membre » sans espace retrouvé rend une erreur, sans rien écrire', async () => {
      vi.mocked(createOrganizationForUser).mockResolvedValue({ ok: false, error: 'deja_membre' });
      vi.mocked(getUserContext).mockResolvedValueOnce(null);

      const state = await run(newcomer);

      expect(state.errors).toEqual({ form: 'form' });
      expect(completeOwnerStep).not.toHaveBeenCalled();
    });

    it('une création refusée rend une erreur, sans rien écrire', async () => {
      vi.mocked(createOrganizationForUser).mockResolvedValue({ ok: false, error: 'invalide' });

      const state = await run(newcomer);

      expect(state.errors).toEqual({ form: 'form' });
      expect(completeOwnerStep).not.toHaveBeenCalled();
    });

    it('une organisation créée mais introuvable rend une erreur, sans rien écrire', async () => {
      vi.mocked(createOrganizationForUser).mockResolvedValue({ ok: true, tenantId: TENANT_ID });
      vi.mocked(resolveTenantContext).mockResolvedValue(null);

      const state = await run(newcomer);

      expect(state.errors).toEqual({ form: 'form' });
      expect(completeOwnerStep).not.toHaveBeenCalled();
    });

    it("un nom d'entreprise trop court ne crée rien", async () => {
      const state = await run({ ...newcomer, organizationName: 'A' });

      expect(state.errors).toEqual({ organizationName: 'company' });
      expect(createOrganizationForUser).not.toHaveBeenCalled();
      expect(completeOwnerStep).not.toHaveBeenCalled();
    });

    it('un formulaire du propriétaire invalide ne crée rien non plus', async () => {
      const state = await run({ ...newcomer, department: 'sales' });

      expect(state.errors).toEqual({ job: 'job' });
      expect(createOrganizationForUser).not.toHaveBeenCalled();
    });

    it('signale ensemble le nom et les champs faux', async () => {
      const state = await run({ ...newcomer, organizationName: ' ', size: 'x' });

      expect(state.errors).toEqual({ organizationName: 'company', size: 'size' });
      expect(createOrganizationForUser).not.toHaveBeenCalled();
    });
  });
});
