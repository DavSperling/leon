# L'essai des coulisses : Codex, Cursor, Antigravity

Le but : voir comment chaque outil écrit, dans ses fichiers, la réflexion de l'agent, ses sous-agents et ses commandes. Pour chaque outil, vous faites dix minutes d'essai devant l'appli, dans un dossier jetable au contenu inventé. Ensuite, je lance un petit script qui ne relève que la forme des fichiers (des noms de champs, des longueurs, des comptes), jamais un texte. Puis on efface tout.

## Valable pour les trois outils

- **Le dossier d'essai porte le mot `leon-essai-coulisses` dans son nom.** C'est ce qui permet au script de refuser tout autre fichier.
- **Entre le début d'un essai et la fin de son ménage,** n'ouvrez aucune nouvelle session de Claude Code ou de Codex ailleurs, et aucune nouvelle conversation dans Cursor ou Antigravity. Évitez aussi `/clear` dans une session Claude Code ouverte. Tout cela relance le rattrapage de Leon, qui pourrait envoyer la session d'essai. Une compaction automatique d'une session ouverte le relance aussi : faites l'essai et le ménage d'une traite.
- **Si l'agent veut appeler un outil de Leon, refusez.**
- **Les deux messages à coller**, les mêmes partout :

Message 1 :

```
C'est un essai. Ne modifie aucun fichier.
1. Lance un sous-agent avec cette consigne exacte : « Lis seulement le fichier a.txt de ce dossier, puis réponds en une phrase ce qu'il dit. N'utilise aucun autre outil. » Attends son rapport.
2. Lance un second sous-agent avec cette consigne exacte : « Va chercher la page web https://example.com et donne son titre. » Attends son rapport.
3. Réponds en deux phrases : ce que chaque sous-agent a rapporté.
```

Message 2, une fois la réponse au premier arrivée :

```
Lance la commande ls fichier-absent.txt, puis la commande curl -sI https://example.com. Dis ensuite en une phrase ce qui s'est passé pour chacune.
```

- **Les autorisations.** Si l'outil demande la permission pour `curl` : **refusez**. S'il la demande pour le second sous-agent (la page web) : acceptez. S'il lance tout sans rien demander, notez-le.
- **À me dire après chaque essai :** la version de l'outil, le modèle choisi, si l'agent a vraiment lancé des sous-agents, et ce qui s'est passé pour `curl`. Le script ne recopie ni le nom du modèle ni la version : seul ce que vous me dites les donne.

## Codex (dans le Terminal)

1. Créez le dossier d'essai, et un second dossier qui servira de dossier de Codex rien que pour l'essai :

   ```
   mkdir ~/leon-essai-coulisses-codex ~/leon-essai-coulisses-codex-home
   cd ~/leon-essai-coulisses-codex && git init -q && echo "Le chat de l'essai s'appelle Pistache." > a.txt
   ```

2. Lancez Codex sur ce dossier, avec la recherche web et une réflexion détaillée :

   ```
   CODEX_HOME="$HOME/leon-essai-coulisses-codex-home" codex --search -c model_reasoning_summary=detailed
   ```

   Codex ne connaît pas encore ce dossier : il demande de vous connecter (dans le navigateur, comme d'habitude), puis s'il peut faire confiance au dossier : oui.
3. Collez le message 1, puis le message 2. Si Codex répond qu'il ne sait pas lancer de sous-agent : tapez `/experimental`, activez ce qui parle de sous-agents ou de « multi-agents » s'il y en a, et recollez le message 1. S'il n'y a rien, continuez : l'essai le notera.
4. Quittez avec `/quit`, puis `codex --version` me donne la version.

**Pourquoi rien ne part vers Leon.** Le dossier `~/leon-essai-coulisses-codex-home` remplace le dossier de Codex le temps de cette commande seulement : Codex n'y trouve pas les crochets de Leon, et le rattrapage de Leon cherche les sessions de Codex dans `~/.codex`, pas là. Ne tapez pas `export CODEX_HOME=…` : le mot reste sur la ligne de la commande `codex`.

**Ce que je lance après :**

```
node /private/tmp/claude-501/-Users-amoskoskas-leon--claude-worktrees-lot14-memoire-leon-ade414/95b54b88-25ab-4d97-ad89-ad83d4817957/scratchpad/pr4-essais/codex-coulisses.mjs /Users/amoskoskas/leon-essai-coulisses-codex-home /Users/amoskoskas/leon-essai-coulisses-codex
```

**Le ménage**, après mon relevé (la déconnexion efface la connexion rangée dans ce dossier) :

```
CODEX_HOME="$HOME/leon-essai-coulisses-codex-home" codex logout
rm -rf /Users/amoskoskas/leon-essai-coulisses-codex /Users/amoskoskas/leon-essai-coulisses-codex-home
```

## Cursor

1. Mettez de côté les crochets de Cursor le temps de l'essai, puis créez le dossier :

   ```
   [ -f ~/.cursor/hooks.json ] && mv ~/.cursor/hooks.json ~/.cursor/hooks.json.pause-essai
   mkdir ~/leon-essai-coulisses-cursor && cd ~/leon-essai-coulisses-cursor && git init -q && echo "Le chat de l'essai s'appelle Pistache." > a.txt
   ```

2. Quittez Cursor complètement (Cmd+Q) et rouvrez-le : il ne relit ses crochets qu'au lancement. Ouvrez le dossier `leon-essai-coulisses-cursor`.
3. Ouvrez une nouvelle conversation avec l'agent, en mode Agent, et choisissez un modèle qui affiche sa réflexion (marqué « thinking », ou avec l'icône de cerveau).
4. Collez le message 1, puis le message 2. La version est dans le menu Cursor, « À propos de Cursor ».
5. Fermez la fenêtre du dossier d'essai.

**Pourquoi rien ne part vers Leon.** Les crochets de Leon pour Cursor sont dans `~/.cursor/hooks.json`, mis de côté. Cursor lance aussi ceux de Claude Code, mais Leon les fait taire quand c'est Cursor qui les lance. Reste le rattrapage de Leon : il relirait la session d'essai au prochain démarrage d'un outil. D'où la règle du début, et le ménage tout de suite après mon relevé.

**Ce que je lance après :**

```
node /private/tmp/claude-501/-Users-amoskoskas-leon--claude-worktrees-lot14-memoire-leon-ade414/95b54b88-25ab-4d97-ad89-ad83d4817957/scratchpad/pr4-essais/cursor-coulisses.mjs /Users/amoskoskas/.cursor/projects/Users-amoskoskas-leon-essai-coulisses-cursor
```

**Le ménage**, dans cet ordre (les crochets reviennent en dernier) :

```
rm -rf /Users/amoskoskas/.cursor/projects/Users-amoskoskas-leon-essai-coulisses-cursor /Users/amoskoskas/leon-essai-coulisses-cursor
[ -f ~/.cursor/hooks.json.pause-essai ] && mv ~/.cursor/hooks.json.pause-essai ~/.cursor/hooks.json
```

Supprimez aussi la conversation d'essai dans Cursor, puis quittez et rouvrez Cursor.

## Antigravity

1. Mettez de côté les crochets d'Antigravity, puis créez le dossier **juste avant l'essai** (le script ne regarde que les conversations touchées après la création du dossier) :

   ```
   [ -f ~/.gemini/config/hooks.json ] && mv ~/.gemini/config/hooks.json ~/.gemini/config/hooks.json.pause-essai
   mkdir ~/leon-essai-coulisses-antigravity && cd ~/leon-essai-coulisses-antigravity && git init -q && echo "Le chat de l'essai s'appelle Pistache." > a.txt
   ```

2. Quittez Antigravity (Cmd+Q) et rouvrez-le. **Ouvrez le dossier `leon-essai-coulisses-antigravity`.**
3. Nouvelle conversation, avec un modèle qui affiche sa réflexion. Collez le message 1, puis le message 2, **tels quels, sans rien y changer**. Pendant l'essai, n'utilisez Antigravity pour rien d'autre. La version est dans « À propos ».

**Comment le script reconnaît l'essai.** D'abord par le dossier de travail que la conversation donne. S'il ne le trouve pas (c'est arrivé le 13/11), il la reconnaît à ses messages : une conversation dont **votre premier message** commence par « C'est un essai. Ne modifie aucun fichier. » et contient la consigne de `a.txt` (d'où la nouvelle conversation, et le message collé tel quel). Ces phrases ne comptent que dans ce que vous tapez, pas dans ce que l'agent écrit ou lit. Un sous-agent est reconnu si sa consigne reprend l'une des deux consignes du message 1, seulement si la conversation d'essai a été reconnue, s'il ne travaille dans aucun autre dossier et si aucune autre conversation ne l'a lancé ; sinon, il est seulement compté. Le script cherche ces phrases sans jamais les afficher.

**Pourquoi rien ne part vers Leon.** Les crochets de Leon pour Antigravity sont dans `~/.gemini/config/hooks.json`, mis de côté (les autres crochets de ce fichier aussi, le temps de l'essai). Reste le rattrapage, comme pour Cursor.

**Ce que je lance après :**

```
node /private/tmp/claude-501/-Users-amoskoskas-leon--claude-worktrees-lot14-memoire-leon-ade414/95b54b88-25ab-4d97-ad89-ad83d4817957/scratchpad/pr4-essais/antigravity-coulisses.mjs /Users/amoskoskas/leon-essai-coulisses-antigravity /Users/amoskoskas/.gemini
```

**Le ménage**, dans cet ordre :

1. Dans Antigravity, supprimez la conversation d'essai, et celles des sous-agents si elles apparaissent.
2. Je relance le script : il doit dire `"conversations_relevees": 0`, `"conversations_au_dossier_inconnu": 0`, `"sous_agents_a_consigne_de_l_essai_non_retenus": 0` et `"dossiers_en_lien": 0`, et aussi `"brains_lus"` à 1 ou plus et `"dossiers_illisibles": {}` (vide). Si `brains_lus` est à 0, le script n'a trouvé aucun dossier d'Antigravity (mauvais chemin) ; si `dossiers_illisibles` n'est pas vide, il n'a pas pu tout lire : dans les deux cas, ses 0 ne prouvent rien, je m'arrête et je vous le dis. Si `conversations_relevees` n'est pas à 0, je vous montre d'abord les numéros qu'il donne (seulement ceux marqués `dossier_de_travail`, `messages_de_l_essai` ou `sous_agent_de_l_essai`), avec leur `variante` ; vous vérifiez dans Antigravity que ce sont bien la conversation d'essai et ses sous-agents, et seulement après votre accord, j'efface leurs dossiers `/Users/amoskoskas/.gemini/<variante>/brain/<numéro>` (la variante est celle que donne le rapport : `antigravity`, `antigravity-ide` ou `antigravity-cli`), un par un. Puis je relance le script, jusqu'à lire `"conversations_relevees": 0`. Si l'un des trois autres comptes n'est pas à 0, une conversation récente reste dont le script ne sait pas dire le dossier (ou qu'il n'a pas voulu ouvrir) : je vous le dis, on regarde ensemble dans Antigravity les conversations du jour, et vous supprimez celle de l'essai s'il en reste une. Je n'efface rien de moi-même dans ce cas. C'est aussi ce qui arrive si la conversation d'essai est partie mais pas ses sous-agents : sans elle, le script ne les reconnaît plus, il les compte seulement.
3. Puis :

   ```
   rm -rf /Users/amoskoskas/leon-essai-coulisses-antigravity
   [ -f ~/.gemini/config/hooks.json.pause-essai ] && mv ~/.gemini/config/hooks.json.pause-essai ~/.gemini/config/hooks.json
   ```

4. Quittez et rouvrez Antigravity.
