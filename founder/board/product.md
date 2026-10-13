# Lentille Produit
Score : 4/10 | Vote : FUND IF

## Ce qui est fort

- **La seule chose à faire brillamment est déjà nommée.** La démo « une info dite à ChatGPT lundi, retrouvée dans Claude mardi, sans rien faire » est un moment produit net, que personne d'autre ne propose. Tout le reste du brief (connecteurs SaaS, chatbot, arborescence façon éditeur de code) est du bruit autour de ce moment.
- **Le pitch tient en une phrase** : « la mémoire d'entreprise qui se remplit toute seule ». Clair pour nous. Pas prouvé pour un dirigeant de PME, qui, selon le brief, ne sait pas ce qu'est une mémoire organisationnelle. La phrase qu'il comprend est « demandez à votre Claude l'historique d'un client ».
- **L'ordre de construction est le bon** : conversations LLM d'abord. La focalisation est sous les yeux des fondateurs.

## Ce qui peut tuer l'idée

1. **La règle d'ACL contredit la promesse.** « L'ACL d'un fait est l'intersection des droits de ses preuves ; par défaut, seul l'auteur y accède. » Une conversation ChatGPT n'a qu'un auteur. Par défaut, la mémoire « d'équipe » est donc personnelle : la démo lundi/mardi ne marche que pour la même personne. Le dirigeant n'aura pas l'historique client capté chez son commercial sans partage manuel, que ni les LLM ni les humains paresseux ne feront. Soit la règle change, soit c'est un Supermemory automatique, pour une personne.

2. **Huit coutures pour deux personnes.** Agent local en Rust (que personne ne connaît, qui doit capter au fil de l'eau sous 30 jours), extension navigateur (casse à chaque changement d'interface), connecteurs serveur, audit Google CASA dès le jour 1, configuration MCP par poste et par LLM, injection du briefing (le brief ne dit ni par quel mécanisme ni qui la déclenche), ACL par fait, onboarding « en une journée ». À chaque couture, le client voit un trou dans la mémoire sans savoir pourquoi. Une mémoire trouée perd la confiance plus vite qu'une mémoire vide.

3. **Les cinq premières minutes sont vides, ou hostiles.** Pour le dirigeant : installer un programme et une extension sur chaque poste, configurer MCP, attendre. Rien à montrer avant l'import d'historique. Pour l'employé : un programme de l'entreprise lit ses conversations ChatGPT. Premier sentiment : la surveillance. Le brief classe le consentement en « non su » ; pour la lentille Produit, c'est l'écran numéro un, et il n'est pas conçu.

## Les questions que je poserais aux fondateurs

- Si vous ne pouviez livrer qu'un seul écran, lequel ? Si ce n'est pas le briefing injecté, pourquoi construire le reste ?
- Démontrez lundi/mardi sur vos deux postes. Combien de minutes entre l'installation et le premier fait restitué ?
- Que voit l'employé la première fois que Leon lit sa conversation ?
- Quelle part des faits captés est fausse ? Un seul faux « il paie encore » détruit la confiance du dirigeant.
- « Design pas prioritaire » : dans un produit invisible, le design est l'installation, le consentement et le briefing. Lequel des trois livrez-vous brut ?
- Que valez-vous le jour où OpenAI ou Anthropic bloque l'extension, ou livre sa propre mémoire d'équipe ?

Nombres manquants : prix accepté pour le seul briefing (/founder-pricing) ; part des employés qui refusent la capture (/founder-consumer) ; tenue de l'extension face aux changements d'interface (/founder-competitors, /founder-cfo).

## Si FUND IF : les conditions

- **La v1 est une seule chose** : capture des conversations LLM + briefing injecté. Aucun connecteur SaaS, pas de CASA, pas de chatbot, pas d'arborescence avant un pilote qui reste trois mois.
- **Le briefing et l'écran de consentement sont conçus, pas bruts.** « SaaS brut » vaut pour le tableau de bord, pas pour les deux surfaces vues chaque jour.
- **L'ACL par défaut permet la mémoire d'équipe** sur les faits non sensibles, sinon le produit n'est pas celui du pitch.
- **Pas de Rust** tant que personne dans l'équipe ne le lit.
- **La démo lundi/mardi tourne chez les fondateurs avant tout pilote**, délai mesuré.

Sur la tension entre « le produit est la mémoire unifiée complète » et la focalisation qu'exige la lentille : la mémoire complète est la vision ; le produit est ce qui marche brillamment chez le premier client, soit une seule couture bien faite. Si les fondateurs refusent cette réduction, la lentille Produit passe.
