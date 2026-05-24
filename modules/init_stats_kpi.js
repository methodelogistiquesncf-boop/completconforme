// ─────────────────────────────────────────────────────────────────────────────
// scripts/init_stats_kpi.js — À exécuter UNE SEULE FOIS dans la console admin
//
// Ce script lit toute la collection historique_controles et construit
// le document "stats/kpi" à partir des données existantes.
//
// Usage : coller dans la console navigateur sur la page admin après connexion,
// ou appeler via un bouton admin temporaire.
//
// ⚠️ Ce script fait N lectures (tous les historiques existants) — à n'exécuter
//    qu'une seule fois. Après initialisation, c'est terrain.js qui maintient
//    le document via increment() à chaque validation.
// ─────────────────────────────────────────────────────────────────────────────
import {
    collection, getDocs, doc, setDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db }          from "./firebase.js";
import { numSemaine }  from "./utils.js";
import { showToast }   from "./utils.js";

export async function initialiserDocumentStats() {
    showToast("⏳ Initialisation du document stats/kpi…", "info");

    try {
        const snap    = await getDocs(collection(db, "historique_controles"));
        const kpi = {
            total:       0,
            conformes:   0,
            incomplets:  0,
            par_engin:   {},
            par_semaine: {},
        };

        snap.forEach(d => {
            const e      = d.data();
            const statut = e.statut || "";
            const engin  = e.engin  || "—";

            kpi.total++;
            if (statut === "Conforme")  kpi.conformes++;
            if (statut === "Incomplet") kpi.incomplets++;

            // par engin
            if (!kpi.par_engin[engin])
                kpi.par_engin[engin] = { total: 0, conformes: 0 };
            kpi.par_engin[engin].total++;
            if (statut === "Conforme") kpi.par_engin[engin].conformes++;

            // par semaine
            if (e.timestamp) {
                const d2  = new Date(e.timestamp);
                const lbl = `${d2.getFullYear()}-W${String(numSemaine(d2)).padStart(2, '0')}`;
                if (!kpi.par_semaine[lbl])
                    kpi.par_semaine[lbl] = { total: 0, conformes: 0, incomplets: 0 };
                kpi.par_semaine[lbl].total++;
                if (statut === "Conforme")  kpi.par_semaine[lbl].conformes++;
                if (statut === "Incomplet") kpi.par_semaine[lbl].incomplets++;
            }
        });

        await setDoc(doc(db, "stats", "kpi"), kpi);

        showToast(
            `✅ Document stats/kpi initialisé — ${kpi.total} contrôle(s) traités.`,
            "success"
        );
        console.log("[Stats] Document créé :", kpi);

    } catch (err) {
        showToast("❌ " + err.message, "error");
        console.error("[Stats] Erreur initialisation :", err);
    }
}
