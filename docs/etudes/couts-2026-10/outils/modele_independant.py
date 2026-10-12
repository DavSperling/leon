"""Le modèle de coûts refait en Python pur, sans passer par les formules du tableur.

Lit uniquement les cellules de saisie de leon-modele-couts.xlsx, puis recalcule
les résultats. Sert à vérifier les formules (verifier_modele.py) et à explorer
des variantes d'hypothèses (sensibilite.py).

Les positions des cellules suivent generer_modele.py : si la mise en page change
là-bas, il faut mettre à jour `charger` ici.
"""
import copy
import math
from collections import namedtuple

import openpyxl

TYPES = ("tech", "reno")
Scenario = namedtuple("Scenario", "code nom tri fiches briefing gpu mlops finetune")

# Clé interne -> libellé de la colonne A de l'onglet Hypotheses
HYPOTHESES = {
    "jours_mois": "Jours ouvrés par mois",
    "facteur_tokens": "Facteur de conversion en tokens facturés",
    "inclure_slack": "Inclure Slack / Teams",
    "inclure_reunions": "Inclure les réunions transcrites",
    "ratio_sortie_tri": "Sortie du tri / entrée",
    "part_pertinente": "Part de la donnée qui alimente des fiches",
    "mult_contexte": "Tokens relus par token nouveau (fiches)",
    "ratio_sortie_fiches": "Tokens écrits par token pertinent (fiches)",
    "briefings_jour": "Régénérations du briefing par personne et par jour",
    "brief_in": "Tokens lus pour préparer un briefing",
    "brief_out": "Tokens écrits par briefing",
    "prix_embedding": "Prix des embeddings",
    "facteur_batch": "Remise Batch API",
    "batch_flux": "Flux continu traité en batch",
    "batch_historique": "Import de l'historique en batch",
    "mois_fiches_historique": "Mois d'historique mis en fiches",
    "infra_base": "Infra de base",
    "infra_par_collab": "Infra par collaborateur",
    "casa_annuel": "Audit Google CASA (lecture Gmail)",
    "outillage": "Outillage connecteurs",
    "soc2_annuel": "SOC 2 / ISO 27001",
    "gpu_dedie": "GPU dédiés (scénario R3a)",
    "capacite_gpu": "Capacité d'un lot de GPU dédiés",
    "mlops": "Ingénieur MLOps (scénarios fine-tunés)",
    "finetune_oneoff": "Fine-tuning (ponctuel)",
    "amort_mois": "Amortissement du fine-tuning",
    "usd_par_eur": "Dollars pour 1 euro",
}


def charger(chemin):
    """Lit toutes les cellules de saisie du tableur et renvoie un dict d'entrées."""
    wb = openpyxl.load_workbook(chemin)
    par_libelle = {r[0].value: r[1].value for r in wb["Hypotheses"].iter_rows(min_row=5) if r[0].value}
    ws_vol, ws_ech, ws_tar = wb["Volumes"], wb["Echelle"], wb["Tarification"]
    return {
        "h": {cle: par_libelle[libelle] for cle, libelle in HYPOTHESES.items()},
        # nom du modèle -> (entrée $/M, sortie $/M, type)
        "prix": {r[0].value: (r[1].value, r[2].value, r[3].value) for r in wb["Prix"].iter_rows(min_row=5, max_row=12)},
        # lignes : emails, Slack, réunions, docs, chats LLM, sessions de code filtrées ; colonnes : dev, bureau, terrain
        "sources": [[c.value for c in r[1:4]] for r in ws_vol.iter_rows(min_row=5, max_row=10)],
        "code_brut": [ws_vol[f"{c}12"].value for c in "BCD"],
        "scenarios": {s.code: s for s in (Scenario(*[c.value for c in r[:8]]) for r in wb["Scenarios"].iter_rows(min_row=5, max_row=10))},
        "composition": {"tech": [ws_ech[f"B{r}"].value for r in (5, 6, 7)], "reno": [ws_ech[f"C{r}"].value for r in (5, 6, 7)]},
        "paliers": [ws_ech[f"{c}11"].value for c in "BCD"],
        "mois_historique": [wb["Historique"][f"{c}5"].value for c in "BCDE"],
        "prix_sieges": [ws_tar[f"{c}5"].value for c in "BCD"],
        "palier_marges": ws_tar["B6"].value,
        "scenario_pilote": ws_tar["B17"].value,
        "mois_pilote": ws_tar["B18"].value,
        "option_historique_pilote": ws_tar["B19"].value,
    }


def modifier(p, **hypotheses):
    """Copie des entrées avec certaines hypothèses remplacées (pour les variantes)."""
    q = copy.deepcopy(p)
    for cle, valeur in hypotheses.items():
        if cle not in q["h"]:
            raise KeyError(cle)
        q["h"][cle] = valeur
    return q


def tokens_mois(p, brut=False):
    """Millions de tokens facturés par collaborateur et par mois : [dev, bureau, terrain]."""
    h = p["h"]
    out = []
    for i in range(3):
        email, slack, reunions, docs, chat, code = (ligne[i] for ligne in p["sources"])
        if brut:
            code = p["code_brut"][i]
        jour = email + slack * h["inclure_slack"] + reunions * h["inclure_reunions"] + docs + chat + code
        out.append(jour * 1000 * h["jours_mois"] * h["facteur_tokens"] / 1e6)
    return out


def _remise(p, modele, batch_actif):
    return p["h"]["facteur_batch"] if batch_actif == 1 and p["prix"][modele][2] == "API" else 1


def _prix_unitaires(p, sc, batch_actif):
    """$ par million de tokens ingérés : (tri, fiches)."""
    h, px = p["h"], p["prix"]
    tri = (px[sc.tri][0] + h["ratio_sortie_tri"] * px[sc.tri][1]) * _remise(p, sc.tri, batch_actif)
    fiches = (h["part_pertinente"] * (h["mult_contexte"] * px[sc.fiches][0] + h["ratio_sortie_fiches"] * px[sc.fiches][1])
              * _remise(p, sc.fiches, batch_actif))
    return tri, fiches


def cout_variable(p, code, brut=False):
    """$ par collaborateur et par mois : [dev, bureau, terrain]."""
    h, sc = p["h"], p["scenarios"][code]
    tri, fiches = _prix_unitaires(p, sc, h["batch_flux"])
    pin, pout = p["prix"][sc.briefing][:2]
    briefing = h["briefings_jour"] * h["jours_mois"] * (h["brief_in"] * pin + h["brief_out"] * pout) / 1e6
    return [t * (tri + fiches + h["prix_embedding"]) + briefing for t in tokens_mois(p, brut)]


def charge_llm(p):
    """Millions de tokens d'entrée traités par collaborateur et par mois (dimensionnement GPU)."""
    h = p["h"]
    briefings = h["briefings_jour"] * h["jours_mois"] * h["brief_in"] / 1e6
    return [t * (1 + h["part_pertinente"] * h["mult_contexte"]) + briefings for t in tokens_mois(p)]


def _par_entreprise(p, typ, par_profil):
    return sum(n * x for n, x in zip(p["composition"][typ], par_profil))


def cout_variable_entreprise(p, code, typ):
    return _par_entreprise(p, typ, cout_variable(p, code))


def couts_fixes(p, code, typ, clients):
    """$ par mois pour toute la plateforme."""
    h, sc = p["h"], p["scenarios"][code]
    effectif = sum(p["composition"][typ])
    lots_gpu = max(1, math.ceil(clients * _par_entreprise(p, typ, charge_llm(p)) / h["capacite_gpu"]))
    return (h["infra_base"] + h["infra_par_collab"] * clients * effectif + h["casa_annuel"] / 12 + h["outillage"]
            + h["soc2_annuel"] / 12 + sc.gpu * h["gpu_dedie"] * lots_gpu + sc.mlops * h["mlops"]
            + sc.finetune * h["finetune_oneoff"] / h["amort_mois"])


def cout_total_collab_eur(p, code, typ, clients):
    effectif = sum(p["composition"][typ])
    total = clients * cout_variable_entreprise(p, code, typ) + couts_fixes(p, code, typ, clients)
    return total / (clients * effectif) / p["h"]["usd_par_eur"]


def cout_historique(p, code, typ, mois):
    """$ ponctuels pour importer `mois` mois d'historique d'une entreprise."""
    h = p["h"]
    tri, fiches = _prix_unitaires(p, p["scenarios"][code], h["batch_historique"])
    volume = _par_entreprise(p, typ, tokens_mois(p))
    return volume * (mois * (tri + h["prix_embedding"]) + min(mois, h["mois_fiches_historique"]) * fiches)


def marge(p, code, typ, clients, prix_siege):
    return 1 - cout_total_collab_eur(p, code, typ, clients) / prix_siege


def cout_pilote(p, typ):
    """$ de calcul d'un pilote gratuit (hors coûts fixes)."""
    code = p["scenario_pilote"]
    mois_historique = p["mois_historique"][p["option_historique_pilote"] - 1]
    return p["mois_pilote"] * cout_variable_entreprise(p, code, typ) + cout_historique(p, code, typ, mois_historique)


def point_mort(p, typ, prix_siege):
    """Clients nécessaires pour couvrir les coûts fixes de la plateforme, hors salaires."""
    h, sc = p["h"], p["scenarios"][p["scenario_pilote"]]
    effectif = sum(p["composition"][typ])
    fixes = (h["infra_base"] + h["casa_annuel"] / 12 + h["outillage"] + h["soc2_annuel"] / 12
             + sc.gpu * h["gpu_dedie"] + sc.mlops * h["mlops"] + sc.finetune * h["finetune_oneoff"] / h["amort_mois"])
    marge_client = (prix_siege * h["usd_par_eur"] * effectif - cout_variable_entreprise(p, sc.code, typ)
                    - h["infra_par_collab"] * effectif)
    return math.ceil(fixes / marge_client) if marge_client > 0 else "jamais"


def seuil_rentabilite(p, code, reference, typ, max_clients=20000):
    """Plus petit nombre de clients à partir duquel `code` coûte au plus autant que `reference`."""
    for n in range(1, max_clients + 1):
        if cout_total_collab_eur(p, code, typ, n) <= cout_total_collab_eur(p, reference, typ, n):
            return n
    return None
