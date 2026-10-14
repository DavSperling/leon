-- 0002-auth.sql : tables de Better Auth et jetons personnels.
-- Les tables de Better Auth sont la sortie de getMigrations (better-auth/db/migration), collée telle quelle :
-- Better Auth vérifie son schéma au démarrage. Pas de RLS ici : le code filtre explicitement par utilisateur.

create table "user" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);
create table "session" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" uuid not null references "user" ("id") on delete cascade, "activeOrganizationId" text);
create table "account" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "accountId" text not null, "providerId" text not null, "userId" uuid not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);
create table "verification" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);
create table "organization" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "name" text not null, "slug" text not null unique, "logo" text, "createdAt" timestamptz not null, "metadata" text);
create table "member" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "organizationId" uuid not null references "organization" ("id") on delete cascade, "userId" uuid not null references "user" ("id") on delete cascade, "role" text not null, "createdAt" timestamptz not null);
create table "invitation" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "organizationId" uuid not null references "organization" ("id") on delete cascade, "email" text not null, "role" text, "status" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "inviterId" uuid not null references "user" ("id") on delete cascade);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");
create index "member_organizationId_idx" on "member" ("organizationId");
create index "member_userId_idx" on "member" ("userId");
create index "invitation_organizationId_idx" on "invitation" ("organizationId");
create index "invitation_email_idx" on "invitation" ("email");

grant select, insert, update, delete on "user", session, account, verification, organization, member, invitation to leon_app;

create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  token_hash text not null unique,
  token_hint text not null,            -- 4 derniers caractères, pour l'affichage « leon_…8f2a »
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_tokens_user_idx on api_tokens (tenant_id, user_id);
grant select, insert, update on api_tokens to leon_app;
