-- 0033-liens-invitation.sql : ajouter un membre par un lien d'invitation (spec du deuxième jet, « L'instance en
-- ligne »). Un propriétaire ou un administrateur crée le lien et l'envoie lui-même : Leon n'envoie aucun e-mail.
-- Le lien sert une fois, avant sa date d'expiration ; seul le SHA-256 du secret est stocké, comme pour api_tokens.
-- Pas de RLS : le lien se retrouve par son empreinte avant qu'on connaisse l'organisation (inscription).
-- L'invitation de Better Auth (0002) n'est pas reprise : elle est liée à un e-mail que Leon ne vérifie pas.
create table invitation_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  created_by uuid not null references "user"(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at)
);
create index invitation_links_tenant_idx on invitation_links (tenant_id);
grant select, insert, update on invitation_links to leon_app;
