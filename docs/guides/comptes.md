# Sécurité des comptes

Leon utilise Better Auth sur PostgreSQL. Après la migration, la récupération de mot de passe envoie un lien par Resend. Configurez `RESEND_API_KEY` et `LEON_EMAIL_FROM` (par exemple `Leon <noreply@exemple.fr>`) dans l'environnement du serveur pour activer l'envoi. Le formulaire ne révèle jamais si l'adresse existe.

La double authentification se configure dans **Réglages → Sécurité** avec une application compatible TOTP. L'utilisateur confirme un code avant activation ; les codes de secours ne sont montrés qu'à cette étape et doivent être conservés hors de Leon.

Appliquez les migrations de la base avec `pnpm db:migrate` après le déploiement de cette version.
