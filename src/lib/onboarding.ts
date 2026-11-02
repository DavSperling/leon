import type { ProviderId } from '@/capture/turn';

// Les listes fixes de l'onboarding, communes à toutes les entreprises. La base ne garde que ces
// identifiants ; les libellés vivent dans `messages/*.json` (espace `onboarding`). Données pures.

// Chaque service se termine par `other` (poste absent de la liste, sans texte libre).
// `tools` : les outils conseillés à l'étape 2, dans l'ordre d'affichage.
export const DEPARTMENTS = {
  engineering: {
    jobs: [
      'backend',
      'frontend',
      'fullstack',
      'mobile',
      'devops',
      'qa',
      'engineeringManager',
      'cto',
      'other',
    ],
    tools: ['github', 'gitlab', 'linear', 'sentry', 'jira', 'notion', 'slack'],
  },
  product: {
    jobs: ['productManager', 'productOwner', 'headOfProduct', 'cpo', 'other'],
    tools: ['linear', 'notion', 'jira', 'productboard', 'miro', 'fathom', 'slack'],
  },
  design: {
    jobs: ['productDesigner', 'uxResearcher', 'artDirector', 'other'],
    tools: ['miro', 'notion', 'linear', 'drive', 'slack'],
  },
  data: {
    jobs: ['dataAnalyst', 'dataEngineer', 'dataScientist', 'other'],
    tools: ['github', 'notion', 'drive', 'jira', 'slack'],
  },
  sales: {
    jobs: ['sdr', 'accountExecutive', 'accountManager', 'salesOps', 'vpSales', 'other'],
    tools: ['hubspot', 'pipedrive', 'gmail', 'gong', 'fathom', 'drive', 'slack'],
  },
  marketing: {
    jobs: ['growth', 'content', 'productMarketing', 'communications', 'cmo', 'other'],
    tools: ['hubspot', 'notion', 'drive', 'asana', 'gmail', 'slack'],
  },
  support: {
    jobs: ['supportAgent', 'customerSuccess', 'implementation', 'headOfSupport', 'other'],
    tools: ['intercom', 'zendesk', 'front', 'linear', 'gmail', 'slack'],
  },
  operations: {
    jobs: ['officeManager', 'accountant', 'financialController', 'cfo', 'coo', 'other'],
    tools: ['drive', 'gmail', 'notion', 'airtable', 'slack'],
  },
  people: {
    jobs: ['recruiter', 'hrGeneralist', 'headOfPeople', 'other'],
    tools: ['drive', 'gmail', 'notion', 'slack'],
  },
  legal: {
    jobs: ['legalCounsel', 'generalCounsel', 'other'],
    tools: ['drive', 'outlook', 'gmail', 'notion'],
  },
  leadership: {
    jobs: ['ceo', 'managingDirector', 'partner', 'other'],
    tools: ['gmail', 'slack', 'drive', 'hubspot', 'fathom', 'notion', 'linear'],
  },
} as const satisfies Record<string, { jobs: readonly string[]; tools: readonly ProviderId[] }>;

export type Department = keyof typeof DEPARTMENTS;
export const DEPARTMENT_IDS = Object.keys(DEPARTMENTS) as [Department, ...Department[]];

// L'indice + 1 est la valeur gardée en base (1 à 8).
export const SENIORITY_LEVELS = [
  'intern',
  'apprentice',
  'junior',
  'mid',
  'senior',
  'lead',
  'head',
  'executive',
] as const;
export type SeniorityId = (typeof SENIORITY_LEVELS)[number];

export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201+'] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

export const GOALS = ['find', 'meetings', 'briefing', 'team', 'onboarding', 'customers'] as const;
export type Goal = (typeof GOALS)[number];

// `Object.hasOwn` : sans lui, « toString » passerait pour un service.
export const isDepartment = (value: string): value is Department =>
  Object.hasOwn(DEPARTMENTS, value);

export const isJobOf = (department: Department, job: string): boolean =>
  (DEPARTMENTS[department].jobs as readonly string[]).includes(job);

export const seniorityId = (level: number | null): SeniorityId | null =>
  level === null ? null : (SENIORITY_LEVELS[level - 1] ?? null);

// Les messages sont typés depuis fr.json : les clés doivent être des unions littérales, pas des `string`.
type JobsOf<D extends Department> = Exclude<(typeof DEPARTMENTS)[D]['jobs'][number], 'other'>;
export type JobLabelKey = { [D in Department]: `jobs.${D}.${JobsOf<D>}` }[Department];

// Un identifiant disparu des listes s'affiche « Autre » (`onboarding.other`).
export const departmentLabelKey = (id: string | null): `departments.${Department}` | 'other' =>
  id !== null && isDepartment(id) ? `departments.${id}` : 'other';

export const jobLabelKey = (
  department: string | null,
  job: string | null,
): JobLabelKey | 'other' =>
  department !== null &&
  job !== null &&
  job !== 'other' &&
  isDepartment(department) &&
  isJobOf(department, job)
    ? (`jobs.${department}.${job}` as JobLabelKey)
    : 'other';
