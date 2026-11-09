-- 0053-sso.sql : le SSO d'entreprise d'un espace (plugin @better-auth/sso). La table est la sortie de getMigrations
-- (better-auth/db/migration), collée telle quelle comme en 0002 : Better Auth vérifie son schéma au démarrage.
-- Une ligne par fournisseur (OIDC ou SAML), rattachée à l'espace qui l'a réglé ; `domainVerified` passe à vrai quand
-- l'enregistrement DNS de l'espace est trouvé, et rien ne se connecte avant. Les secrets OIDC sont dans `oidcConfig`.
create table "ssoProvider" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "issuer" text not null, "oidcConfig" text, "samlConfig" text, "userId" uuid not null references "user" ("id") on delete cascade, "providerId" text not null unique, "organizationId" text, "domain" text not null, "domainVerified" boolean);
create index "ssoProvider_organizationId_idx" on "ssoProvider" ("organizationId");

grant select, insert, update, delete on "ssoProvider" to leon_app;
