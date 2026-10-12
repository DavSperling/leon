"""Génère le tableur de coûts leon-modele-couts.xlsx (formules uniquement, aucun résultat écrit en dur).

Usage : python generer_modele.py [chemin.xlsx]   (par défaut ../leon-modele-couts.xlsx)

Attention : le fichier est écrasé, y compris les hypothèses modifiées à la main dans le
tableur. Les valeurs par défaut des hypothèses sont définies dans ce script.
"""
import sys
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation

OUT = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "leon-modele-couts.xlsx"
FONT = "Arial"
BLUE, GREEN, BLACK, GREY = "0000FF", "008000", "000000", "666666"
YELLOW = PatternFill("solid", fgColor="FFFF00")
HEAD = PatternFill("solid", fgColor="DDE4EE")
SECTION = PatternFill("solid", fgColor="F2F2F2")
THIN = Side(style="thin", color="BBBBBB")
BOX = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)

USD2 = '"$"#,##0.00;("$"#,##0.00);"-"'
USD0 = '"$"#,##0;("$"#,##0);"-"'
EUR2 = '#,##0.00" €";(#,##0.00" €");"-"'
EUR0 = '#,##0" €";(#,##0" €");"-"'
PCT = '0.0%;(0.0%);"-"'
NUM2 = '#,##0.00;(#,##0.00);"-"'
NUM1 = '#,##0.0;(#,##0.0);"-"'
INT = '#,##0;(#,##0);"-"'
RATIO = '0.0"x"'


def font(color=BLACK, bold=False, italic=False, size=10):
    return Font(name=FONT, color=color, bold=bold, italic=italic, size=size)


def title(ws, text, sub=None):
    ws["A1"] = text
    ws["A1"].font = font(bold=True, size=14)
    if sub:
        ws["A2"] = sub
        ws["A2"].font = font(color=GREY, italic=True)


def header(ws, row, labels, col=1):
    for i, lab in enumerate(labels):
        c = ws.cell(row=row, column=col + i, value=lab)
        c.font = font(bold=True)
        c.fill = HEAD
        c.border = BOX
        c.alignment = Alignment(wrap_text=True, vertical="center")


def section(ws, row, text, width=4):
    c = ws.cell(row=row, column=1, value=text)
    c.font = font(bold=True)
    for i in range(1, width + 1):
        ws.cell(row=row, column=i).fill = SECTION


def put(ws, ref, value, fmt=None, kind="input", key=False, bold=False):
    c = ws[ref]
    c.value = value
    color = {"input": BLUE, "calc": BLACK, "link": GREEN, "text": BLACK, "note": GREY}[kind]
    c.font = font(color=color, bold=bold, italic=(kind == "note"))
    if fmt:
        c.number_format = fmt
    if key:
        c.fill = YELLOW
    if kind in ("input", "calc", "link"):
        c.border = BOX
    return c


def widths(ws, spec):
    for col, w in spec.items():
        ws.column_dimensions[col].width = w


wb = openpyxl.Workbook()
wb.remove(wb.active)
S = {name: wb.create_sheet(name) for name in [
    "Lisez_moi", "Resultats", "Hypotheses", "Prix", "Volumes", "Scenarios",
    "Cout_profil", "Echelle", "Historique", "Tarification", "Mesure_dev", "Sources"]}

# ---------------------------------------------------------------- Hypotheses
ws = S["Hypotheses"]
title(ws, "Hypothèses générales", "Cellules bleues = modifiables · fond jaune = leviers qui pèsent le plus")
header(ws, 4, ["Paramètre", "Valeur", "Unité", "Source / commentaire"])
H = {}
rows = [
    ("§", "Conversion des volumes"),
    ("jours_mois", "Jours ouvrés par mois", 21, "jours", "Moyenne France", INT, False),
    ("facteur_tokens", "Facteur de conversion en tokens facturés", 1.4, "×", "Français (+15–30 %) et tokenizer Claude 4.7+ (+30 %) par rapport à la règle 1,33 token/mot. Prudent, appliqué à tous les modèles", NUM2, False),
    ("inclure_slack", "Inclure Slack / Teams", 0, "0/1", "Décision du 12/10/2026 : V1 sans Slack (conditions d'API et limites de débit)", INT, False),
    ("inclure_reunions", "Inclure les réunions transcrites", 0, "0/1", "Hors périmètre V1 par défaut. Mettre 1 pour simuler : c'est la plus grosse source du profil bureau", INT, False),
    ("§", "Pipeline du robot d'entrée"),
    ("ratio_sortie_tri", "Sortie du tri / entrée", 0.05, "ratio", "Tri = catégorie, niveau d'accès, entités, pertinence : sortie courte. Hypothèse", NUM2, False),
    ("part_pertinente", "Part de la donnée qui alimente des fiches", 0.25, "%", "Hypothèse à mesurer en pilote. Levier n°1 du coût des fiches", PCT, True),
    ("mult_contexte", "Tokens relus par token nouveau (fiches)", 3, "×", "Pour mettre à jour une fiche, le modèle relit la fiche et les faits liés. Hypothèse", NUM1, True),
    ("ratio_sortie_fiches", "Tokens écrits par token pertinent (fiches)", 0.3, "ratio", "Faits extraits + mise à jour de la fiche. Hypothèse", NUM2, False),
    ("§", "Briefing injecté au démarrage des sessions (contournement du MCP)"),
    ("briefings_jour", "Régénérations du briefing par personne et par jour", 2, "/jour", "Préparé à l'avance (matin, mi-journée), pas à chaque session", INT, True),
    ("brief_in", "Tokens lus pour préparer un briefing", 20000, "tokens", "Fiches pertinentes pour la personne", INT, False),
    ("brief_out", "Tokens écrits par briefing", 3000, "tokens", "Taille du briefing", INT, False),
    ("brief_injecte", "Tokens injectés par session côté client", 3000, "tokens", "S'ajoute à la consommation LLM du client (abonnement ou API)", INT, False),
    ("§", "Remises et embeddings"),
    ("prix_embedding", "Prix des embeddings", 0.02, "$/M tokens", "OpenAI text-embedding-3-small ou voyage-4-lite (200 M tokens offerts)", NUM2, False),
    ("facteur_batch", "Remise Batch API", 0.5, "×", "−50 % chez Anthropic, OpenAI, Gemini. Chez Anthropic, le batch n'est pas éligible à la rétention zéro (29 jours)", NUM2, False),
    ("batch_flux", "Flux continu traité en batch", 0, "0/1", "Délai jusqu'à 24 h et pas de rétention zéro : 0 par défaut", INT, False),
    ("batch_historique", "Import de l'historique en batch", 1, "0/1", "Pas d'urgence sur l'historique", INT, False),
    ("mois_fiches_historique", "Mois d'historique mis en fiches", 6, "mois", "Au-delà, l'historique est seulement indexé (option C)", INT, False),
    ("§", "Coûts fixes de la plateforme"),
    ("infra_base", "Infra de base", 300, "$/mois", "Postgres managé 2 vCPU/8 Go (Scaleway ≈ 97 $, Supabase/Cloud SQL ≈ 137 $) + 2 petits serveurs (≈ 60–90 $) + sauvegardes et monitoring. Haute dispo : ≈ +150 $", USD0, False),
    ("infra_par_collab", "Infra par collaborateur", 0.30, "$/collab/mois", "≈ 0,4 Go/collab après 2 ans (texte + vecteurs int8 + index), stockage vectoriel ≤ 0,33 $/Go, plus montée en charge base et workers. DÉRIVÉ", USD2, False),
    ("casa_annuel", "Audit Google CASA (lecture Gmail)", 1800, "$/an", "Tier 2, labo le moins cher 540–1 800 $/an, renouvelé chaque année", USD0, False),
    ("outillage", "Outillage connecteurs", 50, "$/mois", "Ex. Nango : 50 $/mois pour 20 connexions", USD0, False),
    ("soc2_annuel", "SOC 2 / ISO 27001", 0, "$/an", "0 tant qu'on vend aux PME. SOC 2 Type II : 25–50 k$ la 1re année (outil + auditeur) ; ISO 27001 : 38–54 k$ ; pentest : 5–20 k$", USD0, False),
    ("gpu_dedie", "GPU dédiés (scénario R3a)", 2490, "$/mois", "2× L40S Scaleway 24/7 = 2 146 €/mois, dont un en secours", USD0, False),
    ("capacite_gpu", "Capacité d'un lot de GPU dédiés", 16000, "M tokens/mois", "2× L40S avec secours, modèle 8B FP8, 50 % d'utilisation. DÉRIVÉ", INT, False),
    ("mlops", "Ingénieur MLOps (scénarios fine-tunés)", 3500, "$/mois", "0,25–0,5 ETP, ≈ 2–4 k€/mois chargé", USD0, True),
    ("finetune_oneoff", "Fine-tuning (ponctuel)", 3500, "$", "Étiquettes via Opus batch (≈ 600 $ pour 100k ex.) + entraînement + itérations. Hors relecture humaine", USD0, False),
    ("amort_mois", "Amortissement du fine-tuning", 12, "mois", "Réentraînement annuel", INT, False),
    ("§", "Change"),
    ("usd_par_eur", "Dollars pour 1 euro", 1.16, "$/€", "Non vérifié", NUM2, False),
]
r = 5
for item in rows:
    if item[0] == "§":
        section(ws, r, item[1])
        r += 1
        continue
    key, label, val, unit, note, fmt, lever = item
    put(ws, f"A{r}", label, kind="text")
    put(ws, f"B{r}", val, fmt=fmt, key=lever)
    put(ws, f"C{r}", unit, kind="note")
    put(ws, f"D{r}", note, kind="note")
    H[key] = f"Hypotheses!$B${r}"
    r += 1
widths(ws, {"A": 46, "B": 12, "C": 16, "D": 100})

# ---------------------------------------------------------------- Prix
ws = S["Prix"]
title(ws, "Prix des modèles ($ par million de tokens)", "Tarifs publics relevés le 12/10/2026. Modèles utilisables dans l'onglet Scenarios")
header(ws, 4, ["Modèle", "Entrée $/M", "Sortie $/M", "Type", "Source / commentaire"])
M_OPUS, M_SONNET, M_HAIKU = "Claude Opus 5.5", "Claude Sonnet 5.5", "Claude Haiku 5.5"
M_NANO, M_OSS = "OpenAI gpt-5-nano", "Open source hébergé (Qwen3.5-9B)"
M_FTS, M_FTD, M_NONE = "Fine-tuné 8B, GPU à la seconde", "Fine-tuné 8B, GPU dédié", "Assemblage sans LLM"
prices = [
    (M_OPUS, 4, 20, "API", "platform.claude.com/docs/en/about-claude/pricing. Raisonnement non désactivable : les tokens de réflexion sont facturés en sortie, R1 est donc sous-estimé"),
    (M_SONNET, 2, 10, "API", "idem"),
    (M_HAIKU, 0.10, 0.50, "API", "idem. Prix valable jusqu'à 100k tokens par requête (0,50 / 2,50 au-delà)"),
    (M_NANO, 0.05, 0.40, "API", "developers.openai.com/api/docs/pricing"),
    (M_OSS, 0.10, 0.15, "API", "deepinfra.com/pricing"),
    (M_FTS, 0.04, 0.30, "FT", "DÉRIVÉ : H100 à la seconde (Modal) ≈ 0,027 $/M en entrée, majoré pour démarrages à froid et région UE"),
    (M_FTD, 0, 0, "FT", "Coût marginal nul : le GPU est payé dans les coûts fixes (Hypotheses)"),
    (M_NONE, 0, 0, "Aucun", "Briefing assemblé à partir des faits, sans appel LLM"),
]
P0 = 5
for i, (name, pin, pout, typ, src) in enumerate(prices):
    rr = P0 + i
    put(ws, f"A{rr}", name, kind="input")
    put(ws, f"B{rr}", pin, fmt=NUM2)
    put(ws, f"C{rr}", pout, fmt=NUM2)
    put(ws, f"D{rr}", typ)
    put(ws, f"E{rr}", src, kind="note")
P1 = P0 + len(prices) - 1
PR_NAME, PR_IN, PR_OUT, PR_TYPE = (f"Prix!$A${P0}:$A${P1}", f"Prix!$B${P0}:$B${P1}",
                                   f"Prix!$C${P0}:$C${P1}", f"Prix!$D${P0}:$D${P1}")
ref_row = P1 + 3
section(ws, ref_row - 1, "Pour référence (non utilisés dans les calculs)", 5)
header(ws, ref_row, ["Modèle", "Entrée $/M", "Sortie $/M", "Remarque", "Source"])
refs = [
    ("Claude Fable 5.1", 10, 50, "Rétention 30 jours obligatoire", "platform.claude.com"),
    ("Claude Haiku 4.5", 1, 5, "Génération précédente", "platform.claude.com"),
    ("OpenAI gpt-6.1-sol", 2, 10, "Prix promo jusqu'au 21/11/2026 au moins", "developers.openai.com"),
    ("Gemini 3.1 Flash-Lite", 0.25, 1.5, "", "ai.google.dev/gemini-api/docs/pricing"),
    ("Gemini 3.8 Flash", 0.75, 3.75, "Prix doublés au 01/01/2027", "ai.google.dev"),
    ("DeepInfra Llama-3.1-8B Turbo", 0.02, 0.04, "", "deepinfra.com/pricing"),
    ("Fireworks LoRA ≤16B (service)", 0.20, 0.20, "LoRA servie au prix du modèle de base", "fireworks.ai/pricing"),
]
for i, (n, a, b, rem, src) in enumerate(refs):
    rr = ref_row + 1 + i
    put(ws, f"A{rr}", n, kind="text")
    put(ws, f"B{rr}", a, fmt=NUM2, kind="note")
    put(ws, f"C{rr}", b, fmt=NUM2, kind="note")
    put(ws, f"D{rr}", rem, kind="note")
    put(ws, f"E{rr}", src, kind="note")
widths(ws, {"A": 36, "B": 12, "C": 12, "D": 30, "E": 90})

# ---------------------------------------------------------------- Volumes
ws = S["Volumes"]
title(ws, "Volumes par profil (milliers de tokens par jour, bruit retiré)",
      "Médianes. Sources : benchmarks publics (voir Sources) et mesure réelle du profil dev (onglet Mesure_dev)")
header(ws, 4, ["Source", "Dev", "Bureau", "Terrain", "Base / commentaire"])
vol = [
    ("email", "Emails (hors newsletters et notifications)", 6, 13, 10, "117 mails reçus/jour (Microsoft 2025), 50–60 % de bruit, 110 mots/mail"),
    ("slack", "Slack / Teams (messages postés, dédoublonnés)", 1.5, 1.5, 0.5, "~40 messages postés/jour × 20 mots. Ingéré une fois par entreprise"),
    ("reunions", "Réunions transcrites", 12, 35, 12, "11–22 réunions/semaine, ~12k tokens/heure"),
    ("docs", "Docs / CRM / tickets", 3, 3, 2, "Pas de benchmark : hypothèse"),
    ("chat", "Chats LLM (ChatGPT, Claude, Gemini…)", 3, 4.7, 0.5, "ChatGPT ≈ 3,7 messages/jour/utilisateur (NBER 2025), 470 tokens/échange"),
    ("code", "Sessions de code, filtrées (messages + réponses)", 35, 0, 0, "MESURÉ : ~35k/jour hors lectures de fichiers et sorties de commandes"),
]
V = {}
for i, (k, lab, a, b, c, note) in enumerate(vol):
    rr = 5 + i
    put(ws, f"A{rr}", lab, kind="text")
    for col, v in zip("BCD", (a, b, c)):
        put(ws, f"{col}{rr}", v, fmt=NUM1)
    put(ws, f"E{rr}", note, kind="note")
    V[k] = rr
rt = 5 + len(vol)
put(ws, f"A{rt}", "Total par jour (k tokens)", kind="text", bold=True)
for col in "BCD":
    put(ws, f"{col}{rt}", (f"={col}{V['email']}+{col}{V['slack']}*{H['inclure_slack']}"
                            f"+{col}{V['reunions']}*{H['inclure_reunions']}+{col}{V['docs']}+{col}{V['chat']}+{col}{V['code']}"),
        fmt=NUM1, kind="calc", bold=True)
V["total"] = rt
put(ws, f"A{rt+1}", "Sessions de code brutes, non filtrées (k tokens)", kind="text")
for col, v in zip("BCD", (400, 0, 0)):
    put(ws, f"{col}{rt+1}", v, fmt=NUM1)
put(ws, f"E{rt+1}", "MESURÉ : médiane 400k/jour (pic 1,4 M). Anthropic : 0,8–1,3 M (dérivé du coût moyen publié)", kind="note")
V["code_brut"] = rt + 1
put(ws, f"A{rt+2}", "Total par jour sans filtre (k tokens)", kind="text")
for col in "BCD":
    put(ws, f"{col}{rt+2}", f"={col}{rt}-{col}{V['code']}+{col}{rt+1}", fmt=NUM1, kind="calc")
V["total_brut"] = rt + 2
put(ws, f"A{rt+3}", "Sessions LLM démarrées par jour", kind="text")
for col, v in zip("BCD", (8, 4, 1)):
    put(ws, f"{col}{rt+3}", v, fmt=INT)
put(ws, f"E{rt+3}", "Dev MESURÉ (médiane 8). Bureau et terrain : hypothèses", kind="note")
V["sessions"] = rt + 3
rm = rt + 5
section(ws, rm - 1, "Volumes mensuels facturés (millions de tokens par collaborateur)", 5)
put(ws, f"A{rm}", "Tokens par mois, filtrés (M)", kind="text", bold=True)
put(ws, f"A{rm+1}", "Tokens par mois, sans filtre (M)", kind="text")
put(ws, f"A{rm+2}", "Tokens injectés côté client par mois (M)", kind="text")
for col in "BCD":
    put(ws, f"{col}{rm}", f"={col}{V['total']}*1000*{H['jours_mois']}*{H['facteur_tokens']}/1000000", fmt=NUM2, kind="calc", bold=True)
    put(ws, f"{col}{rm+1}", f"={col}{V['total_brut']}*1000*{H['jours_mois']}*{H['facteur_tokens']}/1000000", fmt=NUM2, kind="calc")
    put(ws, f"{col}{rm+2}", f"={col}{V['sessions']}*{H['jours_mois']}*{H['brief_injecte']}/1000000", fmt=NUM2, kind="calc")
V["mois"], V["mois_brut"], V["mois_client"] = rm, rm + 1, rm + 2
widths(ws, {"A": 50, "B": 11, "C": 11, "D": 11, "E": 95})

# ---------------------------------------------------------------- Scenarios
ws = S["Scenarios"]
title(ws, "Scénarios du robot d'entrée", "Choisir un modèle par étape (liste déroulante) et les coûts fixes associés (1 = oui)")
header(ws, 4, ["Code", "Nom", "Modèle du tri", "Modèle des fiches", "Modèle du briefing",
               "GPU dédiés", "MLOps", "Fine-tuning", "Description"])
scen = [
    ("R1", "Opus partout", M_OPUS, M_OPUS, M_OPUS, 0, 0, 0, "Le plafond : un modèle haut de gamme traite tout"),
    ("R2", "Cascade Claude", M_HAIKU, M_SONNET, M_SONNET, 0, 0, 0, "Petit modèle pour trier, Sonnet pour les fiches et le briefing"),
    ("R2b", "Cascade optimisée", M_HAIKU, M_SONNET, M_HAIKU, 0, 0, 0, "Comme R2, briefing rédigé par Haiku à partir des fiches"),
    ("R3a", "Fine-tuné, GPU dédiés", M_FTD, M_FTD, M_FTD, 1, 1, 1, "Notre modèle 8B sur 2 GPU loués 24/7 en France"),
    ("R3b", "Fine-tuné, GPU à la seconde", M_FTS, M_FTS, M_FTS, 0, 1, 1, "Notre modèle 8B sur GPU facturés à la seconde"),
    ("R4", "Hybride", M_FTS, M_SONNET, M_HAIKU, 0, 1, 1, "Notre modèle pour trier, Claude pour les fiches et le briefing"),
]
dv = DataValidation(type="list", formula1=f"={PR_NAME}", allow_blank=False)
ws.add_data_validation(dv)
SC = {}
for i, (code, name, mt, mf, mb, g, m, ft, desc) in enumerate(scen):
    rr = 5 + i
    put(ws, f"A{rr}", code, kind="text", bold=True)
    put(ws, f"B{rr}", name, kind="input")
    for col, v in zip("CDE", (mt, mf, mb)):
        put(ws, f"{col}{rr}", v)
        dv.add(f"{col}{rr}")
    for col, v in zip("FGH", (g, m, ft)):
        put(ws, f"{col}{rr}", v, fmt=INT)
    put(ws, f"I{rr}", desc, kind="note")
    SC[code] = rr
NSC = len(scen)
widths(ws, {"A": 7, "B": 28, "C": 32, "D": 32, "E": 32, "F": 11, "G": 9, "H": 11, "I": 70})

# ---------------------------------------------------------------- Cout_profil
ws = S["Cout_profil"]
title(ws, "Coût variable par collaborateur et par mois ($)", "Par profil et par scénario. Colonnes G à N : prix résolus depuis Prix et Scenarios")
header(ws, 4, ["Scénario", "Étape", "Dev", "Bureau", "Terrain", "",
               "Tri : entrée", "Tri : sortie", "Fiches : entrée", "Fiches : sortie",
               "Briefing : entrée", "Briefing : sortie", "Remise tri", "Remise fiches"])
CP = {}
VOLCOL = {"C": "B", "D": "C", "E": "D"}  # Cout_profil column -> Volumes column


def lookup(rng, model_ref):
    return f"INDEX({rng},MATCH({model_ref},{PR_NAME},0))"


for i, (code, *_rest) in enumerate(scen):
    r0 = 5 + i * 7
    sr = SC[code]
    mt, mf, mb = f"Scenarios!$C${sr}", f"Scenarios!$D${sr}", f"Scenarios!$E${sr}"
    put(ws, f"A{r0}", f'=Scenarios!$A${sr}&" — "&Scenarios!$B${sr}', kind="link", bold=True)
    put(ws, f"G{r0}", "=" + lookup(PR_IN, mt), fmt=NUM2, kind="link")
    put(ws, f"H{r0}", "=" + lookup(PR_OUT, mt), fmt=NUM2, kind="link")
    put(ws, f"I{r0}", "=" + lookup(PR_IN, mf), fmt=NUM2, kind="link")
    put(ws, f"J{r0}", "=" + lookup(PR_OUT, mf), fmt=NUM2, kind="link")
    put(ws, f"K{r0}", "=" + lookup(PR_IN, mb), fmt=NUM2, kind="link")
    put(ws, f"L{r0}", "=" + lookup(PR_OUT, mb), fmt=NUM2, kind="link")
    put(ws, f"M{r0}", f'=IF(AND({H["batch_flux"]}=1,{lookup(PR_TYPE, mt)}="API"),{H["facteur_batch"]},1)', fmt=NUM2, kind="calc")
    put(ws, f"N{r0}", f'=IF(AND({H["batch_flux"]}=1,{lookup(PR_TYPE, mf)}="API"),{H["facteur_batch"]},1)', fmt=NUM2, kind="calc")
    labels = ["Tri", "Fiches", "Briefing", "Embeddings", "Total $/collab/mois"]
    for j, lab in enumerate(labels):
        put(ws, f"B{r0+1+j}", lab, kind="text", bold=(j == 4))
    for col, vcol in VOLCOL.items():
        T = f"Volumes!{vcol}${V['mois']}"
        put(ws, f"{col}{r0+1}", f"={T}*($G${r0}+{H['ratio_sortie_tri']}*$H${r0})*$M${r0}", fmt=USD2, kind="calc")
        put(ws, f"{col}{r0+2}", f"={T}*{H['part_pertinente']}*({H['mult_contexte']}*$I${r0}+{H['ratio_sortie_fiches']}*$J${r0})*$N${r0}", fmt=USD2, kind="calc")
        put(ws, f"{col}{r0+3}", f"={H['briefings_jour']}*{H['jours_mois']}*({H['brief_in']}*$K${r0}+{H['brief_out']}*$L${r0})/1000000", fmt=USD2, kind="calc")
        put(ws, f"{col}{r0+4}", f"={T}*{H['prix_embedding']}", fmt=USD2, kind="calc")
        put(ws, f"{col}{r0+5}", f"=SUM({col}{r0+1}:{col}{r0+4})", fmt=USD2, kind="calc", bold=True)
    CP[code] = {"head": r0, "total": r0 + 5}

rs = 5 + NSC * 7 + 1
section(ws, rs, "Sensibilité : profil dev SANS filtre des sessions de code ($/collab/mois)", 5)
header(ws, rs + 1, ["Scénario", "", "Dev filtré", "Dev sans filtre", "Écart"])
for i, (code, *_r) in enumerate(scen):
    rr = rs + 2 + i
    h = CP[code]["head"]
    Tb = f"Volumes!$B${V['mois_brut']}"
    put(ws, f"A{rr}", f"=$A${h}", kind="link")
    put(ws, f"C{rr}", f"=C{CP[code]['total']}", fmt=USD2, kind="link")
    put(ws, f"D{rr}", (f"={Tb}*(($G${h}+{H['ratio_sortie_tri']}*$H${h})*$M${h}"
                       f"+{H['part_pertinente']}*({H['mult_contexte']}*$I${h}+{H['ratio_sortie_fiches']}*$J${h})*$N${h}"
                       f"+{H['prix_embedding']})+C{h+3}"), fmt=USD2, kind="calc")
    put(ws, f"E{rr}", f"=IF(C{rr}>0,D{rr}/C{rr},0)", fmt=RATIO, kind="calc")
    CP[code]["brut"] = rr

rc = rs + 2 + NSC + 1
section(ws, rc, "Charge LLM traitée par collaborateur (M tokens d'entrée par mois) : sert au dimensionnement des GPU", 5)
header(ws, rc + 1, ["", "", "Dev", "Bureau", "Terrain"])
put(ws, f"B{rc+2}", "Charge (M tokens)", kind="text")
for col, vcol in VOLCOL.items():
    put(ws, f"{col}{rc+2}", (f"=Volumes!{vcol}${V['mois']}*(1+{H['part_pertinente']}*{H['mult_contexte']})"
                             f"+{H['briefings_jour']}*{H['jours_mois']}*{H['brief_in']}/1000000"), fmt=NUM2, kind="calc")
CHARGE_ROW = rc + 2

rk = rc + 4
section(ws, rk, "Côté client (pour information) : tokens ajoutés à ses sessions LLM par le briefing injecté", 5)
header(ws, rk + 1, ["", "", "Dev", "Bureau", "Terrain"])
put(ws, f"B{rk+2}", "M tokens/mois", kind="text")
put(ws, f"B{rk+3}", "$/mois s'il paie Sonnet 5.5 à l'API", kind="text")
for col, vcol in VOLCOL.items():
    put(ws, f"{col}{rk+2}", f"=Volumes!{vcol}${V['mois_client']}", fmt=NUM2, kind="link")
    put(ws, f"{col}{rk+3}", f"={col}{rk+2}*" + lookup(PR_IN, f'"{M_SONNET}"'), fmt=USD2, kind="calc")
widths(ws, {"A": 34, "B": 34, "C": 12, "D": 12, "E": 12, "F": 3, "G": 11, "H": 11, "I": 11, "J": 11, "K": 11, "L": 11, "M": 11, "N": 11})

# ---------------------------------------------------------------- Echelle
ws = S["Echelle"]
title(ws, "Coût total par collaborateur selon le nombre de clients",
      "Coûts variables + coûts fixes de la plateforme répartis sur tous les collaborateurs clients")
header(ws, 4, ["Composition", "Tech (type appli santé)", "Rénovation énergétique"])
comp = [("Dev", 5, 0), ("Bureau", 8, 4), ("Terrain", 2, 11)]
for i, (lab, a, b) in enumerate(comp):
    put(ws, f"A{5+i}", lab, kind="text")
    put(ws, f"B{5+i}", a, fmt=INT)
    put(ws, f"C{5+i}", b, fmt=INT)
put(ws, "A8", "Total collaborateurs", kind="text", bold=True)
put(ws, "B8", "=SUM(B5:B7)", fmt=INT, kind="calc", bold=True)
put(ws, "C8", "=SUM(C5:C7)", fmt=INT, kind="calc", bold=True)
header(ws, 10, ["Paliers", "Palier 1", "Palier 2", "Palier 3"])
put(ws, "A11", "Nombre d'entreprises clientes", kind="text")
for col, v in zip("BCD", (1, 10, 100)):
    put(ws, f"{col}11", v, fmt=INT, key=True)

section(ws, 13, "Coût variable mensuel par entreprise ($)", 3)
header(ws, 14, ["Scénario", "Tech", "Rénovation"])
VAR = {}
for i, (code, *_r) in enumerate(scen):
    rr = 15 + i
    t = CP[code]["total"]
    put(ws, f"A{rr}", f"=Cout_profil!$A${CP[code]['head']}", kind="link")
    for col in "BC":
        put(ws, f"{col}{rr}", f"={col}$5*Cout_profil!$C${t}+{col}$6*Cout_profil!$D${t}+{col}$7*Cout_profil!$E${t}", fmt=USD2, kind="calc")
    VAR[code] = rr
rch = 15 + NSC + 1
put(ws, f"A{rch}", "Charge LLM par entreprise (M tokens/mois)", kind="text")
for col in "BC":
    put(ws, f"{col}{rch}", f"={col}$5*Cout_profil!$C${CHARGE_ROW}+{col}$6*Cout_profil!$D${CHARGE_ROW}+{col}$7*Cout_profil!$E${CHARGE_ROW}", fmt=NUM2, kind="calc")

COLS6 = [("B", "B", "B"), ("C", "B", "C"), ("D", "B", "D"), ("E", "C", "B"), ("F", "C", "C"), ("G", "C", "D")]  # out col, company col, palier col
rf = rch + 2
section(ws, rf, "Coûts fixes mensuels de la plateforme ($)", 7)
header(ws, rf + 1, ["Scénario", "Tech · P1", "Tech · P2", "Tech · P3", "Réno · P1", "Réno · P2", "Réno · P3"])
FIX = {}
for i, (code, *_r) in enumerate(scen):
    rr = rf + 2 + i
    sr = SC[code]
    put(ws, f"A{rr}", f"=$A${VAR[code]}", kind="link")
    for oc, cc, pc in COLS6:
        clients = f"{pc}$11"
        collabs = f"{clients}*{cc}$8"
        load = f"{clients}*{cc}${rch}"
        gpu_sets = f"MAX(1,ROUNDUP({load}/{H['capacite_gpu']},0))"
        put(ws, f"{oc}{rr}", (f"={H['infra_base']}+{H['infra_par_collab']}*{collabs}+{H['casa_annuel']}/12+{H['outillage']}"
                              f"+{H['soc2_annuel']}/12+Scenarios!$F${sr}*{H['gpu_dedie']}*{gpu_sets}"
                              f"+Scenarios!$G${sr}*{H['mlops']}+Scenarios!$H${sr}*{H['finetune_oneoff']}/{H['amort_mois']}"),
            fmt=USD0, kind="calc")
    FIX[code] = rr

rtot = rf + 2 + NSC + 1
section(ws, rtot, "COÛT TOTAL PAR COLLABORATEUR ($/mois)", 7)
header(ws, rtot + 1, ["Scénario", "Tech · P1", "Tech · P2", "Tech · P3", "Réno · P1", "Réno · P2", "Réno · P3"])
TOT = {}
for i, (code, *_r) in enumerate(scen):
    rr = rtot + 2 + i
    put(ws, f"A{rr}", f"=$A${VAR[code]}", kind="link", bold=True)
    for oc, cc, pc in COLS6:
        put(ws, f"{oc}{rr}", f"=({pc}$11*{cc}${VAR[code]}+{oc}{FIX[code]})/({pc}$11*{cc}$8)", fmt=USD2, kind="calc", bold=True)
    TOT[code] = rr

reu = rtot + 2 + NSC + 1
section(ws, reu, "COÛT TOTAL PAR COLLABORATEUR (€/mois)", 7)
header(ws, reu + 1, ["Scénario", "Tech · P1", "Tech · P2", "Tech · P3", "Réno · P1", "Réno · P2", "Réno · P3"])
TOTE = {}
for i, (code, *_r) in enumerate(scen):
    rr = reu + 2 + i
    put(ws, f"A{rr}", f"=$A${VAR[code]}", kind="link", bold=True)
    for oc, _cc, _pc in COLS6:
        put(ws, f"{oc}{rr}", f"={oc}{TOT[code]}/{H['usd_par_eur']}", fmt=EUR2, kind="calc", bold=True)
    TOTE[code] = rr
rg = reu + 2 + NSC + 1
put(ws, f"A{rg}", "Utilisation des GPU dédiés (R3a)", kind="text")
for oc, cc, pc in COLS6:
    load = f"{pc}$11*{cc}${rch}"
    put(ws, f"{oc}{rg}", f"={load}/(MAX(1,ROUNDUP({load}/{H['capacite_gpu']},0))*{H['capacite_gpu']})", fmt=PCT, kind="calc")
put(ws, f"A{rg+2}", "Paliers : P1 = 1 client, P2 = 10 clients, P3 = 100 clients (ligne 11). Tous les clients sont supposés du même type.", kind="note")
widths(ws, {"A": 40, "B": 14, "C": 14, "D": 14, "E": 14, "F": 14, "G": 14})

# ---------------------------------------------------------------- Historique
ws = S["Historique"]
title(ws, "Coût ponctuel de l'import de l'historique",
      "Tout l'historique est trié et indexé ; seuls les mois récents (Hypotheses) sont mis en fiches")
header(ws, 4, ["Mois d'historique", "Option 1", "Option 2", "Option 3", "Option 4"])
put(ws, "A5", "Mois importés", kind="text")
for col, v in zip("BCDE", (0, 3, 6, 24)):
    put(ws, f"{col}5", v, fmt=INT, key=True)
put(ws, "A7", "Volume mensuel par entreprise (M tokens)", kind="text")
put(ws, "B7", "Tech", kind="text")
put(ws, "C7", f"=Echelle!$B$5*Volumes!$B${V['mois']}+Echelle!$B$6*Volumes!$C${V['mois']}+Echelle!$B$7*Volumes!$D${V['mois']}", fmt=NUM2, kind="calc")
put(ws, "D7", "Rénovation", kind="text")
put(ws, "E7", f"=Echelle!$C$5*Volumes!$B${V['mois']}+Echelle!$C$6*Volumes!$C${V['mois']}+Echelle!$C$7*Volumes!$D${V['mois']}", fmt=NUM2, kind="calc")
header(ws, 9, ["Scénario", "Tech · 0", "Tech · 3", "Tech · 6", "Tech · 24", "Réno · 0", "Réno · 3", "Réno · 6", "Réno · 24", "",
               "Tri $/M (remisé)", "Fiches $/M (remisé)"])
HI = {}
for i, (code, *_r) in enumerate(scen):
    rr = 10 + i
    h = CP[code]["head"]
    sr = SC[code]
    put(ws, f"A{rr}", f"=Cout_profil!$A${h}", kind="link")
    bm_t = f'IF(AND({H["batch_historique"]}=1,{lookup(PR_TYPE, f"Scenarios!$C${sr}")}="API"),{H["facteur_batch"]},1)'
    bm_f = f'IF(AND({H["batch_historique"]}=1,{lookup(PR_TYPE, f"Scenarios!$D${sr}")}="API"),{H["facteur_batch"]},1)'
    put(ws, f"K{rr}", f"=(Cout_profil!$G${h}+{H['ratio_sortie_tri']}*Cout_profil!$H${h})*{bm_t}", fmt=NUM2, kind="calc")
    put(ws, f"L{rr}", f"={H['part_pertinente']}*({H['mult_contexte']}*Cout_profil!$I${h}+{H['ratio_sortie_fiches']}*Cout_profil!$J${h})*{bm_f}", fmt=NUM2, kind="calc")
    for j, mcol in enumerate("BCDE"):
        for vol_ref, oc in (("$C$7", "BCDE"[j]), ("$E$7", "FGHI"[j])):
            m = f"{mcol}$5"
            put(ws, f"{oc}{rr}", f"={vol_ref}*({m}*($K{rr}+{H['prix_embedding']})+MIN({m},{H['mois_fiches_historique']})*$L{rr})", fmt=USD0, kind="calc")
    HI[code] = rr
rp = 10 + NSC + 1
put(ws, f"A{rp}", "Par collaborateur ($)", kind="text", bold=True)
header(ws, rp + 1, ["Scénario", "Tech · 0", "Tech · 3", "Tech · 6", "Tech · 24", "Réno · 0", "Réno · 3", "Réno · 6", "Réno · 24"])
for i, (code, *_r) in enumerate(scen):
    rr = rp + 2 + i
    put(ws, f"A{rr}", f"=$A${HI[code]}", kind="link")
    for j, oc in enumerate("BCDEFGHI"):
        tot = "Echelle!$B$8" if j < 4 else "Echelle!$C$8"
        put(ws, f"{oc}{rr}", f"={oc}{HI[code]}/{tot}", fmt=USD2, kind="calc")
widths(ws, {"A": 34, **{c: 11 for c in "BCDEFGHI"}, "J": 3, "K": 14, "L": 16})

# ---------------------------------------------------------------- Tarification
ws = S["Tarification"]
title(ws, "Tarification : marge brute selon le prix par siège",
      "Marge brute = (prix − coût total par collaborateur) / prix, coûts fixes de la plateforme inclus, hors salaires de l'équipe")
header(ws, 4, ["Prix par siège (€/mois)", "Option A", "Option B", "Option C"])
put(ws, "A5", "Prix HT par collaborateur et par mois", kind="text")
for col, v in zip("BCD", (15, 25, 35)):
    put(ws, f"{col}5", v, fmt=EUR0, key=True)
put(ws, "A6", "Palier de clients utilisé", kind="text")
put(ws, "B6", 2, fmt=INT, key=True)
put(ws, "C6", "1, 2 ou 3 (onglet Echelle)", kind="note")
header(ws, 8, ["Scénario", "Tech · A", "Tech · B", "Tech · C", "Réno · A", "Réno · B", "Réno · C"])
for i, (code, *_r) in enumerate(scen):
    rr = 9 + i
    put(ws, f"A{rr}", f"=Echelle!$A${TOTE[code]}", kind="link")
    for j, oc in enumerate("BCDEFG"):
        pcol = "BCD"[j % 3]
        offset = 0 if j < 3 else 3  # Echelle columns B..D (tech) or E..G (réno); $B$6 = palier 1..3
        cost = f"INDEX(Echelle!$B${TOTE[code]}:$G${TOTE[code]},1,{offset}+$B$6)"
        put(ws, f"{oc}{rr}", f"=IF({pcol}$5>0,1-{cost}/{pcol}$5,0)", fmt=PCT, kind="calc")
rpil = 9 + NSC + 1
section(ws, rpil, "Coût d'un pilote gratuit pour UNE entreprise (hors coûts fixes, qui existent de toute façon)", 7)
put(ws, f"A{rpil+1}", "Scénario du pilote", kind="text")
put(ws, f"B{rpil+1}", "R2b", key=True)
put(ws, f"A{rpil+2}", "Durée du pilote (mois)", kind="text")
put(ws, f"B{rpil+2}", 3, fmt=INT, key=True)
put(ws, f"A{rpil+3}", "Historique importé (option de l'onglet Historique : 1 à 4)", kind="text")
put(ws, f"B{rpil+3}", 2, fmt=INT, key=True)
header(ws, rpil + 5, ["", "Tech", "Rénovation"])
codes_rng = f"Scenarios!$A$5:$A${4 + NSC}"
put(ws, f"A{rpil+6}", "Usage sur la durée ($)", kind="text")
put(ws, f"A{rpil+7}", "Import de l'historique ($)", kind="text")
put(ws, f"A{rpil+8}", "Total du pilote ($)", kind="text", bold=True)
put(ws, f"A{rpil+9}", "Total du pilote (€)", kind="text", bold=True)
var_rng = f"Echelle!$B$15:$C${14 + NSC}"
hist_rng = f"Historique!$B$10:$I${9 + NSC}"
for j, col in enumerate("BC"):
    idx = f"MATCH($B${rpil+1},{codes_rng},0)"
    put(ws, f"{col}{rpil+6}", f"=$B${rpil+2}*INDEX({var_rng},{idx},{j + 1})", fmt=USD0, kind="calc")
    put(ws, f"{col}{rpil+7}", f"=INDEX({hist_rng},{idx},{4 * j}+$B${rpil+3})", fmt=USD0, kind="calc")
    put(ws, f"{col}{rpil+8}", f"={col}{rpil+6}+{col}{rpil+7}", fmt=USD0, kind="calc", bold=True)
    put(ws, f"{col}{rpil+9}", f"={col}{rpil+8}/{H['usd_par_eur']}", fmt=EUR0, kind="calc", bold=True)

rbe = rpil + 11
section(ws, rbe, "Point mort de la plateforme, hors salaires : nombre de clients pour couvrir les coûts fixes (scénario du pilote)", 7)
header(ws, rbe + 1, ["Type d'entreprise", "Prix A", "Prix B", "Prix C"])
idx = f"MATCH($B${rpil+1},{codes_rng},0)"
scen_fixed = (f"INDEX(Scenarios!$F$5:$F${4 + NSC},{idx})*{H['gpu_dedie']}+INDEX(Scenarios!$G$5:$G${4 + NSC},{idx})*{H['mlops']}"
              f"+INDEX(Scenarios!$H$5:$H${4 + NSC},{idx})*{H['finetune_oneoff']}/{H['amort_mois']}")
fixed_base = f"({H['infra_base']}+{H['casa_annuel']}/12+{H['outillage']}+{H['soc2_annuel']}/12+{scen_fixed})"
for j, (lab, ecol) in enumerate((("Tech", "B"), ("Rénovation", "C"))):
    rr = rbe + 2 + j
    put(ws, f"A{rr}", lab, kind="text")
    head = f"Echelle!${ecol}$8"
    var_co = f"INDEX({var_rng},{idx},{j + 1})"
    for pcol in "BCD":
        margin = f"({pcol}$5*{H['usd_par_eur']}*{head}-{var_co}-{H['infra_par_collab']}*{head})"
        put(ws, f"{pcol}{rr}", f'=IF({margin}>0,ROUNDUP({fixed_base}/{margin},0),"jamais")', fmt=INT, kind="calc", bold=True)
put(ws, f"A{rbe+4}", "Lecture : nombre d'entreprises de 15 personnes à signer pour que les revenus couvrent serveurs, audit Gmail et outillage (et GPU / MLOps si scénario fine-tuné).", kind="note")
widths(ws, {"A": 52, **{c: 13 for c in "BCDEFG"}})

# ---------------------------------------------------------------- Concurrents
ws = wb.create_sheet("Concurrents", index=wb.sheetnames.index("Mesure_dev"))
title(ws, "Prix des concurrents et produits voisins (pages officielles, 12/10/2026)",
      "Repère pour la tarification. « $ » sans devise précisée supposé USD")
header(ws, 4, ["Produit", "Catégorie", "Prix", "Unité", "Ce qui compte pour Leon", "Source"])
comps = [
    ("Supermemory", "API mémoire", "$0 / 19 / 100 / 399", "org/mois + usage", "Connecteur Gmail à partir de 100 $. Mémoire via appel d'outil", "supermemory.ai/pricing"),
    ("Mem0", "API mémoire", "$0 / 19 / 249", "org/mois", "Quotas d'ajouts et de lectures. Pour développeurs", "mem0.ai/pricing"),
    ("Zep", "API mémoire", "$0 / 125 / 375", "org/mois", "Crédits par épisode de 350 octets", "getzep.com/pricing"),
    ("Basic Memory", "Mémoire d'équipe via MCP", "$15 / 30", "siège/mois", "Graphe de connaissances partagé ; SSO sur Business", "basicmemory.com/pricing"),
    ("Conxt", "Mémoire inter-LLM", "$9 / 29 / 39", "siège/mois", "Seul à capter ChatGPT, Claude, Gemini (extension Chrome) et à injecter avant le prompt. Bêta gratuite, devs", "conxt.dev"),
    ("Pieces", "Mémoire dev", "$18,99 / 22,99", "siège/mois", "Mémoire locale sur la machine, MCP illimité", "pieces.app/pricing"),
    ("In Parallel (UE)", "Contexte d'entreprise via MCP", "29 € / 69 € (23 € / 55 € annuel)", "siège/mois", "Seul à afficher un hébergement 100 % UE (AWS Francfort)", "in-parallel.com/pricing"),
    ("Unblocked", "Contexte dev", "$29 annuel / 35 mensuel", "siège/mois", "MCP vers Claude, Cursor, Copilot", "getunblocked.com/pricing"),
    ("Dust (FR)", "Suite IA", "24 € / 120 €", "siège/mois", "Business : 3 sources de données maximum", "dust.tt/home/pricing"),
    ("Notion Business", "Suite IA", "19,50 €", "siège/mois", "Recherche d'entreprise, agents au crédit", "notion.com/pricing"),
    ("ChatGPT Business", "Suite LLM", "$20 annuel / 25 mensuel", "siège/mois", "« Company knowledge » : web seulement", "help.openai.com (via recherche)"),
    ("Claude Team", "Suite LLM", "$20 annuel / 25 mensuel", "siège/mois", "Connecteurs, mémoire, recherche d'entreprise", "claude.com/pricing"),
    ("Microsoft 365 Copilot Business", "Suite IA", "$21 (18 promo)", "siège/mois", "Jusqu'à 300 utilisateurs", "microsoft.com/microsoft-365-copilot/pricing"),
    ("Glean", "Recherche d'entreprise", "≈ 30–209 k$/an (médiane 99 k$)", "contrat annuel", "Prix non publié, données Vendr via un tiers. Grands comptes", "glean.com ; getmacha.com"),
]
for i, row in enumerate(comps):
    for col, v in zip("ABCDEF", row):
        put(ws, f"{col}{5+i}", v, kind="text" if col in "AB" else "note")
rr = 5 + len(comps) + 1
for i, n in enumerate([
    "Fourchettes : mémoire d'équipe 15–39 $/siège ; suites IA 20–30 €/siège ; recherche d'entreprise sur devis (≥ 16 k$/an).",
    "Presque tous exposent la mémoire comme un outil que le LLM doit décider d'appeler. Seuls Conxt et OpenMemory injectent le contexte d'office, pour les devs uniquement.",
    "Personne ne capte les conversations LLM des employés pour une PME (hors Conxt, en bêta).",
    "Positionnement suggéré : couche au-dessus de l'abonnement LLM déjà payé (20–30 €), donc 15–35 € par siège, avec des crédits pour l'usage lourd.",
]):
    put(ws, f"A{rr+i}", n, kind="note")
widths(ws, {"A": 30, "B": 26, "C": 30, "D": 16, "E": 80, "F": 40})

# ---------------------------------------------------------------- Mesure_dev
ws = S["Mesure_dev"]
title(ws, "Mesure réelle : sessions Claude Code d'un fondateur (profil dev)",
      "Chiffres agrégés uniquement, aucun contenu lu. Estimation à ~4 caractères par token. Mesure du 12/10/2026")
header(ws, 4, ["Type de contenu (k tokens par jour actif)", "Médiane", "Moyenne", "Max"])
meas = [
    ("Messages tapés par l'utilisateur", 19.7, 30.0, 69.5),
    ("Réponses de Claude (texte)", 14.3, 12.8, 20.3),
    ("Raisonnement visible", 1.6, 2.8, 6.4),
    ("Appels d'outils (commandes, code écrit)", 37.3, 47.9, 101.9),
    ("Résultats d'outils (fichiers lus, sorties)", 79.9, 117.0, 252.5),
    ("Contexte injecté (hooks, skills, rappels)", 74.6, 61.9, 83.3),
    ("Total session principale", 236.1, 272.4, 478.3),
    ("Total sous-agents", 153.8, 350.0, 893.8),
]
for i, (lab, a, b, c) in enumerate(meas):
    rr = 5 + i
    put(ws, f"A{rr}", lab, kind="text", bold=lab.startswith("Total"))
    for col, v in zip("BCD", (a, b, c)):
        put(ws, f"{col}{rr}", v, fmt=NUM1, kind="note")
rr = 5 + len(meas) + 1
notes = [
    "Base : 3 journées complètes (29/09, 01/10, 02/10/2026). Août : 12 journées partielles (le nettoyage à 30 jours de Claude Code a effacé les sessions non reprises).",
    "Prompts par jour : médiane 32, moyenne 34. Sessions par jour : médiane 8, moyenne 8,7.",
    "Ce qui a de la valeur pour la mémoire (messages + réponses) ≈ 35k tokens/jour, soit ~10 % du volume brut (~400k).",
    "Résultats d'outils : lectures de fichiers 41 %, sorties de commandes 40 %, outils MCP (base de données, tickets) ~13 %.",
    "Leçon : un filtre mécanique (sans IA) avant le robot divise la facture du profil dev par 5 à 10.",
]
for i, n in enumerate(notes):
    put(ws, f"A{rr+i}", n, kind="note")
widths(ws, {"A": 60, "B": 11, "C": 11, "D": 11})

# ---------------------------------------------------------------- Sources
ws = S["Sources"]
title(ws, "Sources (consultées le 12/10/2026)", "Le détail complet est dans docs/etudes/couts-2026-10/annexes/")
header(ws, 4, ["Sujet", "Source"])
srcs = [
    ("Prix Claude", "https://platform.claude.com/docs/en/about-claude/pricing"),
    ("Rétention des données Claude (batch non éligible ZDR)", "https://platform.claude.com/docs/en/manage-claude/api-and-data-retention"),
    ("Prix OpenAI (y compris fine-tuning, embeddings)", "https://developers.openai.com/api/docs/pricing"),
    ("Prix Gemini", "https://ai.google.dev/gemini-api/docs/pricing"),
    ("Open source hébergé", "https://deepinfra.com/pricing · https://www.together.ai/pricing · https://fireworks.ai/pricing"),
    ("GPU Scaleway (prix au 01/06/2026)", "https://www.scaleway.com/en/blog/a-transparent-update-on-scaleway-pricing"),
    ("GPU à la seconde", "https://modal.com/pricing · https://www.runpod.io/pricing"),
    ("Débit d'inférence 8B (H100, A100)", "https://nvidia.github.io/TensorRT-LLM/performance/perf-overview.html"),
    ("Coût moyen Claude Code par développeur", "https://code.claude.com/docs/en/costs"),
    ("Emails et messages reçus par jour", "https://www.microsoft.com/en-us/worklab/work-trend-index/breaking-down-infinite-workday"),
    ("Usage ChatGPT (messages/jour)", "https://www.nber.org/papers/w34255"),
    ("Google CASA (vérification Gmail)", "https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification"),
    ("Slack : limites de débit 2025", "https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps"),
    ("Slack : conditions de l'API", "https://slack.com/terms-of-service/api"),
    ("Claude Compliance API", "https://platform.claude.com/docs/en/manage-claude/compliance-api"),
    ("Nango (connecteurs)", "https://nango.dev/pricing"),
    ("Bases Postgres managées (UE)", "https://www.scaleway.com/en/pricing/managed-databases/ · https://supabase.com/pricing · https://cloud.google.com/sql/pricing"),
    ("Stockage objet et bases vectorielles", "https://www.scaleway.com/en/pricing/storage/ · https://turbopuffer.com/pricing · https://www.pinecone.io/pricing"),
    ("Crédits startups (seul AWS couvre Claude)", "https://startups.aws.com/faq · https://cloud.google.com/startup/faq"),
    ("Coûts SOC 2 (sources vendeurs)", "https://www.vendr.com/marketplace/vanta · https://drata.com/blog/soc-2-audit-cost"),
    ("Prix des concurrents", "Voir l'onglet Concurrents et annexes/05-concurrents.md"),
]
for i, (a, b) in enumerate(srcs):
    put(ws, f"A{5+i}", a, kind="text")
    put(ws, f"B{5+i}", b, kind="note")
widths(ws, {"A": 52, "B": 110})

# ---------------------------------------------------------------- Resultats
ws = S["Resultats"]
title(ws, "Résultats : coût total par collaborateur et par mois (€)",
      "Calculé à partir des autres onglets. Ne rien saisir ici")
header(ws, 4, ["Scénario", "Tech · 1 client", "Tech · 10", "Tech · 100", "Réno · 1 client", "Réno · 10", "Réno · 100"])
for i, (code, *_r) in enumerate(scen):
    rr = 5 + i
    put(ws, f"A{rr}", f"=Echelle!$A${TOTE[code]}", kind="link", bold=True)
    for oc in "BCDEFG":
        put(ws, f"{oc}{rr}", f"=Echelle!{oc}{TOTE[code]}", fmt=EUR2, kind="link")
r2 = 5 + NSC + 1
section(ws, r2, "Coût variable seul par profil (€/collab/mois)", 7)
header(ws, r2 + 1, ["Scénario", "Dev", "Bureau", "Terrain", "Dev sans filtre"])
for i, (code, *_r) in enumerate(scen):
    rr = r2 + 2 + i
    t = CP[code]["total"]
    put(ws, f"A{rr}", f"=Cout_profil!$A${CP[code]['head']}", kind="link")
    for oc, cc in zip("BCD", "CDE"):
        put(ws, f"{oc}{rr}", f"=Cout_profil!{cc}{t}/{H['usd_par_eur']}", fmt=EUR2, kind="link")
    put(ws, f"E{rr}", f"=Cout_profil!D{CP[code]['brut']}/{H['usd_par_eur']}", fmt=EUR2, kind="link")
widths(ws, {"A": 40, **{c: 15 for c in "BCDEFG"}})

# ---------------------------------------------------------------- Lisez_moi
ws = S["Lisez_moi"]
title(ws, "Leon : modèle de coûts (v1, 12/10/2026)", "Étude préalable : combien coûte le robot d'entrée, par collaborateur, selon le scénario")
lines = [
    ("Comment lire", True),
    ("1. Resultats : le coût total par collaborateur et par mois, pour chaque scénario et chaque palier de clients.", False),
    ("2. Echelle : le détail (coûts variables + coûts fixes répartis). Cout_profil : le détail par étape du robot (tri, fiches, briefing, embeddings).", False),
    ("3. Historique : le coût ponctuel d'import du passé. Tarification : la marge selon le prix par siège, le coût d'un pilote gratuit et le point mort de la plateforme.", False),
    ("4. Concurrents : les prix publics des produits comparables. Mesure_dev : la mesure réelle des sessions Claude Code d'un dev.", False),
    ("", False),
    ("Comment modifier", True),
    ("Seules les cellules en BLEU sont des saisies. Les cellules à fond JAUNE sont les leviers qui pèsent le plus.", False),
    ("Noir = formule. Vert = lien vers un autre onglet. Tout se recalcule.", False),
    ("Onglets à saisie : Hypotheses, Prix, Volumes, Scenarios (listes déroulantes), Echelle (composition, paliers), Historique (mois), Tarification (prix).", False),
    ("", False),
    ("Les 6 scénarios", True),
    ("R1 Opus partout · R2 Cascade Claude (Haiku trie, Sonnet écrit) · R2b Cascade optimisée (briefing par Haiku)", False),
    ("R3a Fine-tuné sur GPU dédiés 24/7 · R3b Fine-tuné sur GPU à la seconde · R4 Hybride (notre modèle trie, Claude écrit)", False),
    ("", False),
    ("Limites à garder en tête", True),
    ("Volumes : benchmarks publics + mesure d'un seul dev sur 3 jours complets. À remplacer par des mesures de pilote.", False),
    ("Pipeline : la part de donnée pertinente et le contexte relu par fiche sont des hypothèses. Ce sont les deux leviers à mesurer en premier.", False),
    ("Prix publics au 12/10/2026. Les prix Gemini Flash doublent au 01/01/2027. Change €/$ non vérifié.", False),
    ("Non inclus : salaires de l'équipe (sauf MLOps des scénarios fine-tunés), développement, acquisition client, juridique.", False),
    ("Vérification : formules recalculées avec le moteur Python « formulas » et comparées à un calcul indépendant.", False),
]
for i, (txt, bold) in enumerate(lines):
    put(ws, f"A{4+i}", txt, kind="text", bold=bold)
widths(ws, {"A": 140})

for w in wb.worksheets:
    w.sheet_view.showGridLines = False
wb.calculation.fullCalcOnLoad = True
wb.active = 1
wb.save(OUT)
print("Tableur écrit :", OUT)
