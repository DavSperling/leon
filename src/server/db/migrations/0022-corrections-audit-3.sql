-- 0022-corrections-audit-3.sql : les corrections du troisième audit du 20/10 qui touchent la base (file des
-- passages à vectoriser).

-- Audit 3 n° 1 : au changement de modèle, passages_sans_vecteur vidait la file (truncate) et la remplissait dans la
-- même transaction. Le verrou exclusif du truncate restait pris tout le remplissage : une suppression de source (qui
-- retire en cascade les lignes de la file) en attendait la fin, et le truncate attendait les suppressions en cours.
--
-- Désormais la bascule ne fait que noter le modèle (une ligne) ; la file n'est plus vidée. Le remplissage se fait
-- ensuite par lots, un lot par appel (chacun dans sa propre transaction), dans l'ordre des identifiants des passages
-- (la clé primaire) à partir d'un curseur. Il ne prend qu'un verrou léger (`for key share`) sur les passages du lot,
-- et saute ceux qu'une suppression verrouille déjà (`skip locked`) : une suppression n'attend au plus que l'appel en
-- cours, et le remplissage n'attend aucune suppression. Limite connue : le passage d'une suppression annulée pendant
-- ce lot est sauté ; il revient au changement de modèle suivant (le plein texte le trouve toujours).
--
-- Ce que la file garde de l'ancien modèle, et un passage vectorisé pendant le remplissage, en sortent à la lecture :
-- la tête de la file est lue, ses passages qui ont déjà le vecteur du modèle sont retirés (en sautant les lignes
-- qu'une suppression tient), les autres rendus.
--
-- Une file déjà remplie par 0020 est notée remplie.
alter table passages_a_vectoriser_modele
  add column if not exists rempli boolean not null default true,
  -- Le dernier passage examiné par le remplissage (nul : au début).
  add column if not exists curseur uuid;

-- Un lot : au plus 10 000 passages à vectoriser, verrouillés (verrou léger) jusqu'à la fin de l'appel.
create or replace function passages_sans_vecteur(p_model text, p_limit integer)
returns table (passage_id uuid, tenant_id uuid, user_id uuid)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_rempli boolean;
  v_curseur uuid;
  v_lus integer;
  v_dernier uuid;
begin
  -- La bascule : le modèle noté, le remplissage à refaire depuis le début.
  if not exists (select 1 from passages_a_vectoriser_modele m where m.model = p_model) then
    insert into passages_a_vectoriser_modele (seule, model, rempli, curseur) values (true, p_model, false, null)
      on conflict (seule) do update set model = excluded.model, rempli = false, curseur = null;
  end if;
  select m.rempli, m.curseur into v_rempli, v_curseur from passages_a_vectoriser_modele m;
  if not v_rempli then
    with lot as (
      select p.tenant_id, p.id, p.created_at from passages p
      where p.id > coalesce(v_curseur, '00000000-0000-0000-0000-000000000000'::uuid)
        and not exists (select 1 from passage_vectors v where v.passage_id = p.id and v.model = p_model)
        -- Déjà dans la file (gardé de l'ancien modèle, ou écrit pendant le remplissage : déclencheur).
        and not exists (select 1 from passages_a_vectoriser q where q.passage_id = p.id)
      order by p.id
      limit 10000
      for key share of p skip locked
    ),
    entres as (
      insert into passages_a_vectoriser (tenant_id, passage_id, created_at)
      select l.tenant_id, l.id, l.created_at from lot l
      on conflict do nothing
    )
    select count(*)::integer, (array_agg(l.id order by l.id desc))[1] into v_lus, v_dernier from lot l;
    update passages_a_vectoriser_modele m
       set rempli = v_lus < 10000, curseur = coalesce(v_dernier, m.curseur)
     where m.model = p_model;
  end if;
  -- La tête de la file, puis le propriétaire et le vecteur de chacun de ses passages par une sous-requête par ligne :
  -- le plan ne lit jamais les passages ni les vecteurs en entier, quelle que soit l'estimation du planificateur.
  return query
  with tete as materialized (
    select q.passage_id, q.tenant_id,
      (select s.owner_user_id from passages p join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
        where p.id = q.passage_id) as owner_user_id,
      exists (
        select 1 from passage_vectors v where v.passage_id = q.passage_id and v.model = p_model
      ) as fait
    from passages_a_vectoriser q
    -- Audit 2 n° 9 b : l'indexation vectorise elle-même les passages qu'elle écrit ; le tic les doublait. Il ne
    -- prend que ceux écrits il y a plus de 2 minutes (par le même index que l'ordre).
    where q.created_at < now() - interval '2 minutes'
    order by q.created_at desc, q.passage_id
    limit p_limit
  ),
  sortis as (
    delete from passages_a_vectoriser q
    where q.passage_id in (
      select r.passage_id from passages_a_vectoriser r join tete t on t.passage_id = r.passage_id
      where t.fait
      for update of r skip locked
    )
  )
  select t.passage_id, t.tenant_id, t.owner_user_id from tete t
  where not t.fait
    and exists (
      select 1 from member m where m."userId" = t.owner_user_id and m."organizationId" = t.tenant_id
    );
end
$$;

-- Le retrait des vieux vecteurs (0020, audit 2 n° 7 bis), même requête, sauf que l'existence du vecteur du modèle
-- courant se vérifie par une sous-requête par ligne : le planificateur ne peut plus la changer en jointure qui
-- relit tous les vecteurs du modèle courant quand il surestime les vecteurs des autres modèles (ce qui arrivait sur
-- la base de test dès que les autres fichiers écrivaient des vecteurs pendant la mesure, audit 3 n° 1).
create or replace function retirer_vieux_vecteurs(p_model text, p_limit integer)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  retires integer;
begin
  execute
    'with vieux as (
       select o.passage_id, o.model from passage_vectors o
       where (o.model < $1 or o.model > $1)
         and (select true from passage_vectors c where c.passage_id = o.passage_id and c.model = $1)
       limit $2
     )
     delete from passage_vectors v using vieux where v.passage_id = vieux.passage_id and v.model = vieux.model'
  using p_model, p_limit;
  get diagnostics retires = row_count;
  return retires;
end
$$;
