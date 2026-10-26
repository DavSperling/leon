-- 0034-mcp-oauth.sql : OAuth 2.1 pour le serveur MCP distant (connexion et consentement par compte Leon).

create table "jwks" (
  "id" uuid primary key default gen_random_uuid(),
  "publicKey" text not null,
  "privateKey" text not null,
  "createdAt" timestamptz not null,
  "expiresAt" timestamptz,
  "alg" text,
  "crv" text
);

create table "oauthClient" (
  "id" uuid primary key default gen_random_uuid(),
  "clientId" text not null unique,
  "clientSecret" text,
  "clientDiscoveryId" text,
  "disabled" boolean,
  "skipConsent" boolean,
  "enableEndSession" boolean,
  "subjectType" text,
  "scopes" jsonb,
  "clientCredentialsScopes" jsonb,
  "userId" uuid references "user" ("id") on delete cascade,
  "createdAt" timestamptz,
  "updatedAt" timestamptz,
  "name" text,
  "uri" text,
  "icon" text,
  "contacts" jsonb,
  "tos" text,
  "policy" text,
  "softwareId" text,
  "softwareVersion" text,
  "softwareStatement" text,
  "redirectUris" jsonb not null,
  "postLogoutRedirectUris" jsonb,
  "backchannelLogoutUri" text,
  "backchannelLogoutSessionRequired" boolean,
  "tokenEndpointAuthMethod" text,
  "applicationType" text,
  "jwks" text,
  "jwksUri" text,
  "grantTypes" jsonb,
  "responseTypes" jsonb,
  "requirePKCE" boolean,
  "dpopBoundAccessTokens" boolean,
  "referenceId" text,
  "metadata" jsonb
);
create index "oauthClient_userId_idx" on "oauthClient" ("userId");

create table "oauthResource" (
  "id" uuid primary key default gen_random_uuid(),
  "identifier" text not null unique,
  "name" text not null,
  "accessTokenTtl" integer,
  "refreshTokenTtl" integer,
  "signingAlgorithm" text,
  "signingKeyId" text,
  "allowedScopes" jsonb,
  "customClaims" jsonb,
  "dpopBoundAccessTokensRequired" boolean,
  "disabled" boolean,
  "createdAt" timestamptz,
  "updatedAt" timestamptz,
  "policyVersion" integer,
  "metadata" jsonb
);

create table "oauthClientResource" (
  "id" uuid primary key default gen_random_uuid(),
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "resourceId" text not null references "oauthResource" ("identifier") on delete cascade,
  "metadata" jsonb,
  "createdAt" timestamptz
);
create index "oauthClientResource_clientId_idx" on "oauthClientResource" ("clientId");
create index "oauthClientResource_resourceId_idx" on "oauthClientResource" ("resourceId");

create table "oauthRefreshToken" (
  "id" uuid primary key default gen_random_uuid(),
  "token" text not null unique,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "sessionId" uuid references "session" ("id") on delete set null,
  "userId" uuid not null references "user" ("id") on delete cascade,
  "referenceId" text,
  "authorizationCodeId" text,
  "resources" jsonb,
  "requestedUserInfoClaims" jsonb,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null,
  "revoked" timestamptz,
  "rotatedAt" timestamptz,
  "rotationReplayResponse" text,
  "rotationReplayExpiresAt" timestamptz,
  "authTime" timestamptz,
  "confirmation" jsonb,
  "scopes" jsonb not null
);
create index "oauthRefreshToken_clientId_idx" on "oauthRefreshToken" ("clientId");
create index "oauthRefreshToken_sessionId_idx" on "oauthRefreshToken" ("sessionId");
create index "oauthRefreshToken_userId_idx" on "oauthRefreshToken" ("userId");
create index "oauthRefreshToken_authorizationCodeId_idx" on "oauthRefreshToken" ("authorizationCodeId");

create table "oauthAccessToken" (
  "id" uuid primary key default gen_random_uuid(),
  "token" text not null unique,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "sessionId" uuid references "session" ("id") on delete set null,
  "userId" uuid references "user" ("id") on delete cascade,
  "referenceId" text,
  "authorizationCodeId" text,
  "resources" jsonb,
  "requestedUserInfoClaims" jsonb,
  "refreshId" uuid references "oauthRefreshToken" ("id") on delete cascade,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null,
  "revoked" timestamptz,
  "confirmation" jsonb,
  "scopes" jsonb not null
);
create index "oauthAccessToken_clientId_idx" on "oauthAccessToken" ("clientId");
create index "oauthAccessToken_sessionId_idx" on "oauthAccessToken" ("sessionId");
create index "oauthAccessToken_userId_idx" on "oauthAccessToken" ("userId");
create index "oauthAccessToken_authorizationCodeId_idx" on "oauthAccessToken" ("authorizationCodeId");
create index "oauthAccessToken_refreshId_idx" on "oauthAccessToken" ("refreshId");

create table "oauthConsent" (
  "id" uuid primary key default gen_random_uuid(),
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "userId" uuid references "user" ("id") on delete cascade,
  "referenceId" text,
  "resources" jsonb,
  "requestedUserInfoClaims" jsonb,
  "scopes" jsonb not null,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);
create index "oauthConsent_clientId_idx" on "oauthConsent" ("clientId");
create index "oauthConsent_userId_idx" on "oauthConsent" ("userId");

create table "oauthClientAssertion" (
  "id" uuid primary key default gen_random_uuid(),
  "expiresAt" timestamptz not null
);

grant select, insert, update, delete on
  "jwks", "oauthClient", "oauthResource", "oauthClientResource",
  "oauthRefreshToken", "oauthAccessToken", "oauthConsent", "oauthClientAssertion"
to leon_app;
