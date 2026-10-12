"""Vérifie le tableur de coûts.

1. Recalcule toutes les formules avec le moteur `formulas` et signale la moindre erreur.
2. Compare les résultats du tableur avec modele_independant.py, qui refait le
   calcul en Python pur à partir des seules cellules de saisie.

Usage : python verifier_modele.py [chemin.xlsx]   (par défaut ../leon-modele-couts.xlsx)
Code de sortie 1 s'il y a une erreur de formule ou un écart.
"""
import sys
from pathlib import Path

import formulas

import modele_independant as m

CHEMIN_DEFAUT = Path(__file__).resolve().parent.parent / "leon-modele-couts.xlsx"
COLS_ECHELLE = "BCDEFG"  # Tech P1..P3 puis Réno P1..P3


def recalculer(chemin):
    """Valeurs de toutes les cellules recalculées, indexées par 'ONGLET!A1', et la liste des erreurs."""
    solution = formulas.ExcelModel().loads(str(chemin)).finish().calculate()
    valeurs, erreurs = {}, []
    for cle, rng in solution.items():
        try:
            valeur = rng.value[0][0]
        except (AttributeError, IndexError, TypeError):
            continue
        ref = cle.split("]")[-1].replace("'", "").upper()
        valeurs[ref] = valeur
        if isinstance(valeur, formulas.functions.XlError):
            erreurs.append((ref, valeur))
    return valeurs, erreurs


def main():
    chemin = Path(sys.argv[1]) if len(sys.argv) > 1 else CHEMIN_DEFAUT
    valeurs, erreurs = recalculer(chemin)
    p = m.charger(chemin)
    codes = list(p["scenarios"])
    fx = p["h"]["usd_par_eur"]
    controles, ecarts = 0, []

    def comparer(ref, attendu, libelle):
        nonlocal controles
        controles += 1
        obtenu = valeurs[ref.upper()]
        if isinstance(attendu, str) or isinstance(obtenu, str):
            ok = obtenu == attendu
        else:
            ok = abs(obtenu - attendu) <= 1e-6 * max(1, abs(attendu))
        if not ok:
            ecarts.append(f"{ref} ({libelle}) : tableur {obtenu!r}, attendu {attendu!r}")

    for i, code in enumerate(codes):
        # Resultats : coût total par collaborateur, puis coût variable par profil
        for ti, typ in enumerate(m.TYPES):
            for pi, clients in enumerate(p["paliers"]):
                comparer(f"RESULTATS!{COLS_ECHELLE[ti * 3 + pi]}{5 + i}", m.cout_total_collab_eur(p, code, typ, clients),
                         f"{code} {typ} {clients} clients")
        for col, valeur in zip("BCD", m.cout_variable(p, code)):
            comparer(f"RESULTATS!{col}{14 + i}", valeur / fx, f"{code} variable")
        comparer(f"RESULTATS!E{14 + i}", m.cout_variable(p, code, brut=True)[0] / fx, f"{code} dev sans filtre")
        # Historique : coût ponctuel par entreprise
        for ti, typ in enumerate(m.TYPES):
            for mi, mois in enumerate(p["mois_historique"]):
                comparer(f"HISTORIQUE!{'BCDEFGHI'[ti * 4 + mi]}{10 + i}", m.cout_historique(p, code, typ, mois),
                         f"{code} {typ} {mois} mois")
        # Tarification : marges au palier choisi
        clients = p["paliers"][p["palier_marges"] - 1]
        for ti, typ in enumerate(m.TYPES):
            for pj, prix in enumerate(p["prix_sieges"]):
                comparer(f"TARIFICATION!{COLS_ECHELLE[ti * 3 + pj]}{9 + i}", m.marge(p, code, typ, clients, prix),
                         f"marge {code} {typ} {prix} €")
    for ti, (typ, col) in enumerate(zip(m.TYPES, "BC")):
        comparer(f"TARIFICATION!{col}24", m.cout_pilote(p, typ), f"pilote {typ}")
        for pj, prix in enumerate(p["prix_sieges"]):
            comparer(f"TARIFICATION!{'BCD'[pj]}{29 + ti}", m.point_mort(p, typ, prix), f"point mort {typ} {prix} €")

    print(f"{chemin.name} : {len(valeurs)} cellules recalculées, {len(erreurs)} erreur(s) de formule")
    for ref, err in erreurs[:30]:
        print(f"  ERREUR {ref} : {err}")
    print(f"{controles} résultats comparés au modèle indépendant, {len(ecarts)} écart(s)")
    for e in ecarts[:30]:
        print(f"  ÉCART {e}")
    return 1 if erreurs or ecarts else 0


if __name__ == "__main__":
    sys.exit(main())
