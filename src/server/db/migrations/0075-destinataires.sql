-- 0075-destinataires.sql : les destinataires d'un courrier, sur son tour. Deux listes d'adresses, « à » et « copie »,
-- lues par Gmail (en-têtes To et Cc) et Outlook (toRecipients, ccRecipients) : des adresses seules, en minuscules,
-- sans les noms (le minimum sur des tiers), jamais la copie cachée. La fiche d'une personne les lira pour savoir à qui
-- elle écrit. Vides pour tout ce qui n'est pas un courrier, et pour les courriers déjà relevés : l'historique n'est pas
-- rattrapé ici. Lues et écrites comme le reste du tour (sécurité par ligne et droits de 0003) ; seule l'ingestion des
-- connecteurs les remplit.
--
-- Le migrateur applique ce fichier en une transaction : le verrou exclusif de l'alter tient jusqu'au commit. Un défaut
-- constant ne réécrit pas la table, la plus grosse, et `not valid` évite de la relire : chaque ligne déjà là porte le
-- défaut, qui respecte la contrainte. Elle vaut pour toute écriture neuve. `lock_timeout`, comme en 0069 : sans le
-- verrou en 5 s (une longue transaction sur turns), la migration échoue et se relance, plutôt que de bloquer derrière
-- elle toutes les lectures de turns.
set local lock_timeout = '5s';

-- Les bornes : 100 adresses au plus par liste et 32 000 caractères en tout (100 × 320). La longueur de chaque adresse
-- est tenue par la normalisation (normalize.ts).
alter table turns
  add column recipients_to text[] not null default '{}',
  add column recipients_cc text[] not null default '{}',
  add constraint turns_recipients_check check (
    cardinality(recipients_to) <= 100 and char_length(array_to_string(recipients_to, '')) <= 32000
    and cardinality(recipients_cc) <= 100 and char_length(array_to_string(recipients_cc, '')) <= 32000
  ) not valid;
