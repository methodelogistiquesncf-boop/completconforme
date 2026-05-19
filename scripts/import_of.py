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

# ─── MAPPING DES COLONNES (identique au JS) ───────────────────────────────────
COL = {
    "code_piece":     "Code pièce",
    "design_piece":   "Désignation pièce",
    "qte_piece":      "Quantité pièce",
    "code_kit":       "Code kit",
    "design_kit":     "Désignation kit",
    "code_contenant": "code_contenant",
    "engin":          "Engin",
    "caisse":         "Caisse",
    "emplacement":    "emplacement_reflex",
}

# Colonnes alternatives acceptées (pour fichiers légèrement différents)
COL_FALLBACKS = {
    "code_kit":    ["Code kit", "code_kit", "CodeKit"],
    "design_kit":  ["Désignation kit", "designations kit", "nom_kit", "Désig. kit"],
    "engin":       ["Engin", "engin", "ENGIN"],
    "emplacement": ["emplacement_reflex", "emplacement", "Emplacement"],
    "design_piece":["Désignation pièce", "designation article", "designations article", "Désig. pièce"],
    "qte_piece":   ["Quantité pièce", "quantite", "Quantite", "quantité", "Qté"],
    "code_piece":  ["Code pièce", "code_piece", "CodePiece"],
}


def resolve_col(df_cols: list, key: str) -> str | None:
    """Retourne le nom de colonne réel parmi les fallbacks."""
    for candidate in COL_FALLBACKS.get(key, [COL[key]]):
        if candidate in df_cols:
            return candidate
    return None


# ─── INIT FIREBASE ────────────────────────────────────────────────────────────

def init_firebase() -> firestore.client:
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

    # ─── 1. FILTRE : COLONNES À GARDER ──────────────────────────────────────
    colonnes_a_garder = [
        "Code pièce",
        "Désignation pièce",
        "Quantité pièce",
        "Code kit",
        "Désignation kit",
        "code_contenant",
        "emplacement_reflex",
        "Engin",
        "Caisse"
    ]
    colonnes_presentes = [c for c in colonnes_a_garder if c in df.columns]
    df = df[colonnes_presentes]

    # ─── 2. FILTRE : LIGNES À GARDER (EMPLACEMENTS VALIDES) ─────────────────
    config_path = "emplacements_autorises.txt"
    
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            emplacements_a_garder = [ligne.strip() for ligne in f if ligne.strip()]
        
        c_emp = resolve_col(list(df.columns), "emplacement")
        
        if c_emp and c_emp in df.columns:
            df = df[df[c_emp].str.strip().isin(emplacements_a_garder)]
            print(f"   [FILTER] Filtrage appliqué : seuls les emplacements de '{config_path}' sont conservés.", flush=True)
        else:
            print("   [WARN] Colonne d'emplacement introuvable pour appliquer le filtre de lignes.", flush=True)
    else:
        print(f"   [INFO] Aucun fichier '{config_path}' trouvé à la racine. Toutes les lignes sont conservées.", flush=True)

    # ─── 3. AJOUT DE L'ID DU KIT DIRECTEMENT DANS LE EXCEL ──────────────────
    c_engin = resolve_col(list(df.columns), "engin")
    c_kit = resolve_col(list(df.columns), "code_kit")

    if c_engin and c_kit:
        df["id_kit"] = df[c_engin].str.strip() + "_" + df[c_kit].str.strip()
        print("   [DATA] Colonne 'id_kit' générée avec succès.", flush=True)

    print(f"   [DATA] Taille finale après filtres : {df.shape[0]} lignes, {df.shape[1]} colonnes", flush=True)

    df = df.fillna("")
    return df


# ─── CONSTRUCTION DE L'INDEX ─────────────────────────────────────────────────

def construire_index(df: pd.DataFrame) -> dict:
    cols = list(df.columns)

    c_kit        = resolve_col(cols, "code_kit")
    c_kit_nom    = resolve_col(cols, "design_kit")
    c_engin      = resolve_col(cols, "engin")
    c_emp        = resolve_col(cols, "emplacement")
    c_piece_nom = resolve_col(cols, "design_piece")
    c_piece_qte = resolve_col(cols, "qte_piece")
    c_piece_code= resolve_col(cols, "code_piece")
    c_contenant = COL["code_contenant"] if COL["code_contenant"] in cols else None
    c_caisse    = COL["caisse"]         if COL["caisse"] in cols          else None

    manquantes = [k for k, v in {"code_kit": c_kit, "engin": c_engin, "emplacement": c_emp}.items() if not v]
    if manquantes:
        raise ValueError(f"Colonnes obligatoires introuvables : {manquantes}\n"
                         f"Colonnes disponibles : {cols}")

    index: dict[str, dict[str, dict]] = {}

    for _, row in df.iterrows():
        emp_id   = str(row[c_emp]).strip()
        code_kit = str(row[c_kit]).strip()
        engin    = str(row[c_engin]).strip()

        if not emp_id or not code_kit or not engin:
            continue

        kit_id   = f"{engin}_{code_kit}"
        nom_kit  = str(row[c_kit_nom]).strip() if c_kit_nom else "Kit sans nom"
        contenant = str(row[c_contenant]).strip() if c_contenant else ""
        caisse    = str(row[c_caisse]).strip()   if c_caisse    else ""

        if emp_id not in index:
            index[emp_id] = {}

        if kit_id not in index[emp_id]:
            index[emp_id][kit_id] = {
                "id_kit":         kit_id,
                "engin":          engin,
                "code_kit":       code_kit,
                "nom_du_kit":     nom_kit,
                "code_contenant": contenant,
                "caisse":         caisse,
                "composants":     [],
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

    # Initialisation du lot (batch) Firestore et du compteur
    batch = db.batch()
    operations_dans_le_batch = 0

    for emp_id, kits in index.items():
        # 1. Préparation de l'emplacement
        try:
            emp_ref = db.collection("emplacements").document(emp_id)
            batch.set(emp_ref, {"id": emp_id}, merge=True)
            operations_dans_le_batch += 1
        except Exception as e:
            print(f"  [WARN] Préparation emplacement {emp_id} : {e}", flush=True)

        # 2. Préparation des kits et nomenclatures
        for kit_id, kit_data in kits.items():
            try:
                # Kit lié à l'emplacement
                kit_ref = db.collection("emplacements").document(emp_id)\
                            .collection("kits").document(kit_id)
                
                payload = {
                    **kit_data,
                    "statut_conformite":    "Non vérifié",
                    "derniere_mise_a_jour": maintenant,
                }
                batch.set(kit_ref, payload)
                operations_dans_le_batch += 1

                # Nomenclature globale
                nom_ref = db.collection("nomenclature_kits").document(kit_id)
                batch.set(nom_ref, kit_data)
                operations_dans_le_batch += 1
                
                stats["ecrits"] += 1

            except Exception as e:
                stats["erreurs"] += 1
                print(f"  [ERR]  Préparation {emp_id}/{kit_id} : {e}", flush=True)

            # Firestore limite à 500 opérations max par batch. On valide à 450 par sécurité.
            if operations_dans_le_batch >= 450:
                print("→ Envoi d'un groupe de données vers Firestore...", flush=True)
                batch.commit()
                batch = db.batch()  # On réouvre un nouveau lot vide
                operations_dans_le_batch = 0

    # Envoi des dernières opérations restantes après la boucle
    if operations_dans_le_batch > 0:
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

    # ETAPE 1 : Lecture et nettoyage automatique du fichier
    print(f"→ 1. Lecture et nettoyage du fichier {import_file}…", flush=True)
    df = lire_fichier(import_file)
    print(f"  {len(df)} lignes valides après filtres.", flush=True)

    # ETAPE 2 : Sauvegarde immédiate de la copie propre
    os.makedirs("imports/cleaned", exist_ok=True)
    nom_origine = pathlib.Path(import_file).name
    fichier_nettoye = f"imports/cleaned/cleaned_{nom_origine}"
    
    print(f"→ 2. Sauvegarde de la copie nettoyée : {fichier_nettoye}…", flush=True)
    if fichier_nettoye.endswith((".xlsx", ".xls")):
        df.to_excel(fichier_nettoye, index=False)
    else:
        df.to_csv(fichier_nettoye, index=False, encoding="utf-8")

    # ETAPE 3 : Préparation des structures (Index)
    print("→ 3. Préparation des structures de données (Index)…", flush=True)
    index = construire_index(df)
    total_emp  = len(index)
    total_kits = sum(len(v) for v in index.values())
    print(f"  {total_emp} emplacement(s) · {total_kits} kit(s) générés.", flush=True)

    if total_kits == 0:
        print("❌ Aucun kit valide détecté après filtrage. Fin du traitement.", flush=True)
        sys.exit(0)

    # ETAPE 4 : Connexion Firebase et Injection (Dernière étape)
    print("→ 4. Initialisation Firebase & Connexion base de données…", flush=True)
    db = init_firebase()

    print("→ 5. Injection finale dans Firestore…", flush=True)
    stats = injecter(db, index)

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
