# Outils du modèle de coûts

Les scripts qui génèrent et vérifient [`../leon-modele-couts.xlsx`](../leon-modele-couts.xlsx).

| Script | Rôle |
|---|---|
| `generer_modele.py` | Écrit le tableur : formules, mise en forme, valeurs par défaut des hypothèses. |
| `modele_independant.py` | Le même modèle refait en Python pur, à partir des seules cellules de saisie du tableur. |
| `verifier_modele.py` | Recalcule toutes les formules du tableur, puis compare 152 résultats au modèle indépendant. Code de sortie 1 en cas d'erreur ou d'écart. |
| `sensibilite.py` | Calcule les seuils de rentabilité du fine-tuning et le cas pessimiste cités dans la synthèse. |

## Installation (une fois)

Depuis ce dossier :

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Utilisation

```bash
.venv/bin/python verifier_modele.py      # vérifie ../leon-modele-couts.xlsx
.venv/bin/python sensibilite.py          # seuils de rentabilité et cas pessimiste
.venv/bin/python generer_modele.py       # ÉCRASE ../leon-modele-couts.xlsx
```

Chaque script accepte un autre chemin de tableur en argument.

## À savoir

- **Régénérer écrase le tableur**, y compris les hypothèses modifiées à la main. Pour changer une hypothèse durablement : modifier sa valeur par défaut dans `generer_modele.py`, régénérer, lancer `verifier_modele.py`, puis ouvrir une PR.
- **Pour explorer sans toucher au repo**, modifier les cellules bleues dans une copie du tableur (Excel, Numbers), puis lancer `verifier_modele.py` et `sensibilite.py` sur cette copie : ils lisent les valeurs saisies.
- **Si la mise en page change** dans `generer_modele.py`, mettre à jour les positions de cellules dans `modele_independant.py` (fonction `charger`) et `verifier_modele.py`. Sinon, la vérification échouera.
- Le tableur généré n'enregistre pas les valeurs calculées : Excel, Numbers et Google Sheets recalculent à l'ouverture, mais l'aperçu GitHub l'affiche vide.
- Testé avec Python 3.14.
