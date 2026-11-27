-- 0094-langue-du-compte.sql : la langue que la personne choisit (Réglages > Profil, ou le choix de langue d'une page)
-- se garde avec son compte. Elle ne vivait que dans le cookie leon-locale de son navigateur : un autre navigateur, un
-- autre appareil ou des cookies effacés, et Leon repassait en anglais à la connexion suivante. Son point du matin
-- s'écrit dans cette langue, quelle que soit celle de ses sessions et de ses mails (briefing-prompt.ts).
-- Null : jamais choisie ; l'écran suit alors le cookie, et le point la langue de ses sessions, comme avant.
alter table "user" add column "locale" text check ("locale" in ('fr', 'en'));
