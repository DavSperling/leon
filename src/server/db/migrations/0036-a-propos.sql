-- Ce que l'utilisateur dit de lui (Réglages > Profil), lu par son point du matin. 500 caractères au plus.
alter table "user" add column "about" text check (char_length("about") <= 500);
