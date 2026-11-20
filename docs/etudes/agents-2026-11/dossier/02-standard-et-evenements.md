# 02. Le standard et les événements

20 novembre 2026 · chapitre du dossier de conception · à relire par David et Amos

> Brouillon en cours d'écriture (reprise possible). Sections écrites : 1, 2. Les autres suivent, une à une.

Ce chapitre suit `00-architecture.md`. Il recopie ses noms. Il ne redéfinit ni table, ni type, ni file d'un autre chapitre : il les cite. Convention : **existe** (chemin et ligne, lus le 20/11/2026), **à créer**, **à vérifier**.

Rien n'a été lancé : ni serveur, ni test, ni migration.

## 1. Ce que ce chapitre fixe

1. **Le point d'émission.** `emitIndexed` et ses trois abonnés (point du matin, liaison, standard), à la place des deux appels de `src/server/search/index-run.ts:153-154`.
2. **L'entrée du standard.** `signalStandard` et ses quatre conditions (membre, âge, branchement, expéditeur), la table `evenements` vue du code (`events/store.ts`), le rattrapage par `runs_a_signaler`.
3. **Les règles déterministes.** `applyRules` et `isOwnWrite` : un tableau outil par outil et nature par nature, puis le code. La règle « participants ».
4. **Le routage.** `routeEvent` : étiquette, fiches, activations, plafonds, exécutions ; l'exécution d'un agent d'équipe écrite sous le contexte de son activateur.
5. **Après le jalon 1.** La consigne et le schéma du tri par le modèle (`triageOne`, `triageBatch`, file `standard-lot`), les déclencheurs d'horloge (`agent-horloge`), les veilles (`agent-veilles`). Et le texte de l'amendement à la décision du 19 octobre, prêt à signer.

Il ne refait pas : le moteur (chapitre 04), les fiches (chapitres 08 et 09), le SQL des tables et des fonctions (chapitre 01), le budget (chapitres 01 et 11), `needsClick` et la provenance (chapitre 06), la liste des étiquettes (architecture, 8.4).

## 2. Vue d'ensemble

(à écrire)

## Tests à écrire

(à écrire)

## Ordre de mise en œuvre

(à écrire)

## Écarts avec l'architecture

(à écrire)

## Ce que je n'ai pas vérifié

(à écrire)
