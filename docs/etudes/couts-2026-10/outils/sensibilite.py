"""Seuils de rentabilité du fine-tuning et scénario pessimiste (chiffres cités dans la synthèse).

Part des hypothèses saisies dans le tableur, puis les modifie pour le cas pessimiste.

Usage : python sensibilite.py [chemin.xlsx]   (par défaut ../leon-modele-couts.xlsx)
"""
import sys
from pathlib import Path

import modele_independant as m

CHEMIN_DEFAUT = Path(__file__).resolve().parent.parent / "leon-modele-couts.xlsx"

# Toutes les hypothèses incertaines poussées à la hausse en même temps
PESSIMISTE = {
    "facteur_tokens": 1.6,
    "part_pertinente": 0.5,
    "mult_contexte": 5,
    "ratio_sortie_fiches": 0.5,
    "briefings_jour": 4,
    "inclure_reunions": 1,
}
COMPARAISONS = [("R3b", "R2b"), ("R3a", "R2b"), ("R3b", "R2"), ("R3a", "R1")]


def afficher_seuils(p, titre):
    print(f"\n{titre} : nombre de clients à partir duquel le premier scénario coûte au plus autant que le second")
    for typ in m.TYPES:
        seuils = ", ".join(f"{a} vs {b} : {m.seuil_rentabilite(p, a, b, typ)}" for a, b in COMPARAISONS)
        print(f"  {typ:5s} {seuils}")


def main():
    chemin = Path(sys.argv[1]) if len(sys.argv) > 1 else CHEMIN_DEFAUT
    base = m.charger(chemin)
    pessimiste = m.modifier(base, **PESSIMISTE)
    afficher_seuils(base, "Hypothèses du tableur")
    afficher_seuils(pessimiste, "Cas pessimiste")
    print("\nCas pessimiste : coût variable ($/collab/mois) et coût total (€/collab/mois, entreprises tech)")
    for code in base["scenarios"]:
        variable = ", ".join(f"{x:.2f}" for x in m.cout_variable(pessimiste, code))
        totaux = ", ".join(f"{n} clients : {m.cout_total_collab_eur(pessimiste, code, 'tech', n):.2f}" for n in (10, 100))
        print(f"  {code:4s} dev/bureau/terrain : {variable}   |   {totaux}")


if __name__ == "__main__":
    main()
