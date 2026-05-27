// ─────────────────────────────────────────────────────────────────────────────
// modules/export.js
// Charge toujours les données directement depuis Firestore
// (conformes + incomplets, sans limite arbitraire).
// ─────────────────────────────────────────────────────────────────────────────
import {
    collection, getDocs, query, orderBy,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db }          from "./firebase.js";
import { showToast }   from "./utils.js";

// ─── Chargement SheetJS ───────────────────────────────────────────────────────
async function loadXLSX() {
    if (window.XLSX) return window.XLSX;
    await new Promise((resolve, reject) => {
        const s    = document.createElement('script');
        s.src      = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        s.onload   = resolve;
        s.onerror  = reject;
        document.head.appendChild(s);
    });
    return window.XLSX;
}

// ─── Chargement de tous les contrôles ────────────────────────────────────────
// Conformes ET incomplets, triés par date décroissante.
async function _chargerTousLesControles() {
    const q    = query(
        collection(db, "historique_controles"),
        orderBy("timestamp", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT HISTORIQUE COMPLET
// ═══════════════════════════════════════════════════════════════════════════════
export async function exportHistorique() {
    showToast("⏳ Chargement des données…", "info");
    try {
        const entries = await _chargerTousLesControles();
        if (!entries.length) {
            showToast("Aucun contrôle enregistré.", "error");
            return;
        }

        const XLSX = await loadXLSX();
        const rows = [];

        entries.forEach(e => {
            const details = e.detail_verification || [];
            if (details.length) {
                details.forEach(c => {
                    rows.push({
                        "Date":         e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR') : "",
                        "Emplacement":  e.empId              || "",
                        "Engin":        e.engin              || "",
                        "Kit ID":       e.kitId              || "",
                        "Nom du kit":   e.nom_du_kit         || "",
                        "Code kit":     e.code_kit           || "",
                        "Contenant":    e.code_contenant     || "",
                        "Statut":       e.statut             || "",
                        "Vérificateur": e.verificateur_email || "",
                        "Composant":    c.nom                || "",
                        "Code pièce":   c.code_piece         || "",
                        "Qté requise":  c.quantite_requise   ?? "",
                        "Qté comptée":  c.quantite_comptee   ?? "",
                        "Écart":        (c.quantite_comptee != null && c.quantite_requise != null)
                                            ? c.quantite_comptee - c.quantite_requise
                                            : "",
                    });
                });
            } else {
                rows.push({
                    "Date":         e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR') : "",
                    "Emplacement":  e.empId              || "",
                    "Engin":        e.engin              || "",
                    "Kit ID":       e.kitId              || "",
                    "Nom du kit":   e.nom_du_kit         || "",
                    "Code kit":     e.code_kit           || "",
                    "Contenant":    e.code_contenant     || "",
                    "Statut":       e.statut             || "",
                    "Vérificateur": e.verificateur_email || "",
                    "Composant":    "",
                    "Code pièce":   "",
                    "Qté requise":  "",
                    "Qté comptée":  "",
                    "Écart":        "",
                });
            }
        });

        _telecharger(XLSX, rows, "historique_controles");
        showToast(`✅ ${entries.length} contrôle(s) exporté(s) — ${rows.length} lignes.`, "success");

    } catch (err) {
        showToast("❌ " + err.message, "error");
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT STATS PAR ENGIN
// ═══════════════════════════════════════════════════════════════════════════════
export async function exportStatsEngin() {
    showToast("⏳ Chargement des données…", "info");
    try {
        const entries = await _chargerTousLesControles();
        if (!entries.length) {
            showToast("Aucun contrôle enregistré.", "error");
            return;
        }

        const XLSX = await loadXLSX();

        // ── Agrégation par engin ──────────────────────────────────────────────
        const map = {};
        entries.forEach(e => {
            const engin = (e.engin || "—").trim() || "—";
            if (!map[engin]) map[engin] = { total: 0, conformes: 0, incomplets: 0 };
            map[engin].total++;
            if (e.statut === "Conforme")  map[engin].conformes++;
            if (e.statut === "Incomplet") map[engin].incomplets++;
        });

        const rows = Object.entries(map)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([engin, s]) => ({
                "Engin":      engin,
                "Total":      s.total,
                "Conformes":  s.conformes,
                "Incomplets": s.incomplets,
                "Taux (%)":   s.total ? Math.round(s.conformes / s.total * 100) : 0,
            }));

        _telecharger(XLSX, rows, "stats_par_engin");
        showToast(`✅ ${rows.length} engin(s) exporté(s).`, "success");

    } catch (err) {
        showToast("❌ " + err.message, "error");
    }
}

// ─── Helper — génération du fichier ──────────────────────────────────────────
function _telecharger(XLSX, rows, nomFichier) {
    if (!rows.length) return;

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Export");

    // Largeurs de colonnes automatiques
    const keys = Object.keys(rows[0]);
    ws['!cols'] = keys.map(key => ({
        wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? "").length)) + 2,
    }));

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${nomFichier}_${date}.xlsx`);
}
