# Annexe 6 : coûts mesurés du pipeline sur de vraies conversations

14 octobre 2026 · David (avec Claude) · à relire par Amos

Premiers chiffres réels du pipeline du premier jet (PR #8) : tri, extraction des faits, rangement en fiches. Ils complètent l'étude, qui reposait sur des estimations, et viennent d'essais sur les sessions Claude Code de David dans le projet Leon.

## D'où vient chaque chiffre

Chaque nombre porte une étiquette de source :

- **[P]** page officielle des tarifs d'Anthropic, https://platform.claude.com/docs/en/about-claude/pricing, consultée le 14/10/2026 ;
- **[M]** mesuré : l'usage (tokens d'entrée, de sortie, de cache) renvoyé par l'API pour chaque appel, multiplié par les tarifs [P]. Pour l'essai 4, ce sont les lignes `llm.usage` que le pipeline journalise ;
- **[C]** compté : les prompts réellement envoyés, reconstruits avec le code du pipeline et comptés par l'endpoint gratuit `count_tokens` ;
- **[E]** estimé : un calcul à partir des chiffres ci-dessus, avec son hypothèse écrite à côté ;
- **[D]** chiffre donné par David (lu dans la console Anthropic).

## Les tarifs utilisés

Ce sont ceux de l'[annexe 1](01-prix-llm.md), revérifiés le 14/10 sur la page officielle [P] et inchangés depuis le 12/10. En dollars par million de tokens :

| Modèle | Entrée | Sortie | Lecture du cache | Écriture du cache (5 min) | Lot (Batch) entrée / sortie |
|---|---|---|---|---|---|
| Haiku 5.5, prompt ≤ 100 000 tokens | 0,10 | 0,50 | 0,01 | 0,125 | 0,05 / 0,25 |
| Haiku 5.5, prompt > 100 000 tokens | 0,50 | 2,50 | 0,05 | 0,625 | 0,25 / 1,25 |
| Sonnet 5.5 | 2 | 10 | 0,10 | 2,50 | 1 / 5 |
| Opus 5.5 | 4 | 20 | 0,20 | 5 | 2 / 10 |

Dans le code, ces tarifs servent à estimer le coût de chaque appel : constante `PRICE_PER_MTOK` de `src/server/llm/anthropic-llm.ts` (branche `david/qualite-pipeline`). L'annexe 1 reste la référence : si un tarif change, on la met à jour d'abord, puis la constante.

## Les données de l'essai

- 16 sessions Claude Code de David dans le projet Leon, du 11 au 14/10/2026 (4 jours, le 14 incomplet), soit 651 tours et 733 000 caractères après le filtre mécanique [M, base locale].
- Ce sont des journées de recherche, avec des équipes d'agents : probablement plus chargées que celles d'un salarié type.

## Avant optimisation : où partait l'argent

Pipeline d'origine : tri par Haiku 5.5, extraction par Sonnet 5.5 en effort `medium`, rangement par Opus 5.5 en effort `high`.

| Étape | Appels | Tokens d'entrée [C] | Coût de l'entrée [E] |
|---|---|---|---|
| Tri (Haiku 5.5) | 18 | 328 000 | 0,03 $ |
| Extraction (Sonnet 5.5) | 27 | 422 000 | 0,84 $ |
| Rangement (Opus 5.5) | 18 | 276 000 | 1,11 $ |

Coût d'un passage complet : environ **3,30 $** [E]. Hypothèse : l'entrée [C], plus la sortie extrapolée à partir de l'échantillon mesuré ci-dessous. L'usage réel n'était pas encore journalisé.

## L'expérience : quel modèle, quel effort

Même échantillon pour chaque réglage : 6 fenêtres d'extraction et 3 lots de rangement de 8 à 20 candidats, avec les prompts du pipeline. Tous les coûts sont mesurés [M].

### Extraction (6 fenêtres)

| Réglage | Coût | Faits gardés | Citations retrouvées mot pour mot |
|---|---|---|---|
| Sonnet 5.5 `medium` (avant) | 0,321 $ | 44 | 97 % |
| Sonnet 5.5 `low` | 0,278 $ | 29 | 93 % |
| Haiku 5.5 `medium` | 0,019 $ | 18 | 62 % |
| Haiku 5.5 `low` | 0,012 $ | 13 | 69 % |
| Haiku 5.5 `medium`, consigne de citation courte | 0,019 $ | 26 | 62 % |

Haiku 5.5 invente des citations, que la vérification rejette. L'extraction reste donc sur Sonnet 5.5.

### Rangement (3 lots, 24 décisions)

| Réglage | Coût | Même décision qu'Opus `high` |
|---|---|---|
| Opus 5.5 `high` (avant) | 0,298 $ | référence |
| Opus 5.5 `low` | 0,289 $ | 24 / 24 |
| Sonnet 5.5 `medium` | 0,146 $ | 24 / 24 |
| Sonnet 5.5 `low` | 0,145 $ | 23 / 24 |
| Haiku 5.5 `medium` | 0,009 $ | 24 / 24 |
| Haiku 5.5 `high` | 0,009 $ | 24 / 24 |

Baisser l'effort ne change presque rien au coût : c'est l'entrée qui pèse, pas la réflexion. Le rangement passe sur Haiku 5.5 `medium`. L'échantillon est petit (24 décisions) : à resurveiller sur un plus gros volume.

## Après optimisation : essai 4

Les changements :
- rangement sur Haiku 5.5 ;
- consignes mises en cache ;
- extraction limitée aux tours que le tri désigne comme utiles, avec leurs voisins.

Tout est mesuré [M] par les lignes `llm.usage`, sur 14 lots sur 17. Les 3 autres ont échoué : 2 faute de crédit, 1 refusé par le modèle.

| Étape | Appels | Entrée | Sortie | Cache lu | Coût |
|---|---|---|---|---|---|
| Tri (Haiku 5.5) | 20 | 335 012 | 5 939 | 22 876 | 0,037 $ |
| Extraction (Sonnet 5.5) | 17 | 178 451 | 47 646 | 52 860 | 0,856 $ |
| Rangement (Haiku 5.5) | 13 | 74 134 | 32 981 | 25 008 | 0,024 $ |
| **Total** | 50 | | | | **0,917 $** |

- Pour le passage complet, environ **1,05 $** [E], en supposant que les 3 lots manquants coûtent autant par tour que les autres.
- L'extraction fait maintenant 93 % du coût, dont plus de la moitié en sortie : Sonnet écrit en entier les propositions et suppositions que le code rejette ensuite.
- **Qualité :** 87 faits gardés sur 14 lots, contre 144 sur 16 lots à l'essai précédent. La part de la sélection des tours dans cette baisse reste à mesurer sur les lots complets.

## Essai 6 : passage complet, sélection corrigée

L'essai 4 sélectionnait les tours **utiles**. Au passage complet suivant (0,99 $ [M], 94 faits), les faits sur les concurrents avaient disparu : les rapports d'agents coéquipiers qui les portaient n'avaient pas été désignés utiles par le tri. La sélection a donc été inversée : le tri désigne le **bruit**, et tout le reste passe à l'extraction. Un oubli du tri coûte maintenant un peu plus cher, mais ne fait plus perdre de faits.

Passage complet : 672 tours, 16 lots sur 17 (le dernier est une session d'agent refusée par Haiku au tri), tout mesuré [M] :

| Étape | Appels | Entrée | Sortie | Cache lu | Coût |
|---|---|---|---|---|---|
| Tri (Haiku 5.5) | 21 | 348 643 | 8 399 | 23 940 | 0,040 $ |
| Extraction (Sonnet 5.5) | 27 | 325 031 | 72 081 | 88 325 | 1,397 $ |
| Rangement (Haiku 5.5) | 17 | 116 770 | 48 264 | 35 428 | 0,036 $ |
| **Total** | 65 | | | | **1,47 $** |

Qualité :
- **137 faits gardés**, contre 144 avant optimisation ;
- **40 faits sur les concurrents** ;
- les salaires des fondateurs sont classés sensibles par l'extraction (puis rejetés comme hypothèses) : rien de sensible n'est passé à l'équipe.

Le gain vient surtout du rangement sur Haiku. La sélection ne retire plus que 23 % de l'entrée de l'extraction, qui fait maintenant 95 % du coût.

## Par collaborateur et par mois

Ces chiffres sont des estimations [E]. Hypothèses : 4 jours de données, 21 jours ouvrés par mois, une seule personne au profil de dev chargé.

| | Par jour | Par mois |
|---|---|---|
| Pipeline d'origine | ~0,83 $ | **~17 $** |
| Essai 4 (sélection des tours utiles, perte de faits) | ~0,26 $ | ~5,50 $ |
| **Essai 6 (bruit écarté, sans perte de faits)** | **~0,37 $** | **~7,70 $** |
| Étude, profil dev, cascade R2b (pour comparaison) | | 3,46 $ |
| Étude, profil dev, Opus partout (pour comparaison) | | 19,03 $ |

## Ce qu'ont coûté les essais du 14/10

Environ 9 $ jusqu'à l'essai 4 [D], puis 2,46 $ pour les essais 5 et 6 [M]. Le détail :

| Poste | Coût | Source |
|---|---|---|
| Passage complet lancé par erreur avec l'ancien code (serveur non redémarré) | ~3,30 $ | [E] |
| Passage complet avec les corrections de qualité | ~3,30 $ | [E] |
| Expérience modèles et efforts | 1,56 $ | [M] |
| Passage optimisé (essai 4, 14 lots) | 0,92 $ | [M] |
| Passage complet, sélection des tours utiles (essai 5) | 0,99 $ | [M] |
| Passage complet, bruit écarté (essai 6) | 1,47 $ | [M] |

## Leviers suivants

1. **API par lots (Batch)** pour l'extraction : −50 % sur toute l'étape [P]. Le résultat arrive en quelques minutes à quelques heures, ce qui convient à l'import d'historique.
2. **Ne plus faire écrire les propositions et suppositions** : moins de sortie Sonnet. Il faut vérifier qu'aucune recommandation ne repasse en fait.
3. **Mesurer un profil de salarié type**, et pas seulement des journées de recherche à plusieurs agents.
