-- 0041-onboarding.sql : ce que l'onboarding demande (docs/specs/2026-10-28-onboarding.md). Le service, le poste,
-- le niveau et les attentes appartiennent à l'appartenance ; la taille, à l'organisation. Des identifiants, jamais
-- des libellés (src/lib/onboarding.ts). "onboardedAt" nul : l'étape 1 reste à faire (layout de l'appli).
alter table "member"
  add column "department" text,
  add column "job" text,
  add column "seniority" smallint check ("seniority" between 1 and 8),
  add column "goals" text[] not null default '{}',
  add column "onboardedAt" timestamptz;
alter table "organization" add column "size" text check ("size" in ('1-10', '11-50', '51-200', '201+'));
