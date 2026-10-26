# Intégrations développeur

## Serveur MCP distant

Leon expose un serveur MCP HTTP à `https://<hôte-Leon>/api/mcp`. Un client MCP compatible avec OAuth 2.1 peut être configuré avec cette URL. Il découvre les métadonnées OAuth et ouvre Leon dans le navigateur pour la connexion et le consentement. Aucune copie de jeton personnel n'est nécessaire. Les jetons `leon_…` existants restent compatibles pour les clients qui ne prennent pas OAuth en charge.

Dans Claude Code, la commande est :

```sh
claude mcp add --transport http leon https://<hôte-Leon>/api/mcp
```

La même URL peut être saisie comme serveur MCP distant dans les autres clients. L'utilisateur doit autoriser l'accès à son espace Leon. Le serveur applique les droits de cet espace aux outils MCP.

### Implémentation

- `src/server/auth/auth.ts` configure le fournisseur OAuth MCP, les scopes et la ressource protégée.
- `src/server/api/mcp-routes.ts` valide le jeton OAuth puis résout le contexte de l'espace avant d'appeler les outils.
- `src/app/.well-known/` publie les métadonnées de ressource protégée.
- `src/app/(auth)/mcp/autorisation/` porte l'écran de consentement.
- `src/server/db/migrations/0034-mcp-oauth.sql` crée les tables OAuth et leurs droits de base de données.

Pour ajouter un outil, implémenter sa logique dans `src/server/mcp/tools/`, puis l'enregistrer dans `src/server/mcp/server.ts`. Les outils doivent utiliser le `TenantContext` fourni et ne jamais contourner les contrôles d'accès aux données.

## Variables et base de données

Le serveur OAuth utilise la configuration d'authentification existante, notamment `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` et la base PostgreSQL de Leon. Appliquer les migrations habituelles après déploiement. L'URL de ressource OAuth doit correspondre à l'adresse publique de l'instance et à son endpoint `/api/mcp`.

## CLI

Depuis le dépôt, installer la commande `leon` dans le PATH avec `pnpm link --global`. La commande `leon chat [dossier]` ouvre un chat interactif et indexe en mémoire les PDF, fichiers Office, CSV, TXT et Markdown du dossier (courant par défaut). Le classement local reste sur la machine et les fichiers ne sont pas téléversés.

Configurer `LEON_URL` et `LEON_TOKEN` dans l'environnement. Le jeton se crée dans Réglages > Jetons d'accès. Avant chaque requête qui a trouvé des passages locaux (ou dont l'historique peut contenir des réponses fondées sur des fichiers), le CLI affiche les fichiers concernés et demande une confirmation. Sans accord, il retire les extraits et l'historique de la requête, puis peut quand même chercher dans Leon. Avec accord, il envoie à `/api/cli/chat` la question, l'historique et au plus cinq extraits locaux pertinents. La route ne les écrit pas en base, mais les transmet au modèle Leon hébergé et peut aussi consulter les données SaaS de l'espace grâce aux outils de recherche et de lecture existants. La réponse et l'historique restent dans le processus local.

Le CLI conserve également les commandes `import-claude-code`, `briefing`, `capter-session` et `installer-crochets`. Voir `src/cli/leon.ts` pour l'aide à jour, `src/cli/local-documents.ts` pour les formats et limites d'indexation et `src/server/api/cli-routes.ts` pour le contrat du chat.
