"""
import_of.py — CompletConforme
Traitement du fichier Excel OF et injection dans Firestore.
Déclenché par GitHub Actions sur push dans imports/pending/.

Variables d'environnement requises :
  FIREBASE_SERVICE_ACCOUNT  JSON du compte de service Firebase (secret GitHub)
  IMPORT_FILE               Chemin relatif du fichier à traiter (ex: imports/pending/of.xlsx)
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


# ─── LECTURE DU FICHIER ───────────────────────────────────────────────────────

def lire_fichier(path: str) -> pd.DataFrame:
    ext = pathlib.Path(path).suffix.lower()
    if ext in (".xlsx", ".xls"):
        df = pd.read_excel(path, dtype=str)
    elif ext == ".csv":
        # Essai UTF-8 puis latin-1
        try:
            df = pd.read_csv(path, dtype=str, encoding="utf-8")
        except UnicodeDecodeError:
            df = pd.read_csv(path, dtype=str, encoding="latin-1")
    else:
        raise ValueError(f"Format non supporté : {ext}")

    df.columns = [str(c).strip() for c in df.columns]
    df = df.fillna("")
    return df


# ─── CONSTRUCTION DE L'INDEX ─────────────────────────────────────────────────

def construire_index(df: pd.DataFrame) -> dict:
    cols = list(df.columns)

    # Résolution des colonnes
    c_kit       = resolve_col(cols, "code_kit")
    c_kit_nom   = resolve_col(cols, "design_kit")
    c_engin     = resolve_col(cols, "engin")
    c_emp       = resolve_col(cols, "emplacement")
    c_piece_nom = resolve_col(cols, "design_piece")
    c_piece_qte = resolve_col(cols, "qte_piece")
    c_piece_code= resolve_col(cols, "code_piece")
    c_contenant = COL["code_contenant"] if COL["code_contenant"] in cols else None
    c_caisse    = COL["caisse"]         if COL["caisse"] in cols         else None

    # Colonnes obligatoires
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


# ─── INJECTION FIRESTORE ─────────────────────────────────────────────────────

def injecter(db, index: dict) -> dict:
    stats = {"ecrits": 0, "ignores": 0, "erreurs": 0}
    maintenant = datetime.datetime.utcnow().isoformat() + "Z"

    for emp_id, kits in index.items():
        # Création/mise à jour doc emplacement
        try:
            db.collection("emplacements").document(emp_id).set(
                {"id": emp_id}, merge=True
            )
        except Exception as e:
            print(f"  [WARN] emplacement {emp_id} : {e}", flush=True)

        for kit_id, kit_data in kits.items():
            try:
                kit_ref  = db.collection("emplacements").document(emp_id)\
                             .collection("kits").document(kit_id)
                kit_snap = kit_ref.get()

                if kit_snap.exists:
                    stats["ignores"] += 1
                    print(f"  [SKIP] {emp_id}/{kit_id} déjà présent", flush=True)
                    continue

                payload = {
                    **kit_data,
                    "statut_conformite":    "Non vérifié",
                    "derniere_mise_a_jour": maintenant,
                }
                kit_ref.set(payload)

                # Nomenclature globale
                nom_ref  = db.collection("nomenclature_kits").document(kit_id)
                nom_snap = nom_ref.get()
                if not nom_snap.exists:
                    nom_ref.set(kit_data)

                stats["ecrits"] += 1
                print(f"  [OK]   {emp_id}/{kit_id} ({len(kit_data['composants'])} pièces)", flush=True)

            except Exception as e:
                stats["erreurs"] += 1
                print(f"  [ERR]  {emp_id}/{kit_id} : {e}", flush=True)
                traceback.print_exc()

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
    print(f"  CompletConforme — Import OF", flush=True)
    print(f"  Fichier : {import_file}", flush=True)
    print(f"{'='*60}\n", flush=True)

    # 1. Firebase
    print("→ Initialisation Firebase…", flush=True)
    db = init_firebase()

    # 2. Lecture
    print(f"→ Lecture du fichier {import_file}…", flush=True)
    df = lire_fichier(import_file)
    print(f"  {len(df)} lignes lues.", flush=True)

    # 3. Construction index
    print("→ Construction de l'index…", flush=True)
    index = construire_index(df)
    total_emp  = len(index)
    total_kits = sum(len(v) for v in index.values())
    print(f"  {total_emp} emplacement(s) · {total_kits} kit(s) détectés.", flush=True)

    if total_kits == 0:
        print("❌ Aucun kit valide détecté. Vérifiez le fichier.", flush=True)
        sys.exit(1)

    # 4. Injection
    print("→ Injection dans Firestore…", flush=True)
    stats = injecter(db, index)

    # 5. Résumé
    print(f"\n{'='*60}", flush=True)
    print(f"  ✅ {stats['ecrits']} kit(s) ajouté(s)", flush=True)
    print(f"  ⏭  {stats['ignores']} kit(s) ignoré(s) (déjà présents)", flush=True)
    if stats["erreurs"]:
        print(f"  ❌ {stats['erreurs']} erreur(s)", flush=True)
    print(f"{'='*60}\n", flush=True)

    if stats["erreurs"] and stats["ecrits"] == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
