// modules/export.js
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { showToast } from "./utils.js";

// Chargement dynamique de SheetJS (CDN, pas besoin de npm)
async function loadXLSX() {
    if (window.XLSX) return window.XLSX;
    await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
    return window.XLSX;
}

// ─── Export historique_controles ──────────────────────────────────────────────
export async function exportHistorique(filtres = {}) {
    showToast("⏳ Génération du fichier…", "info");
    try {
        const XLSX = await loadXLSX();
        const snap = await getDocs(collection(db, "historique_controles"));
        
        const rows = [];
        snap.forEach(d => {
            const e = d.data();
            
            // Une ligne par composant si vous voulez le détail
            const details = e.detail_verification || [];
            if (details.length) {
                details.forEach(c => {
                    rows.push({
                        "Date":               e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR') : "",
                        "Emplacement":        e.empId || "",
                        "Engin":              e.engin || "",
                        "Kit ID":             e.kitId || "",
                        "Nom du kit":         e.nom_du_kit || "",
                        "Code kit":           e.code_kit || "",
                        "Contenant":          e.code_contenant || "",
                        "Statut":             e.statut || "",
                        "Vérificateur":       e.verificateur_email || "",
                        "Composant":          c.nom || "",
                        "Qté requise":        c.quantite_requise ?? "",
                        "Qté comptée":        c.quantite_comptee ?? "",
                        "Écart":              (c.quantite_comptee != null && c.quantite_requise != null)
                                                ? c.quantite_comptee - c.quantite_requise
                                                : "",
                    });
                });
            } else {
                rows.push({
                    "Date":           e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR') : "",
                    "Emplacement":    e.empId || "",
                    "Engin":          e.engin || "",
                    "Kit ID":         e.kitId || "",
                    "Nom du kit":     e.nom_du_kit || "",
                    "Code kit":       e.code_kit || "",
                    "Contenant":      e.code_contenant || "",
                    "Statut":         e.statut || "",
                    "Vérificateur":   e.verificateur_email || "",
                });
            }
        });

        _telecharger(XLSX, rows, "historique_controles");
        showToast(`✅ ${rows.length} lignes exportées.`, "success");

    } catch (err) {
        showToast("❌ " + err.message, "error");
    }
}

// ─── Export stats par engin ───────────────────────────────────────────────────
export async function exportStatsEngin() {
    showToast("⏳ Génération du fichier…", "info");
    try {
        const XLSX = await loadXLSX();
        const snap = await getDocs(collection(db, "historique_controles"));

        const map = {};
        snap.forEach(d => {
            const e     = d.data();
            const engin = e.engin || "—";
            if (!map[engin]) map[engin] = { total: 0, conformes: 0, incomplets: 0 };
            map[engin].total++;
            if (e.statut === "Conforme")  map[engin].conformes++;
            if (e.statut === "Incomplet") map[engin].incomplets++;
        });

        const rows = Object.entries(map).map(([engin, s]) => ({
            "Engin":        engin,
            "Total":        s.total,
            "Conformes":    s.conformes,
            "Incomplets":   s.incomplets,
            "Taux (%)":     s.total ? Math.round(s.conformes / s.total * 100) : 0,
        }));

        _telecharger(XLSX, rows, "stats_par_engin");
        showToast(`✅ Export terminé.`, "success");

    } catch (err) {
        showToast("❌ " + err.message, "error");
    }
}

// ─── Helper interne ───────────────────────────────────────────────────────────
function _telecharger(XLSX, rows, nomFichier) {
    const ws  = XLSX.utils.json_to_sheet(rows);
    const wb  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Export");

    // Largeurs de colonnes automatiques
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
        wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? "").length)) + 2
    }));
    ws['!cols'] = colWidths;

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${nomFichier}_${date}.xlsx`);
}
