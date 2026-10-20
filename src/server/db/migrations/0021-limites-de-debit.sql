-- 0021-limites-de-debit.sql : les limites de débit de la connexion et de l'inscription (audit 2 n° 3).
--
-- Les server actions appellent Better Auth par auth.api.*, qui ne passe pas par sa limite de débit (seul son
-- routeur l'applique), et cette limite ne compte que par adresse IP, en mémoire par défaut. Le compteur vit donc
-- ici, en base : il tient avec plusieurs instances de Leon, par adresse IP et par e-mail (rate-limit.ts).
--
-- Une ligne par clé (`connexion:email:<empreinte>`…) : le nombre de tentatives depuis le début de sa fenêtre
-- (fenêtre fixe). L'app ne touche pas la table : elle passe par consommer_limites.
create table limites_de_debit (
  cle text primary key,
  compte integer not null,
  debut timestamptz not null
);
create index limites_de_debit_debut_idx on limites_de_debit (debut);

-- Compte une tentative pour chaque clé et rend le compte de chacune dans sa fenêtre : l'appelant compare au
-- plafond. Une seule instruction (insert … on conflict) : deux instances qui comptent la même clé en même temps
-- ne perdent aucune tentative. Les compteurs d'une fenêtre passée sont effacés au passage (sauf ceux qu'on
-- compte, qui repartent de 1).
create function consommer_limites(p_cles text[], p_fenetre interval)
returns table (cle text, compte integer)
language sql volatile security definer set search_path = public as $$
  with purge as (
    delete from limites_de_debit l where l.debut < now() - p_fenetre and l.cle <> all (p_cles)
  )
  insert into limites_de_debit as l (cle, compte, debut)
  select k, 1, now() from unnest(p_cles) as k
  on conflict (cle) do update set
    compte = case when l.debut < now() - p_fenetre then 1 else l.compte + 1 end,
    debut = case when l.debut < now() - p_fenetre then now() else l.debut end
  returning l.cle, l.compte
$$;
revoke all on function consommer_limites(text[], interval) from public;
grant execute on function consommer_limites(text[], interval) to leon_app;
