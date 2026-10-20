-- 0020-corrections-audit-2.sql : les corrections du second audit du 20/10 qui touchent la base (file des
-- vecteurs, tâches de fond, retrait des sources d'une connexion).

-- Audit 2 n° 1 : la correction n° 8 de 0019 n'a pas tenu. passages_sans_vecteur (security definer) est planifiée
-- sans la valeur du modèle : l'index de `embedded_model` n'était jamais choisi et la table des passages était relue
-- chaque minute. Noter le modèle sur le passage le réécrivait aussi à chaque vecteur (colonne indexée : pas de mise
-- à jour HOT, index plein texte réécrit), et la migration avait noté le dernier modèle écrit, pas le courant.
--
-- Le plus simple qui règle les trois : une file des passages à vectoriser, dont la lecture ne dépend pas du modèle
-- (les plus récents d'abord, par un index). Un passage y entre à sa création, en sort quand le vecteur du modèle de
-- la file s'écrit (déclencheurs : l'app n'a aucun droit sur la file, rien ne change pour elle) ; le passage n'est
-- plus jamais réécrit. La file ne sert qu'un modèle à la fois : le premier tic d'un autre modèle la remplit de tous
-- les passages qui n'ont pas son vecteur (passages_sans_vecteur, ci-dessous), une fois.
drop index passages_embedded_model_idx;
alter table passages drop column embedded_model;

create table passages_a_vectoriser (
  tenant_id uuid not null,
  passage_id uuid primary key,
  -- Celle du passage : l'ordre de la file.
  created_at timestamptz not null,
  foreign key (tenant_id, passage_id) references passages (tenant_id, id) on delete cascade
);
create index passages_a_vectoriser_created_idx on passages_a_vectoriser (created_at desc, passage_id);
-- Aucune politique ni aucun droit pour l'app : seules les fonctions ci-dessous (security definer) la lisent et
-- l'écrivent.
alter table passages_a_vectoriser enable row level security;

-- Le modèle que sert la file (une ligne au plus ; aucune avant le premier tic).
create table passages_a_vectoriser_modele (
  seule boolean primary key default true check (seule),
  model text not null
);

create function passages_entrent_en_file() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into passages_a_vectoriser (tenant_id, passage_id, created_at)
  select n.tenant_id, n.id, n.created_at from nouveaux n
  on conflict do nothing;
  return null;
end
$$;
create trigger passages_en_file after insert on passages
  referencing new table as nouveaux for each statement execute function passages_entrent_en_file();

create function passages_sortent_de_file() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from passages_a_vectoriser q
  using nouveaux n, passages_a_vectoriser_modele m
  where q.passage_id = n.passage_id and n.model = m.model;
  return null;
end
$$;
create trigger vecteurs_hors_file after insert on passage_vectors
  referencing new table as nouveaux for each statement execute function passages_sortent_de_file();

-- Le changement de modèle se fait sous un verrou consultatif (deux tics ne remplissent pas la file ensemble) et un
-- verrou partagé sur les vecteurs, pris avant de toucher à la file : un vecteur écrit pendant le remplissage
-- l'attend, et il n'y a pas d'interblocage avec le déclencheur ci-dessus. La lecture, elle, ne parcourt que la tête
-- de la file : son plan est le même quel que soit le modèle.
create or replace function passages_sans_vecteur(p_model text, p_limit integer)
returns table (passage_id uuid, tenant_id uuid, user_id uuid)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not exists (select 1 from passages_a_vectoriser_modele m where m.model = p_model) then
    perform pg_advisory_xact_lock(hashtext('passages_a_vectoriser'));
    if not exists (select 1 from passages_a_vectoriser_modele m where m.model = p_model) then
      lock table passage_vectors in share mode;
      insert into passages_a_vectoriser_modele (seule, model) values (true, p_model)
        on conflict (seule) do update set model = excluded.model;
      delete from passages_a_vectoriser;
      insert into passages_a_vectoriser (tenant_id, passage_id, created_at)
      select p.tenant_id, p.id, p.created_at from passages p
      where not exists (
        select 1 from passage_vectors v where v.passage_id = p.id and v.model = p_model
      )
      -- Un passage écrit pendant le remplissage y est déjà entré (déclencheur).
      on conflict do nothing;
    end if;
  end if;
  return query
  select q.passage_id, q.tenant_id, s.owner_user_id
  from passages_a_vectoriser q
  join passages p on p.id = q.passage_id
  join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
  where exists (
    select 1 from member m where m."userId" = s.owner_user_id and m."organizationId" = q.tenant_id
  )
  order by q.created_at desc, q.passage_id
  limit p_limit;
end
$$;
revoke all on function passages_sans_vecteur(text, integer) from public;
grant execute on function passages_sans_vecteur(text, integer) to leon_app;

-- Audit 2 n° 7 bis : embedPassages ne retirait les vecteurs d'un ancien modèle que des passages qu'il vectorisait ;
-- ceux des passages déjà vectorisés dans le modèle courant restaient pour toujours (et l'index HNSW, global, les
-- parcourait). Le tic du serveur les retire par lots, seulement là où le vecteur du modèle courant existe. La
-- requête est dynamique : planifiée à chaque appel avec la valeur du modèle (voir le n° 1), elle prend l'index du
-- modèle, qui ne rend que les vecteurs des autres modèles. Rend le nombre de vecteurs retirés.
create index passage_vectors_model_idx on passage_vectors (model);

create function retirer_vieux_vecteurs(p_model text, p_limit integer)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  retires integer;
begin
  execute
    'with vieux as (
       select o.passage_id, o.model from passage_vectors o
       where (o.model < $1 or o.model > $1)
         and exists (select 1 from passage_vectors c where c.passage_id = o.passage_id and c.model = $1)
       limit $2
     )
     delete from passage_vectors v using vieux where v.passage_id = vieux.passage_id and v.model = vieux.model'
  using p_model, p_limit;
  get diagnostics retires = row_count;
  return retires;
end
$$;
revoke all on function retirer_vieux_vecteurs(text, integer) from public;
grant execute on function retirer_vieux_vecteurs(text, integer) to leon_app;
