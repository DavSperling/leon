-- 0049-jetons-assistants.sql : api_tokens range ses jetons par sorte, et porte ceux des assistants branchés par OAuth.
--
-- kind : « manuel » (créé dans Réglages), « ordinateur » (enregistré par `leon login`) ou « assistant » (claude.ai,
-- ChatGPT…). Les lignes d'avant valent « manuel », sauf celles que `leon login` a nommées « Ordinateur : … ».
-- Seul un « assistant » expire (expires_at, accès d'une heure) et se renouvelle (refresh_hash, renouvellement de 90
-- jours changé à chaque usage). grant_id, unique, fait l'usage unique du code d'autorisation ; client_ref, le SHA-256 du
-- client_id, lie le renouvellement à son client. previous_refresh_hash et refresh_rotated_at gardent l'ancien jeton de
-- renouvellement et l'heure de sa rotation : le présenter encore, passé 30 s, est un rejeu (RFC 9700 §4.14.2). Pas de RLS,
-- comme avant : toujours filtrée par user_id et tenant_id, ou par une empreinte.
alter table api_tokens
  add column kind text not null default 'manuel'
    check (kind in ('manuel', 'ordinateur', 'assistant')),
  add column client_name text,          -- le nom déclaré à l'inscription (assistant)
  add column client_host text,          -- l'hôte de l'adresse de retour (assistant), seul élément vérifié
  add column client_ref text,           -- SHA-256 du client_id : un renouvellement n'est servi qu'à ce client
  add column grant_id text unique,      -- j du code d'autorisation : un code ne sert qu'une fois
  add column expires_at timestamptz,    -- null : n'expire pas
  add column refresh_hash text unique,  -- SHA-256 du jeton de renouvellement
  add column refresh_expires_at timestamptz,
  add column previous_refresh_hash text unique,  -- l'empreinte du renouvellement d'avant la dernière rotation
  add column refresh_rotated_at timestamptz;     -- l'heure de cette rotation

update api_tokens set kind = 'ordinateur' where name like 'Ordinateur : %';
