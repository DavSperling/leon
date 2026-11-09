-- 0057-manager-voit-tout.sql : un manager lit tout ce que font les gens sous lui, directs et indirects, privé compris
-- (plan organisation, lot 3). En lecture seulement, et seulement où l'écran le demande (recherche, aperçu d'un
-- résultat, « Mon équipe ») : withTenant pose alors app.vus, les personnes dont il lit le privé. Ses écritures restent
-- sous app.principals (0003, 0011). Deux interrupteurs : l'organisation pour tous ses managers, chaque manager par
-- personne.

create function app_vus() returns uuid[] language sql stable
  as $$ select coalesce(nullif(current_setting('app.vus', true), '')::uuid[], '{}'::uuid[]) $$;

-- Sans ligne, les managers lisent le privé des gens sous eux. Seuls un propriétaire ou un administrateur l'écrivent.
create table reglages_organisation (
  tenant_id uuid primary key references organization(id) on delete cascade,
  managers_voient_tout boolean not null default true
);
alter table reglages_organisation enable row level security;
create policy tenant_only on reglages_organisation to leon_app
  using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy admin_insert on reglages_organisation as restrictive for insert to leon_app
  with check (app_est_admin());
create policy admin_update on reglages_organisation as restrictive for update to leon_app
  using (app_est_admin());
grant select, insert, update on reglages_organisation to leon_app;

-- Par personne : faux, ce manager ne lit plus son privé. Une ligne posée pour cela seul suit toutes les familles
-- (families nul, comme sans ligne). Seul le manager écrit ses lignes.
alter table manager_follows add column voit_tout boolean not null default true;
alter table manager_follows alter column families drop not null;
create policy manager_insert on manager_follows as restrictive for insert to leon_app
  with check (manager_id = (select id from member where "userId" = app_user() and "organizationId" = app_tenant()));
create policy manager_update on manager_follows as restrictive for update to leon_app
  using (manager_id = (select id from member where "userId" = app_user() and "organizationId" = app_tenant()));

-- L'organigramme dit maintenant qui lit le privé de qui : seuls un propriétaire ou un administrateur l'écrivent
-- (organisation.ts le vérifiait déjà). Le départ d'un membre passe : une cascade de clé étrangère ignore la RLS.
create policy admin_insert on reporting_lines as restrictive for insert to leon_app
  with check (app_est_admin());
create policy admin_update on reporting_lines as restrictive for update to leon_app
  using (app_est_admin());
create policy admin_delete on reporting_lines as restrictive for delete to leon_app
  using (app_est_admin());

-- Les personnes sous la personne courante dont elle lit le privé : aucune si l'organisation l'a coupé, ni celles pour
-- qui elle l'a coupé, ni les comptes supprimés. 32 niveaux au plus, comme organisation.ts.
create function equipe_visible() returns uuid[] language sql stable set search_path = public, pg_temp as $$
  with recursive moi as (
    select id from member where "userId" = app_user() and "organizationId" = app_tenant()
  ), sous (member_id, profondeur) as (
    select r.member_id, 1 from reporting_lines r where r.manager_id = (select id from moi)
    union
    select r.member_id, s.profondeur + 1 from reporting_lines r join sous s on r.manager_id = s.member_id
     where s.profondeur < 32
  )
  select coalesce(array_agg(distinct m."userId"), '{}')
    from sous
    join member m on m.id = sous.member_id
    join "user" u on u.id = m."userId"
   where u.deleted_at is null
     and coalesce((select managers_voient_tout from reglages_organisation where tenant_id = app_tenant()), true)
     and not exists (select 1 from manager_follows f
                      where f.manager_id = (select id from moi) and f.member_id = sous.member_id and not f.voit_tout)
$$;

-- Lire, jamais écrire : ces règles ne valent que pour select et s'ajoutent à tenant_acl. Une modification ou une
-- suppression doit toujours passer tenant_acl, une insertion son with check.
create policy equipe_lit on sources for select to leon_app
  using (tenant_id = app_tenant() and acl && app_vus());
create policy equipe_lit on turns for select to leon_app
  using (tenant_id = app_tenant() and acl && app_vus());
create policy equipe_lit on passages for select to leon_app
  using (tenant_id = app_tenant() and acl && app_vus());
create policy equipe_lit on passage_vectors for select to leon_app
  using (tenant_id = app_tenant() and acl && app_vus());
