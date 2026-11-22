-- 0080-brouillons.sql : les brouillons de réponse que l'agent « Brouillons de réponse » prépare pour une personne
-- (portrait/brouillons.ts). Une ligne par mail auquel répondre : son brouillon, ou rien quand le modèle a jugé qu'aucune
-- réponse n'était attendue, pour que ce mail ne lui soit jamais redemandé. Rien n'est envoyé, et rien n'est écrit dans
-- sa boîte : le brouillon se lit dans Leon. Comme sa fiche (0076) et ses réponses aux agents (0078) : privé à la
-- personne (acl = [user_id], contrôlé par la base), sans politique equipe_lit : ni son manager, ni un administrateur,
-- ni un agent d'équipe ne le lisent.

create table brouillons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  -- Le fil de courrier auquel il répond : le brouillon ne lui survit pas.
  source_id uuid not null,
  -- Le message auquel répondre : l'identifiant de ses tours (« message:<id> »), sans le rang ni l'empreinte de ses
  -- morceaux (portrait/sent-mails.ts).
  message text not null check (char_length(message) between 1 and 200),
  -- Le corps du brouillon. Nul : aucune réponse n'était attendue.
  texte text check (char_length(texte) between 1 and 6000),
  -- Écarté par la personne : il ne se montre plus.
  ecarte_le timestamptz,
  -- Privé à la personne, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  -- Un seul résultat par message auquel répondre.
  unique (tenant_id, source_id, user_id, message),
  foreign key (tenant_id, source_id) references sources (tenant_id, id) on delete cascade
);

alter table brouillons enable row level security;
create policy tenant_acl on brouillons to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

-- Un brouillon ne se modifie ni ne se refait : seul « Écarter » change sa ligne. La suppression ne sert qu'à
-- deleteAccount.
grant select, insert, delete on brouillons to leon_app;
grant update (ecarte_le) on brouillons to leon_app;

-- Le plafond de dépense, comme celui du point (0060) et de l'agenda (0072) : un compteur par personne et par jour
-- (UTC), sans texte, que l'app ne touche que par reserver_brouillon.
create table brouillons_par_jour (
  user_id uuid not null references "user"(id) on delete cascade,
  jour date not null,
  nombre integer not null,
  primary key (user_id, jour)
);

-- Compte un appel au modèle de p_user aujourd'hui s'il en reste sous p_plafond, et rend vrai ; sinon rend faux.
-- L'écriture verrouille la ligne du jour : deux passages simultanés ne passent pas le plafond. Les jours passés de la
-- personne s'effacent au passage.
create function reserver_brouillon(p_user uuid, p_plafond integer)
returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  with passes as (
    delete from brouillons_par_jour where user_id = p_user and jour < (now() at time zone 'UTC')::date
  ), compte as (
    insert into brouillons_par_jour as p (user_id, jour, nombre)
    values (p_user, (now() at time zone 'UTC')::date, 1)
    on conflict (user_id, jour) do update set nombre = p.nombre + 1 where p.nombre < p_plafond
    returning 1
  )
  select exists (select 1 from compte)
$$;
revoke all on function reserver_brouillon(uuid, integer) from public;
grant execute on function reserver_brouillon(uuid, integer) to leon_app;
