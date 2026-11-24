-- 0088-brouillon-relance.sql : l'agent « Relances » garde ses lignes dans la table des brouillons (0080), privées comme
-- elles : la même politique, le même contrôle de l'accès, supprimées avec le compte et avec le fil. Une ligne dit
-- désormais sa sorte : « reponse », le brouillon d'une réponse à un mail reçu (toutes les lignes d'avant) ; « relance »,
-- la relance d'un mail qu'elle a envoyé et resté sans réponse (portrait/unanswered-mails.ts), dont le message est le
-- sien. Une relance a les états du mail d'un inconnu (0084) : « Non », une ligne sans texte, ni question, ni
-- indications, close ; « Oui », une ligne avec ses indications, dont le passage suivant fait le premier appel. Son
-- texte ne se pose donc que par ecrire_inconnu (0084), ou ecrire_brouillon (0082) après ses réponses : une fois.
--
-- Un défaut constant : l'alter ne réécrit pas la table, et ses lignes prennent « reponse ».
alter table brouillons
  add column sorte text not null default 'reponse' check (sorte in ('reponse', 'relance'));

-- Aucun droit de plus pour l'app : la sorte s'écrit avec la ligne (insert, 0080) et ne change jamais ensuite.
