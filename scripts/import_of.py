"""
import_of.py — CompletConforme
Traitement du fichier Excel OF, nettoyage/filtrage et injection dans Firestore.
Déclenché par GitHub Actions sur push dans imports/pending/.

Variables d'environnement requises :
  FIREBASE_SERVICE_ACCOUNT  JSON du compte de service Firebase (secret GitHub)
  IMPORT_FILE                Chemin relatif du fichier à traiter (ex: imports/pending/of.xlsx)
"""

import json
import os
import sys
import datetime
import pathlib
import traceback

import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore

# ─── MAPPING DES COLONNES ─────────────────────────────────────────────────────
COL = {
    "code_piece":                "Code pièce",
    "design_piece":              "Désignation pièce",
    "qte_piece":                 "Quantité pièce",
    "code_kit":                  "Code kit",
    "design_kit":                "Désignation kit",
    "code_contenant":            "code_contenant",
    "engin":                     "Engin",
    "caisse":                    "Caisse",
    "emplacement":               "emplacement_reflex",
    "emplacement_wms_remontage": "emplacement wms entree remontage",
    "date_debut":                "Date de début",
}

# Colonnes alternatives acceptées (pour fichiers légèrement différents)
COL_FALLBACKS = {
    "code_kit":                  ["Code kit", "code_kit", "CodeKit"],
    "design_kit":                ["Désignation kit", "designations kit", "nom_kit", "Désig. kit"],
    "engin":                     ["Engin", "engin", "ENGIN"],
    "emplacement":               ["emplacement_reflex", "emplacement", "Emplacement"],
    "design_piece":              ["Désignation pièce", "designation article", "designations article", "Désig. pièce"],
    "qte_piece":                 ["Quantité pièce", "quantite", "Quantite", "quantité", "Qté"],
    "code_piece":                ["Code pièce", "code_piece", "CodePiece"],
    "code_contenant":            ["code_contenant"],
    "caisse":                    ["Caisse", "caisse"],
    "emplacement_wms_remontage": ["emplacement wms entree remontage", "emplacement_wms_entree_remontage", "emplacement wms entree remontage "],
    "date_debut":                ["Date de début", "Date de debut", "date_debut"],
}


def resolve_col(df_cols: list, key: str) -> str | None:
    """Retourne le nom de colonne réel parmi les fallbacks."""
    candidates = COL_FALLBACKS.get(key)
    if not candidates:
        default = COL.get(key)
        if default and default in df_cols:
            return default
        return None
    for candidate in candidates:
        if candidate in df_cols:
            return candidate
    return None


def parse_date(val: str) -> datetime.datetime | str:
    """
    Convertit une string en datetime Python (→ Timestamp Firestore automatiquement).
    Retourne la string brute si aucun format ne correspond.
    """
    for fmt in (
        "%d/%m/%Y",
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
    ):
        try:
            return datetime.datetime.strptime(val.strip(), fmt)
        except ValueError:
            continue
    return val  # fallback : string brute conservée telle quelle


# ─── INIT FIREBASE ────────────────────────────────────────────────────────────

def init_firebase() -> firestore.Client:
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa_json:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT manquant dans les secrets GitHub.")

    sa_dict = json.loads(sa_json)
    cred = credentials.Certificate(sa_dict)
    firebase_admin.initialize_app(cred)
    return firestore.client()


# ─── LECTURE ET NETTOYAGE DU FICHIER ──────────────────────────────────────────

def lire_fichier(path: str) -> pd.DataFrame:
    ext = pathlib.Path(path).suffix.lower()
    if ext in (".xlsx", ".xls"):
        df = pd.read_excel(path, dtype=str)
    elif ext == ".csv":
        try:
            df = pd.read_csv(path, dtype=str, encoding="utf-8")
        except UnicodeDecodeError:
            df = pd.read_csv(path, dtype=str, encoding="latin-1")
    else:
        raise ValueError(f"Format non supporté : {ext}")

    # Nettoyage des espaces autour des noms de colonnes
    df.columns = [str(c).strip() for c in df.columns]

    # ─── 1. FILTRE : LIGNES À GARDER (EMPLACEMENTS VALIDES) ─────────────────
    # NOTE : appliqué AVANT la réduction des colonnes pour garder la colonne d'emplacement
    config_path = "emplacements_autorises.txt"

    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            emplacements_a_garder = [ligne.strip() for ligne in f if ligne.strip()]

        c_emp = resolve_col(list(df.columns), "emplacement")

        if c_emp:
            avant = len(df)
            df = df[df[c_emp].str.strip().isin(emplacements_a_garder)]
            print(f"   [FILTER] {avant - len(df)} ligne(s) supprimée(s) — "
                  f"seuls les emplacements de '{config_path}' sont conservés.", flush=True)
        else:
            print("   [WARN] Colonne d'emplacement introuvable pour appliquer le filtre de lignes.", flush=True)
    else:
        print(f"   [INFO] Aucun fichier '{config_path}' trouvé. Toutes les lignes sont conservées.", flush=True)

    # ─── 2. FILTRE : COLONNES À GARDER ──────────────────────────────────────
    # On conserve TOUTES les colonnes connues (via fallbacks) pour ne rien perdre.
    colonnes_a_garder: list[str] = []
    for key in COL_FALLBACKS:
        col_reelle = resolve_col(list(df.columns), key)
        if col_reelle and col_reelle not in colonnes_a_garder:
            colonnes_a_garder.append(col_reelle)

    df = df[colonnes_a_garder]

    # ─── 3. GÉNÉRATION DE L'ID KIT ──────────────────────────────────────────
    c_engin = resolve_col(list(df.columns), "engin")
    c_kit   = resolve_col(list(df.columns), "code_kit")

    if c_engin and c_kit:
        df = df.copy()  # évite le SettingWithCopyWarning
        df["id_kit"] = df[c_engin].str.strip() + "_" + df[c_kit].str.strip()
        print("   [DATA] Colonne 'id_kit' générée avec succès.", flush=True)
    else:
        print("   [WARN] Colonnes 'engin' ou 'code_kit' introuvables : 'id_kit' non générée.", flush=True)

    print(f"   [DATA] Taille finale après filtres : {df.shape[0]} lignes, {df.shape[1]} colonnes", flush=True)

    df = df.fillna("")
    return df


# ─── CONSTRUCTION DE L'INDEX ──────────────────────────────────────────────────

def construire_index(df: pd.DataFrame) -> dict:
    cols = list(df.columns)

    c_kit        = resolve_col(cols, "code_kit")
    c_kit_nom    = resolve_col(cols, "design_kit")
    c_engin      = resolve_col(cols, "engin")
    c_emp        = resolve_col(cols, "emplacement")
    c_piece_nom  = resolve_col(cols, "design_piece")
    c_piece_qte  = resolve_col(cols, "qte_piece")
    c_piece_code = resolve_col(cols, "code_piece")
    c_contenant  = resolve_col(cols, "code_contenant")
    c_caisse     = resolve_col(cols, "caisse")
    c_emp_wms    = resolve_col(cols, "emplacement_wms_remontage")
    c_date_debut = resolve_col(cols, "date_debut")

    # Log des colonnes optionnelles absentes
    if not c_emp_wms:
        print("   [INFO] Colonne 'emplacement_wms_remontage' absente — champ laissé vide.", flush=True)
    if not c_date_debut:
        print("   [INFO] Colonne 'date_debut' absente — champs calendrier laissés vides.", flush=True)

    manquantes = [k for k, v in {"code_kit": c_kit, "engin": c_engin, "emplacement": c_emp}.items() if not v]
    if manquantes:
        raise ValueError(
            f"Colonnes obligatoires introuvables : {manquantes}\n"
            f"Colonnes disponibles : {cols}"
        )

    index: dict[str, dict[str, dict]] = {}

    for _, row in df.iterrows():
        emp_id   = str(row[c_emp]).strip()
        code_kit = str(row[c_kit]).strip()
        engin    = str(row[c_engin]).strip()

        if not emp_id or not code_kit or not engin:
            continue

        kit_id    = f"{engin}_{code_kit}"
        nom_kit   = str(row[c_kit_nom]).strip()   if c_kit_nom   else "Kit sans nom"
        contenant = str(row[c_contenant]).strip() if c_contenant else ""
        caisse    = str(row[c_caisse]).strip()    if c_caisse    else ""
        emp_wms   = str(row[c_emp_wms]).strip()   if c_emp_wms   else ""

        # ─── Traitement de la date_debut ────────────────────────────────────
        # On génère un vrai Timestamp Firestore + des champs calculés pour
        # permettre des requêtes efficaces par jour / semaine / mois / année
        # depuis le calendrier du site.
        date_raw   = str(row[c_date_debut]).strip() if c_date_debut else ""
        date_obj   = parse_date(date_raw) if date_raw else None

        if isinstance(date_obj, datetime.datetime):
            # Champs calculés pour les requêtes calendrier
            date_debut     = date_obj                           # → Timestamp Firestore
            date_debut_iso = date_obj.strftime("%Y-%m-%d")     # ex: "2025-06-10"  (tri alphabétique = tri chronologique)
            annee          = date_obj.year                      # ex: 2025
            mois           = date_obj.month                     # ex: 6
            semaine        = date_obj.isocalendar()[1]          # ex: 24  (ISO week number)
            jour_semaine   = date_obj.weekday()                 # 0=lundi … 6=dimanche
        else:
            # Date absente ou format inconnu : on stocke quand même la string brute
            date_debut     = date_raw
            date_debut_iso = ""
            annee          = None
            mois           = None
            semaine        = None
            jour_semaine   = None

        if emp_id not in index:
            index[emp_id] = {}

        if kit_id not in index[emp_id]:
            index[emp_id][kit_id] = {
                # ── Identifiants ──────────────────────────────────────────
                "id_kit":                    kit_id,
                "engin":                     engin,
                "code_kit":                  code_kit,
                "nom_du_kit":                nom_kit,
                # ── Logistique ────────────────────────────────────────────
                "code_contenant":            contenant,
                "caisse":                    caisse,
                "emplacement_wms_remontage": emp_wms,
                # ── Calendrier (requêtables depuis le site) ───────────────
                "date_debut":                date_debut,      # Timestamp Firestore (ou string brute)
                "date_debut_iso":            date_debut_iso,  # "YYYY-MM-DD" pour tri/affichage
                "annee":                     annee,           # filtre par année
                "mois":                      mois,            # filtre par mois
                "semaine":                   semaine,         # filtre par semaine ISO
                "jour_semaine":              jour_semaine,    # 0=lundi … 6=dimanche
                # ── Composants ────────────────────────────────────────────
                "composants":                [],
            }

        nom_piece  = str(row[c_piece_nom]).strip()  if c_piece_nom  else ""
        code_piece = str(row[c_piece_code]).strip() if c_piece_code else ""
        try:
            qte = int(float(str(row[c_piece_qte]).strip())) if c_piece_qte else 1
        except (ValueError, TypeError):
            qte = 1

        if nom_piece:
            index[emp_id][kit_id]["composants"].append({
                "nom":              nom_piece,
                "code_piece":       code_piece,
                "quantite_requise": max(1, qte),
            })

    return index


# ─── INJECTION FIRESTORE OPTIMISÉE (BATCHES) ──────────────────────────────────

def injecter(db, index: dict) -> dict:
    stats = {"ecrits": 0, "ignores": 0, "erreurs": 0}
    maintenant = datetime.datetime.utcnow().isoformat() + "Z"

    batch = db.batch()
    ops   = 0

    def commit_si_plein(seuil: int = 450):
        """Valide le batch courant et en ouvre un nouveau si le seuil est atteint."""
        nonlocal batch, ops
        if ops >= seuil:
            print("→ Envoi d'un groupe de données vers Firestore...", flush=True)
            batch.commit()
            batch = db.batch()
            ops   = 0

    emplacements_ecrits: set[str] = set()

    for emp_id, kits in index.items():

        # 1. Écriture de l'emplacement (une seule fois par emp_id)
        if emp_id not in emplacements_ecrits:
            try:
                emp_ref = db.collection("emplacements").document(emp_id)
                batch.set(emp_ref, {"id": emp_id}, merge=True)
                ops += 1
                emplacements_ecrits.add(emp_id)
                commit_si_plein()
            except Exception as e:
                print(f"  [WARN] Préparation emplacement {emp_id} : {e}", flush=True)

        # 2. Écriture des kits et nomenclatures
        for kit_id, kit_data in kits.items():
            try:
                kit_ref = (
                    db.collection("emplacements")
                      .document(emp_id)
                      .collection("kits")
                      .document(kit_id)
                )
                payload = {
                    **kit_data,
                    "statut_conformite":    "Non vérifié",
                    "derniere_mise_a_jour": maintenant,
                }
                batch.set(kit_ref, payload)
                ops += 1
                commit_si_plein()

                # Nomenclature globale
                nom_ref = db.collection("nomenclature_kits").document(kit_id)
                batch.set(nom_ref, kit_data)
                ops += 1
                commit_si_plein()

                stats["ecrits"] += 1

            except Exception as e:
                stats["erreurs"] += 1
                print(f"  [ERR]  Préparation {emp_id}/{kit_id} : {e}", flush=True)

    # Envoi des opérations restantes
    if ops > 0:
        print("→ Envoi du dernier groupe de données vers Firestore...", flush=True)
        batch.commit()

    return stats


# ─── POINT D'ENTRÉE ───────────────────────────────────────────────────────────

def main():
    import_file = os.environ.get("IMPORT_FILE", "").strip()
    if not import_file:
        print("❌ IMPORT_FILE non défini.", flush=True)
        sys.exit(1)

    if not pathlib.Path(import_file).exists():
        print(f"❌ Fichier introuvable : {import_file}", flush=True)
        sys.exit(1)

    print(f"\n{'='*60}", flush=True)
    print(f"  CompletConforme — Nettoyage & Import", flush=True)
    print(f"  Fichier : {import_file}", flush=True)
    print(f"{'='*60}\n", flush=True)

    try:
        # ÉTAPE 1 : Lecture et nettoyage
        print(f"→ 1. Lecture et nettoyage du fichier {import_file}…", flush=True)
        df = lire_fichier(import_file)
        print(f"  {len(df)} lignes valides après filtres.", flush=True)

        # ÉTAPE 2 : Sauvegarde de la copie nettoyée
        os.makedirs("imports/cleaned", exist_ok=True)
        suffix          = pathlib.Path(import_file).suffix.lower()
        nom_origine     = pathlib.Path(import_file).name
        fichier_nettoye = f"imports/cleaned/cleaned_{nom_origine}"

        print(f"→ 2. Sauvegarde de la copie nettoyée : {fichier_nettoye}…", flush=True)
        if suffix in (".xlsx", ".xls"):
            df.to_excel(fichier_nettoye, index=False)
        else:
            df.to_csv(fichier_nettoye, index=False, encoding="utf-8")

        # ÉTAPE 3 : Construction de l'index
        print("→ 3. Préparation des structures de données (Index)…", flush=True)
        index = construire_index(df)
        total_emp  = len(index)
        total_kits = sum(len(v) for v in index.values())
        print(f"  {total_emp} emplacement(s) · {total_kits} kit(s) générés.", flush=True)

        if total_kits == 0:
            print("❌ Aucun kit valide détecté après filtrage. Fin du traitement.", flush=True)
            sys.exit(0)

        # ÉTAPE 4 : Connexion Firebase
        print("→ 4. Initialisation Firebase & Connexion base de données…", flush=True)
        db = init_firebase()

        # ÉTAPE 5 : Injection Firestore
        print("→ 5. Injection finale dans Firestore…", flush=True)
        stats = injecter(db, index)

    except Exception:
        print("\n❌ Erreur inattendue :", flush=True)
        traceback.print_exc()
        sys.exit(1)

    # Résumé final
    print(f"\n{'='*60}", flush=True)
    print(f"  ✅ {stats['ecrits']} kit(s) traité(s) avec succès", flush=True)
    if stats["erreurs"]:
        print(f"  ❌ {stats['erreurs']} erreur(s) rencontrée(s)", flush=True)
    print(f"{'='*60}\n", flush=True)

    if stats["erreurs"] and stats["ecrits"] == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
