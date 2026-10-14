# R4 : extension navigateur de Leon (12 octobre 2026)

Question : comment capter les conversations claude.ai / chatgpt.com / gemini.google.com de façon robuste, les envoyer à Leon, injecter un briefing, et passer les stores.

## 1. Approches de capture et robustesse

| Approche | Comment | Robustesse | Qui le fait |
|---|---|---|---|
| **DOM** (MutationObserver + sélecteurs) | Un content script observe les bulles de message | Faible : casse à chaque refonte CSS ; ChatGPT **virtualise** les longues conversations (messages absents du DOM) ; difficile de séparer réponse finale, raisonnement, outils, citations | mem0 (archivé), open-agentmemory (« si ça casse, vérifiez les sélecteurs dans `content/<site>.js` ») |
| **Interception réseau en monde MAIN** (`world: "MAIN"`, `run_at: document_start`, patch de `window.fetch`/XHR, `response.clone()`, lecture du flux SSE, `postMessage` vers le monde isolé) | On lit **ce que la page reçoit déjà**, structuré (rôles, ids de message, id de conversation) | Bonne : les API internes changent moins souvent que le CSS ; données structurées ; pas de requête supplémentaire. Fragilités : Gemini passe par XHR et un format `batchexecute` opaque ; le site peut détecter/neutraliser le patch ; obligation de gérer fetch **et** XHR | personal-ai-memory (parseurs SSE ChatGPT « delta-v1 », Claude, Gemini `StreamGenerate` + capture DOM passive en secours), openmem (patch fetch + « tee » du flux, POST vers un compagnon local sur `127.0.0.1:7410`) |
| **Appel des API privées du site** (`backend-api/conversation/{id}`, `chat_conversations/{id}`) avec les cookies/jetons de l'utilisateur | Récupère l'arbre complet, y compris branches régénérées | Complète mais **agressive** : c'est exactement la technique des 16 extensions malveillantes de 2025 (vol de jetons) ; déclenche anti-abus (Cloudflare, jetons sentinel) ; zone grise vis-à-vis des CGU | AIExporter, chatgpt-exporter |
| `webRequest` / `declarativeNetRequest` | MV3 | **Inutilisable** : ne lit pas les corps de réponse | — |
| `chrome.debugger` | CDP | Avertissement « lire et modifier toutes vos données », bloqué par les politiques d'entreprise depuis Chrome 155 (6 oct. 2026), rejet quasi certain en revue | — |
| **Exports** (claude.ai Settings > Privacy > Export, ChatGPT export) | ZIP par mail, lien valable 24 h, manuel | Bon pour une **reprise d'historique** une fois, pas pour du continu | openmem importe les exports ChatGPT, Claude et Takeout |
| **API de conformité Enterprise** | Claude Compliance API (mai 2026) : conversations, fichiers, projets, sessions Claude Code, activée par le Primary Owner seulement ; équivalent OpenAI pour ChatGPT Enterprise | Excellente et côté serveur, mais réservée aux plans Enterprise | WorkOS, Purview, CrowdStrike… |

Conclusion : il n'existe pas d'approche parfaite ; les projets sérieux (personal-ai-memory, openmem) convergent vers **réseau en MAIN + DOM en secours**, et les exports/API de conformité comme compléments.

## 2. Ce que les stores acceptent

**Chrome Web Store** (MV3 obligatoire). Points clés pour Leon :
- **Single purpose** et **Limited Use** durcis depuis le 1er août 2026 : toute donnée collectée doit être « strictly necessary to the extension's disclosed single purpose » ; interdiction de laisser des humains lire les données sans consentement explicite ; publication sur notre site d'une mention d'adhésion à la User Data Policy.
- **Divulgation proéminente** dans le produit avant toute collecte (« must not be located only in a privacy policy »), politique de confidentialité, transmission HTTPS.
- **Permissions minimales** : `host_permissions` limitées aux trois domaines, pas de `<all_urls>`, pas de `tabs`/`cookies`/`webRequest`/`debugger`. Les motifs larges et les développeurs nouveaux allongent la revue (quelques jours à quelques semaines).
- **Code distant interdit**, mais « loads and caches a remote configuration (for example a JSON file) » est explicitement autorisé : on peut servir les **sélecteurs et motifs d'URL** en JSON depuis Leon.
- Nouvelle interdiction 2026 des extensions qui contournent les garde-fous des services IA : lire passivement n'en relève pas, mais le libellé du store doit l'écarter clairement.
- Contexte : après l'affaire de décembre 2025 (extension « featured » interceptant des millions de conversations IA) et la campagne des 16 extensions voleuses de sessions ChatGPT, une extension qui lit chatgpt.com est scrutée.

**Firefox AMO** : consentement de collecte intégré obligatoire pour toute nouvelle extension depuis le 3 nov. 2025 (`browser_specific_settings.gecko.data_collection_permissions`, type « communications » requis) ; **code source non bundlé à fournir** (Vite ⇒ obligatoire, avec instructions de build et lockfile reproductibles) ; pas de code distant ; « leaking user-specific information … through native messaging is prohibited » sauf si c'est la fonction déclarée.

**Edge Add-ons** : même paquet Chromium, formulaire Partner Center (single purpose, justification par permission, usage de code distant, données), certification jusqu'à 7 jours ouvrés.

**Safari** : l'extension vit dans une app macOS Xcode, revue App Store ; le native messaging y est natif et sans fichier à installer, mais l'écosystème stagne (Lapcat, jan. 2026).

## 3. Recommandation ferme

1. **Framework : WXT** (Vite, TypeScript, MV3, un code pour Chrome/Edge/Firefox/Safari, publication automatisée, v0.21, maintenance hebdomadaire). Plasmo est en maintenance sans mainteneur depuis sept. 2025 ; CRXJS est Chromium seulement.
2. **Capture : réseau en MAIN d'abord, DOM en secours, jamais d'appel privé en notre nom.**
   - claude.ai et chatgpt.com : patch `fetch` + XHR en MAIN, `document_start`, `clone()` du flux SSE, parseur par site (Claude SSE ; ChatGPT delta-v1/JSON Patch), émission d'un événement « tour terminé » vers le monde isolé.
   - gemini.google.com : DOM en primaire (bulles `user-query` / `model-response` observées), XHR `StreamGenerate` en opportuniste.
   - Un **observateur DOM léger** partout, qui sert de contrôle de cohérence et de secours quand l'interception se tait.
   - Sélecteurs et motifs d'URL dans un **JSON de configuration versionné servi par Leon** (autorisé) pour corriger une casse sans repasser la revue ; télémétrie minimale « capture échouée sur site X » pour la détecter en heures.
   - Ne garder que `role ∈ {user, assistant}` et le texte final ; jeter raisonnement, appels d'outils, résultats de recherche, artefacts.
   - Pas d'appel à `backend-api` / `chat_conversations` avec les jetons de l'utilisateur au lancement (risque CGU et anti-abus). Reprise d'historique par **import des exports** officiels, comme openmem.
3. **Lien avec Leon : HTTPS direct, pas par l'agent local.** L'extension s'authentifie à Leon (device flow), met en tampon dans `chrome.storage`, envoie par lots. Raisons : les commerciaux et le support n'auront pas l'agent local ; le native messaging exige un manifeste d'hôte par navigateur (`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`, Firefox différent, Safari différent) et casse en entreprise. Le native messaging reste une option « poste géré » plus tard.
4. **Briefing : panneau latéral + bouton près de la zone de saisie, insertion sur clic seulement.** Insertion par `document.execCommand('insertText')` dans l'éditeur focalisé (ProseMirror sur ChatGPT et Claude, Quill sur Gemini), repli sur copie presse-papiers. Pas d'injection automatique : contraire au principe « single purpose » lisible et à la confiance.
5. **Navigateurs au départ : Chrome + Edge** (même paquet). **Firefox** ensuite (consentement intégré + dépôt du source). **Safari** en dernier (app Xcode, App Store).
6. **Consentement et RGPD dans le produit** : écran de consentement au premier lancement, interrupteur par site, « ne pas capter cette conversation » dans la page, pause globale, fenêtres privées ignorées, filtre secrets/PII côté extension avant envoi, rappel que la conversation brute reste privée à l'auteur (voir besoins.md). C'est ce que Conxt met en avant (purge des textes bruts sous 30 jours, blocage des secrets).
7. **Pour les clients Enterprise** : connecteur serveur sur la **Claude Compliance API** (et l'équivalent OpenAI) à la place de l'extension : zéro poste à équiper, et un argument de vente.

## 4. Risques

- **Changements d'interface et d'API** : certains, continus ; Gemini le plus fragile. Mitigation : config JSON distante, deux voies de capture, tests end-to-end quotidiens sur les trois sites avec des comptes de test.
- **Détection du patch en MAIN** par le site (la page « can access and interfere with the injected script ») ; ChatGPT pourrait durcir. Pas de parade garantie ; le DOM de secours limite la casse.
- **Revue store** : délais imprévisibles, rejet possible sur la formulation ; prévoir vidéo de démonstration, compte de test, texte de single purpose rédigé avant le code.
- **Zone grise CGU** d'OpenAI/Anthropic/Google : lecture passive dans le navigateur de l'utilisateur, mais à faire relire juridiquement.
- **Attaque de la chaîne** : une extension qui lit des conversations IA est une cible ; signer les builds, 2FA sur les comptes store, pas de dépendance exotique.
- **RGPD employeur/employé** : consentement individuel, information du personnel, exclusion des conversations perso.

## 5. Non vérifié

- Le détail de l'API de conformité OpenAI (doc inaccessible, 403/404) ; son existence pour ChatGPT Enterprise est de mémoire.
- Le format exact de l'export ChatGPT (page 403) : `conversations.json`, de mémoire.
- La version minimale de Firefox et Safari pour `world: "MAIN"` (table MDN non chargée) ; WXT l'abstrait mais à tester.
- Le fonctionnement interne de Glean et de l'extension Grammarly (pages inaccessibles) ; Grammarly présente l'app desktop et l'extension comme deux produits indépendants, ce qui conforte le choix « HTTPS direct ».
- Le code source de Conxt, Maximem, LLM Context Bridge, RememberMyContext, Kontxt : non trouvé ; Conxt se décrit comme fermé.
- La résistance réelle de ChatGPT au patch de fetch en octobre 2026 (à tester en premier sprint).

## Sources

- https://github.com/marswangyang/personal-ai-memory · https://github.com/arunrajiah/openmem · https://github.com/mem0ai/mem0-chrome-extension (archivé 23/03/2026) · https://github.com/ChillingWombat/open-agentmemory-extension · https://github.com/GrantTotinov/AIExporter · https://www.conxt.dev/
- https://dev.to/wilow445/how-to-intercept-server-sent-events-in-chrome-extensions-mv3-guide-23kb
- https://developer.chrome.com/blog/cws-policy-updates-2026 · https://developer.chrome.com/docs/webstore/program-policies/policies · https://developer.chrome.com/docs/webstore/program-policies/limited-use · https://developer.chrome.com/docs/webstore/program-policies/user-data-faq · https://developer.chrome.com/docs/webstore/review-process · https://developer.chrome.com/docs/extensions/develop/migrate/improve-security · https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts · https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging · https://developer.chrome.com/blog/debugger-enterprise-policy-restrictions
- https://extensionworkshop.com/documentation/publish/add-on-policies/ · https://extensionworkshop.com/documentation/publish/source-code-submission/ · https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension · https://lapcatsoftware.com/articles/2026/1/1.html
- https://wxt.dev/ · https://dev.to/extensionbooster/plasmo-vs-crxjs-vs-wxt-which-chrome-extension-framework-should-you-use-in-2026-37o4
- https://www.securityweek.com/chrome-edge-extensions-caught-stealing-chatgpt-sessions/ · https://thehackernews.com/2025/12/featured-chrome-browser-extension.html
- https://workos.com/blog/audit-logs-ai-agents-claude-compliance-api · https://securityboulevard.com/2026/05/anthropic-expands-claude-compliance-api-with-28-enterprise-security-integrations/ · https://support.claude.com/en/articles/9450526-how-can-i-export-my-claude-data · https://www.grammarly.com/desktop
