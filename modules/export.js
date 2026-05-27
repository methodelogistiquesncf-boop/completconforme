// ─────────────────────────────────────────────────────────────────────────────
// modules/export.js
// Exports limités aux 8 dernières semaines pour préserver le quota Firestore.
// ─────────────────────────────────────────────────────────────────────────────
import {
    collection, getDocs, query, orderBy, where,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db }        from "./firebase.js";
import { showToast } from "./utils.js";

// ─── Fenêtre temporelle ───────────────────────────────────────────────────────
const SEMAINES_EXPORT = 8;

/** Retourne la date ISO (string) du lundi il y a N semaines. */
function _dateDebut8Semaines() {
    const d = new Date();
    // Recule jusqu'au lundi de la semaine courante, puis N-1 semaines de plus
    const jourSemaine = (d.getDay() + 6) % 7; // lundi = 0
    d.setDate(d.getDate() - jourSemaine - (SEMAINES_EXPORT - 1) * 7);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

// ─── Chargement SheetJS ───────────────────────────────────────────────────────
async function loadXLSX() {
    if (window.XLSX) return window.XLSX;
    await new Promise((resolve, reject) => {
        const s  = document.createElement('script');
        s.src    = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
    return window.XLSX;
}

// ─── Chargement des contrôles (8 semaines) ───────────────────────────────────
async function _chargerControles() {
    const debut = _dateDebut8Semaines();
    const q = query(
        collection(db, "historique_controles"),
        where("timestamp", ">=", debut),
        orderBy("timestamp", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT HISTORIQUE
// ═══════════════════════════════════════════════════════════════════════════════
export async function exportHistorique() {
    showToast("⏳ Chargement des données (8 semaines)…", "info");
    try {
        const entries = await _chargerControles();
        if (!entries.length) {
            showToast("Aucun contrôle sur les 8 dernières semaines.", "error");
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
        showToast(`✅ ${entries.length} contrôle(s) — ${rows.length} lignes exportées.`, "success");

    } catch (err) {
        showToast("❌ " + err.message, "error");
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT STATS PAR ENGIN
// ═══════════════════════════════════════════════════════════════════════════════
export async function exportStatsEngin() {
    showToast("⏳ Chargement des données (8 semaines)…", "info");
    try {
        const entries = await _chargerControles();
        if (!entries.length) {
            showToast("Aucun contrôle sur les 8 dernières semaines.", "error");
            return;
        }

        const XLSX = await loadXLSX();

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

// ─── Helper — génération fichier Excel ───────────────────────────────────────
function _telecharger(XLSX, rows, nomFichier) {
    if (!rows.length) return;

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Export");

    const keys = Object.keys(rows[0]);
    ws['!cols'] = keys.map(key => ({
        wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? "").length)) + 2,
    }));

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${nomFichier}_${date}.xlsx`);
}
