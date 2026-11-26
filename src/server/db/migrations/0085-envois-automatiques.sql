-- 0085-envois-automatiques.sql : un mail reçu envoyé par une machine ou en nombre (lettre d'information, prospection,
-- notification), reconnu à la relève Gmail sans modèle ni requête de plus, d'après ses en-têtes, ses libellés et
-- l'adresse de son expéditeur (connectors/gmail/map.ts). Seul ce fait se garde, sur son tour : aucun en-tête. L'agent
-- « Brouillons de réponse » ne propose le mail d'un inconnu que s'il est marqué « pas automatique »
-- (portrait/waiting-mails.ts). Nul quand on ne sait pas : un tour relevé avant, un tour qui n'est pas un courrier, un
-- mail qu'elle a envoyé, un mail d'Outlook. Lu et écrit comme le reste du tour (sécurité par ligne et droits de 0003) ;
-- seule l'ingestion des connecteurs le remplit.
--
-- Nul et sans défaut, comme injecte (0061) : l'alter ne réécrit pas la table, la plus grosse, et ne relit aucune ligne.
-- `lock_timeout`, comme en 0075 : sans le verrou en 5 s, la migration échoue et se relance, plutôt que de bloquer
-- derrière elle toutes les lectures de turns.
set local lock_timeout = '5s';

alter table turns add column automated boolean;
