-- Champs et table attendus par le plugin 2FA de Better Auth 1.7.7.
alter table "user" add column "twoFactorEnabled" boolean not null default false;
create table "twoFactor" (
  "id" uuid default pg_catalog.gen_random_uuid() not null primary key,
  "secret" text not null,
  "backupCodes" text not null,
  "userId" uuid not null references "user"("id") on delete cascade,
  "verified" boolean not null default true,
  "failedVerificationCount" integer not null default 0,
  "lockedUntil" timestamptz
);
create index "twoFactor_userId_idx" on "twoFactor" ("userId");
grant select, insert, update, delete on "twoFactor" to leon_app;
