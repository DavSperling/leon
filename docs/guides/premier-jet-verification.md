# Vérification manuelle du premier jet

À cocher par Amos ou David, dans l'ordre. Chaque case décrit ce qu'on fait puis ce qu'on doit voir. Une case qui échoue : noter l'écart et la sortie de la commande dans la PR concernée.

Prérequis : le dépôt à jour de `main`, `.env.local` renseigné (voir `.env.example`).

- [ ] **1. Démarrage.** `docker compose up -d`, puis `pnpm db:migrate`, puis `pnpm dev`. Ouvrir `http://localhost:3000/inscription` et créer l'espace : on arrive dans l'application, avec une organisation.
- [ ] **2. Jeton.** Dans Réglages, « Créer un jeton ». Copier le jeton affiché dans `.env.local`, variable `LEON_TOKEN`.
- [ ] **3. Import Claude Code.** `pnpm -s leon import-claude-code --project <chemin> --since <date> --dry-run` : relire la liste des envois (une ligne JSON par envoi, rien n'est envoyé). Puis relancer sans `--dry-run`. Vérifier la page Sources, puis l'arbre des fiches.
- [ ] **4. Claude Code via MCP.** `claude mcp add --transport http leon http://localhost:3000/api/mcp --header "Authorization: Bearer <jeton>"`. Dans une session, poser une question dont la réponse est connue de Leon : Claude Code doit appeler `search` puis `fetch`, et la lecture doit apparaître dans Journal. Ajouter ensuite le hook `SessionStart` du README : une nouvelle session connaît le briefing sans appeler d'outil ; lui demander ce que Leon lui a donné au démarrage.
- [ ] **5. Extension.** `pnpm ext:build`. Dans `chrome://extensions`, activer le mode développeur, puis « Charger l'extension non empaquetée » et choisir `extension/.output/chrome-mv3`. Le consentement s'ouvre dans un onglet. Dans les options : l'adresse du serveur s'affiche, le jeton se saisit, « Tester la connexion » répond. Avant l'accord, un échange sur claude.ai n'apparaît nulle part.
- [ ] **6. claude.ai.** Envoyer un échange contenant une information datée, par exemple « Le devis ACME passe à 12 000 € HT à partir du 1er novembre ». La popup indique la capture ; la source apparaît dans Sources ; le fait arrive dans la fiche, marqué « à partir du 1 nov. 2026 » ; Claude Code le retrouve via MCP.
- [ ] **7. chatgpt.com.** Même parcours qu'à l'étape 6.
- [ ] **8. Confidentialité.** Une fenêtre privée ne capte rien. « Mettre en pause » dans la popup coupe la capture. Coller dans un message une clé factice `sk-ant-test-1234567890abcdef` et une ligne `DB_PASSWORD=hunter2hunter2` : elles arrivent masquées (onglet Brut, ou base), la clé remplacée par `[secret masqué]` et la ligne devenue `DB_PASSWORD=[secret masqué]`. Révoquer le jeton dans Réglages : la popup passe à « Jeton refusé ».
- [ ] **9. Droits.** Un fait sensible (« Paul part en arrêt maladie lundi ») reste « Privé (vous) » et apparaît dans « À vérifier ». Un second compte, dans une autre organisation, ne voit rien du premier : ni l'arbre, ni la recherche, ni MCP.
- [ ] **10. Panneau latéral.** Le briefing s'affiche ; « Copier » copie le texte dans le presse-papiers.
</content>
