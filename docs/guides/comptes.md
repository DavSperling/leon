# Sécurité des comptes

Leon utilise Better Auth sur PostgreSQL. La récupération de mot de passe envoie un lien par Resend. Configurez `RESEND_API_KEY` et `LEON_EMAIL_FROM` (par exemple `Leon <noreply@exemple.fr>`) dans l'environnement du serveur pour activer l'envoi. Sans ces deux variables, l'écran de connexion ne propose pas « Mot de passe oublié ? ». Le formulaire ne révèle jamais si l'adresse existe. Le lien vaut une heure et sert une fois ; la base n'en garde que l'empreinte. Changer de mot de passe ferme toutes les sessions.

La double authentification se configure dans **Réglages → Sécurité** avec une application compatible TOTP. L'utilisateur confirme un code avant l'activation, qui ferme ses autres sessions. Les codes de secours ne sont montrés qu'à cette étape, ou quand l'utilisateur en demande de nouveaux (avec son mot de passe), et doivent être conservés hors de Leon. À la connexion, « Téléphone perdu ? » accepte un code de secours à la place du code de l'application ; chacun ne sert qu'une fois.

Les migrations (`0035-securite-compte.sql`) s'appliquent seules sur Railway, avant le démarrage de la nouvelle version (`preDeployCommand` de `railway.json`). Ailleurs : `pnpm db:migrate`.
