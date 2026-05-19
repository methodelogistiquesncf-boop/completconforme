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
    config_path = "emplacements_autorises.txt"  # Nom de ton fichier sur le repo
    
    if os.path.exists(config_path):
        # On lit le fichier et on récupère chaque emplacement (un par ligne)
        with open(config_path, "r", encoding="utf-8") as f:
            emplacements_a_garder = [ligne.strip() for ligne in f if ligne.strip()]
        
        # On utilise ton mapping ou le nom direct pour cibler la bonne colonne
        c_emp = resolve_col(list(df.columns), "emplacement")
        
        if c_emp and c_emp in df.columns:
            # .isin() filtre pour ne garder que les lignes dont l'emplacement est dans la liste
            df = df[df[c_emp].str.strip().isin(emplacements_a_garder)]
            print(f"   [FILTER] Filtrage appliqué : seuls les emplacements de '{config_path}' sont conservés.", flush=True)
        else:
            print("   [WARN] Colonne d'emplacement introuvable pour appliquer le filtre de lignes.", flush=True)
    else:
        print(f"   [INFO] Aucun fichier '{config_path}' trouvé à la racine. Toutes les lignes sont conservées.", flush=True)

    print(f"   [DATA] Taille finale après filtres : {df.shape[0]} lignes, {df.shape[1]} colonnes", flush=True)
    # ──────────────────────────────────────────────────────────────────────

    df = df.fillna("")
    return df
