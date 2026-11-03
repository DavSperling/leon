import { describe, expect, it } from 'vitest';
import { PROVIDER_IDS } from '@/capture/turn';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import {
  DEPARTMENT_IDS,
  DEPARTMENTS,
  departmentLabelKey,
  GOALS,
  isDepartment,
  isJobOf,
  jobLabelKey,
  onboardingSteps,
  SENIORITY_LEVELS,
  seniorityId,
} from './onboarding';

describe('les listes de l’onboarding', () => {
  it('chaque service a au moins un poste, et « other » en dernier', () => {
    for (const id of DEPARTMENT_IDS) expect(DEPARTMENTS[id].jobs.at(-1)).toBe('other');
  });

  it('ne propose que des outils branchables', () => {
    for (const id of DEPARTMENT_IDS)
      for (const tool of DEPARTMENTS[id].tools)
        expect(PROVIDER_IDS, `${id}.${tool}`).toContain(tool);
  });

  it('reconnaît un poste du service et refuse celui d’un autre service', () => {
    expect(isJobOf('engineering', 'backend')).toBe(true);
    expect(isJobOf('sales', 'backend')).toBe(false);
    expect(isDepartment('engineering')).toBe(true);
    expect(isDepartment('toString')).toBe(false);
  });

  it('donne le niveau de 1 à 8, et rien en dehors', () => {
    expect(seniorityId(1)).toBe('intern');
    expect(seniorityId(8)).toBe('executive');
    expect(seniorityId(0)).toBeNull();
    expect(seniorityId(9)).toBeNull();
    expect(seniorityId(null)).toBeNull();
  });

  it('affiche « other » pour un identifiant disparu des listes', () => {
    expect(jobLabelKey('engineering', 'backend')).toBe('jobs.engineering.backend');
    expect(jobLabelKey('engineering', 'other')).toBe('other');
    expect(jobLabelKey('engineering', 'retired-job')).toBe('other');
    expect(jobLabelKey('retired-dept', 'backend')).toBe('other');
    expect(jobLabelKey(null, 'backend')).toBe('other');
    expect(jobLabelKey('engineering', null)).toBe('other');
    expect(departmentLabelKey('engineering')).toBe('departments.engineering');
    expect(departmentLabelKey('retired-dept')).toBe('other');
    expect(departmentLabelKey(null)).toBe('other');
  });

  it('a un libellé en anglais et en français pour chaque identifiant', () => {
    for (const messages of [en, fr]) {
      // Les JSON importés sont typés au plus juste : on les relit comme des dictionnaires.
      const o = messages.onboarding as unknown as {
        other: string;
        departments: Record<string, string>;
        jobs: Record<string, Record<string, string>>;
        asks: Record<string, { one: string; two: string }>;
        seniority: Record<string, string>;
        goals: Record<string, string>;
        steps: Record<string, string>;
      };
      expect(o.other).toBeTruthy();
      for (const id of DEPARTMENT_IDS) {
        expect(o.departments[id], id).toBeTruthy();
        expect(o.asks[id]?.one && o.asks[id]?.two, id).toBeTruthy();
        for (const job of DEPARTMENTS[id].jobs.filter((j) => j !== 'other'))
          expect(o.jobs[id]?.[job], `${id}.${job}`).toBeTruthy();
      }
      for (const id of SENIORITY_LEVELS) expect(o.seniority[id], id).toBeTruthy();
      for (const id of GOALS) expect(o.goals[id], id).toBeTruthy();
      for (const id of onboardingSteps('soleOwner')) expect(o.steps[id], id).toBeTruthy();
    }
  });
});

describe('le fil d’étapes', () => {
  it('suit le parcours : un propriétaire seul en fait trois, un membre deux, qui a une équipe une', () => {
    expect(onboardingSteps('soleOwner')).toEqual(['about', 'tools', 'teammates']);
    expect(onboardingSteps('member')).toEqual(['about', 'tools']);
    expect(onboardingSteps('ownerWithTeam')).toEqual(['about']);
  });
});
