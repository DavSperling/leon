-- 0023-corrections-audit-4.sql : les corrections du quatrième audit du 20/10 qui touchent la base (file des
-- passages à vectoriser, retrait des vieux vecteurs).

-- Audit 4 n° 1 : la lecture de la file retirait en silence les lignes de tête qui avaient déjà le vecteur du modèle
-- (ou dont le propriétaire est parti) et ne rendait que les autres. Le tic, qui ne voyait que les lignes rendues,
-- croyait la file presque vide : il s'arrêtait et retirait les vieux vecteurs en plein rattrapage (cas du retour à
-- un ancien modèle : la file garde en tête des passages qui ont déjà son vecteur). Désormais chaque ligne examinée
-- est rendue, avec `a_vectoriser` : faux pour celles qui sortent de la file. Le corps est celui de 0022, sauf la
-- dernière ligne. Le type rendu change : la fonction est recréée (et ses droits avec).
drop function passages_sans_vecteur(text, integer);

create function passages_sans_vecteur(p_model text, p_limit integer)
returns table (passage_id uuid, tenant_id uuid, user_id uuid, a_vectoriser boolean)
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
      join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
      where p.id > coalesce(v_curseur, '00000000-0000-0000-0000-000000000000'::uuid)
        -- Audit 3 n° 2 : seulement les passages d'un membre (personne ne peut lire les autres sous ses droits).
        and exists (
          select 1 from member m where m."userId" = s.owner_user_id and m."organizationId" = p.tenant_id
        )
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
  -- La tête de la file d'abord (par son index), puis le propriétaire et le vecteur de chacun de ses passages par une
  -- sous-requête par ligne : le plan ne lit jamais les passages ni les vecteurs en entier, quelle que soit
  -- l'estimation du planificateur.
  return query
  with tete as materialized (
    select q.passage_id, q.tenant_id
    from passages_a_vectoriser q
    -- Audit 2 n° 9 b : l'indexation vectorise elle-même les passages qu'elle écrit ; le tic les doublait. Il ne
    -- prend que ceux écrits il y a plus de 2 minutes (par le même index que l'ordre).
    where q.created_at < now() - interval '2 minutes'
    order by q.created_at desc, q.passage_id
    limit p_limit
  ),
  lus as materialized (
    select t.passage_id, t.tenant_id,
      (select s.owner_user_id from passages p join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
        where p.id = t.passage_id) as owner_user_id,
      exists (
        select 1 from passage_vectors v where v.passage_id = t.passage_id and v.model = p_model
      ) as fait
    from tete t
  ),
  juges as materialized (
    select l.*, exists (
      select 1 from member m where m."userId" = l.owner_user_id and m."organizationId" = l.tenant_id
    ) as membre
    from lus l
  ),
  sortis as (
    delete from passages_a_vectoriser q
    where q.passage_id in (
      select r.passage_id from passages_a_vectoriser r join juges j on j.passage_id = r.passage_id
      where j.fait or not j.membre
      for update of r skip locked
    )
  )
  select j.passage_id, j.tenant_id, j.owner_user_id, j.membre and not j.fait from juges j;
end
$$;
revoke all on function passages_sans_vecteur(text, integer) from public;
grant execute on function passages_sans_vecteur(text, integer) to leon_app;
