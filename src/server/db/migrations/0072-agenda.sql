-- 0072-agenda.sql : les rendez-vous de la semaine, trouvés par le modèle dans les e-mails d'une personne (le
-- calendrier de l'Accueil). Comme le point du matin (0030), c'est un cache, pas une fiche : refait quand de nouveaux
-- e-mails arrivent, jamais traité comme une source, et revérifié à chaque lecture (un rendez-vous dont la personne ne
-- voit plus la source n'est pas montré). Privé à la personne (acl = [user_id]) : il est fait de ses e-mails.
-- Les réunions de l'agenda Outlook n'y sont pas : elles ont leur heure et se lisent telles quelles, sans modèle.

create table agendas (
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  -- [{ titre, debut, fin?, avec?, sourceId }] : debut et fin à l'heure de Paris, « 2026-11-17T14:00 » ou « 2026-11-17 ».
  rendez_vous jsonb not null check (jsonb_typeof(rendez_vous) = 'array' and jsonb_array_length(rendez_vous) <= 60),
  -- TOUTES les sources fournies au modèle, citées ou non.
  source_ids uuid[] not null default '{}',
  prepared_at timestamptz not null,
  -- Privé à son utilisateur, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  primary key (tenant_id, user_id)
);

alter table agendas enable row level security;
create policy tenant_acl on agendas to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

-- Refait en place (insert … on conflict do update) ; la suppression ne sert qu'à deleteAccount.
grant select, insert, delete on agendas to leon_app;
grant update (rendez_vous, source_ids, prepared_at) on agendas to leon_app;

-- Le plafond de dépense, comme celui du point (0060) : un compteur par personne et par jour (UTC), sans texte, que
-- l'app ne touche que par reserver_agenda.
create table agendas_par_jour (
  user_id uuid not null references "user"(id) on delete cascade,
  jour date not null,
  nombre integer not null,
  primary key (user_id, jour)
);

create function reserver_agenda(p_user uuid, p_plafond integer)
returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  with passes as (
    delete from agendas_par_jour where user_id = p_user and jour < (now() at time zone 'UTC')::date
  ), compte as (
    insert into agendas_par_jour as p (user_id, jour, nombre)
    values (p_user, (now() at time zone 'UTC')::date, 1)
    on conflict (user_id, jour) do update set nombre = p.nombre + 1 where p.nombre < p_plafond
    returning 1
  )
  select exists (select 1 from compte)
$$;
revoke all on function reserver_agenda(uuid, integer) from public;
grant execute on function reserver_agenda(uuid, integer) to leon_app;

-- L'étape du modèle qui lit les e-mails, pour que ses appels s'inscrivent au tableau des admins.
alter table appels_modele
  drop constraint appels_modele_step_check,
  add constraint appels_modele_step_check
    check (step in ('reponse', 'discussion', 'point', 'resume', 'fil', 'agenda'));
