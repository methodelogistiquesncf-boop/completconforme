// ─────────────────────────────────────────────────────────────────────────────
// modules/stats.js
//
// Stratégie quota :
//   • KPI + évolution + par engin → 1 seule lecture (doc "stats/kpi")
//   • Top composants             → getDocs limité aux N derniers contrôles incomplets
//   • Export                     → utilise _entries (déjà chargées pour les composants)
//
// Le document "stats/kpi" est maintenu en temps réel par terrain.js
// à chaque appel de _valider() via increment().
// ─────────────────────────────────────────────────────────────────────────────
import {
    doc, getDoc,
    collection, query, where, orderBy, limit, getDocs,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db }                                    from "./firebase.js";
import { $, showToast, numSemaine, getWeekBounds } from "./utils.js";
import { exportHistorique, exportStatsEngin }      from "./export.js";

// ─── Constantes ───────────────────────────────────────────────────────────────
// On ne lit que les contrôles incomplets récents pour calculer les top composants.
// La limite est haute car on a besoin d'un vrai top — mais 0 lecture pour les KPI.
const COMPOSANTS_LIMIT = 300;

// ─── Données en mémoire ───────────────────────────────────────────────────────
let _kpiData    = null;   // contenu du doc stats/kpi (chargé une fois par session)
let _entries    = [];     // contrôles incomplets pour le top composants + export

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initStats() {
    $('btn-export-histo')?.addEventListener('click', () => exportHistorique(_entries));
    $('btn-export-engin')?.addEventListener('click', () => exportStatsEngin(_entries));
}

// ─── Chargement principal ─────────────────────────────────────────────────────
export async function chargerStatistiques() {
    const loading = $('stats-loading');
    const content = $('stats-content');

    // Déjà chargé cette session → re-rendu sans requête
    if (_kpiData) {
        _renderTout(_kpiData, _entries);
        return;
    }

    loading.classList.remove('hidden');
    content.classList.add('hidden');

    try {
        // ── 1 lecture : document de synthèse ─────────────────────────────────
        const kpiSnap = await getDoc(doc(db, "stats", "kpi"));
        _kpiData = kpiSnap.exists() ? kpiSnap.data() : {};

        // ── N lectures : incomplets récents (pour top composants + export) ────
        const q = query(
            collection(db, "historique_controles"),
            where("statut", "==", "Incomplet"),
            orderBy("timestamp", "desc"),
            limit(COMPOSANTS_LIMIT)
        );
        const snap = await getDocs(q);
        _entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        _renderTout(_kpiData, _entries);
        loading.classList.add('hidden');
        content.classList.remove('hidden');

    } catch (err) {
        loading.classList.add('hidden');
        showToast('⚠️ ' + err.message, 'error');
    }
}

/** Invalide le cache local — appelé par terrain.js après une validation. */
export function invaliderCacheStats() {
    _kpiData  = null;
    _entries  = [];
}

// ─── Orchestration du rendu ───────────────────────────────────────────────────
function _renderTout(kpi, entries) {
    renderStatsKPI(kpi);
    renderEvolution(kpi);
    renderParEngin(kpi);
    renderTopComposants(entries);
}

// ─── KPI ──────────────────────────────────────────────────────────────────────
// Les compteurs viennent du document de synthèse — 0 itération sur les docs.
export function renderStatsKPI(kpi) {
    const total      = kpi.total      || 0;
    const conformes  = kpi.conformes  || 0;
    const incomplets = kpi.incomplets || 0;
    const taux       = total ? Math.round(conformes / total * 100) : null;

    // Semaine en cours : issue du résumé hebdomadaire
    const now = new Date();
    const semLabel = `${now.getFullYear()}-W${String(numSemaine(now)).padStart(2, '0')}`;
    const semaine  = kpi.par_semaine?.[semLabel]?.total || 0;

    $('kpi-total').textContent      = total;
    $('kpi-taux').textContent       = taux !== null ? taux + '%' : '—';
    $('kpi-incomplets').textContent = incomplets;
    $('kpi-semaine').textContent    = semaine;

    const tauxCard = $('kpi-taux-card');
    if (tauxCard && taux !== null) {
        tauxCard.className = 'stats-kpi-card '
            + (taux >= 80 ? 'stats-kpi-green' : taux >= 50 ? 'stats-kpi-amber' : 'stats-kpi-red');
    }
}

// ─── Évolution 8 semaines ─────────────────────────────────────────────────────
// Les totaux hebdomadaires viennent du document de synthèse.
export function renderEvolution(kpi) {
    const el = $('chart-evolution');
    if (!el) return;

    const semaines_data = kpi.par_semaine || {};
    const weeks = [];

    for (let i = 7; i >= 0; i--) {
        const { start } = getWeekBounds(i);
        const label = `${start.getFullYear()}-W${String(numSemaine(start)).padStart(2, '0')}`;
        const w     = semaines_data[label] || { total: 0, conformes: 0, incomplets: 0 };
        weeks.push({ label: `S${String(numSemaine(start)).padStart(2, '0')}`, ...w });
    }

    const maxVal = Math.max(...weeks.map(w => w.total), 1);

    el.innerHTML = `
        <div class="evo-chart">
            ${weeks.map(w => `
                <div class="evo-col">
                    <div class="evo-bars">
                        <div class="evo-bar evo-bar-ko"
                             style="height:${(w.incomplets || 0) / maxVal * 100}%"
                             title="${w.incomplets || 0} non conforme(s)"></div>
                        <div class="evo-bar evo-bar-ok"
                             style="height:${(w.conformes || 0) / maxVal * 100}%"
                             title="${w.conformes || 0} conforme(s)"></div>
                    </div>
                    <div class="evo-total">${w.total || ''}</div>
                    <div class="evo-label">${w.label}</div>
                </div>
            `).join('')}
        </div>
        <div class="evo-legend">
            <span class="evo-legend-item">
                <span class="evo-dot" style="background:var(--green);"></span> Conforme
            </span>
            <span class="evo-legend-item">
                <span class="evo-dot" style="background:var(--accent);"></span> Non conforme
            </span>
        </div>
    `;
}

// ─── Top composants en écart ──────────────────────────────────────────────────
// Seule fonction qui lit de vrais documents — limitée aux incomplets récents.
export function renderTopComposants(entries) {
    const el = $('stats-top-composants');
    if (!el) return;

    const compteur = {};
    entries.forEach(e => {
        (e.detail_verification || []).forEach(c => {
            if (c.quantite_comptee !== null && c.quantite_comptee !== c.quantite_requise) {
                if (!compteur[c.nom]) {
                    compteur[c.nom] = { count: 0, code: c.code_pieces || '—' };
                }
                compteur[c.nom].count += 1;
            }
        });
    });

    const sorted = Object.entries(compteur)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 8);

    if (!sorted.length) {
        el.innerHTML = `<p class="stats-empty">Aucun composant manquant enregistré.</p>`;
        return;
    }

    const max = sorted[0][1].count;
    el.innerHTML = sorted.map(([nom, { count, code }], i) => `
        <div class="comp-stat-row">
            <span class="comp-stat-rank">${i + 1}</span>
            <div class="comp-stat-info">
                <div class="comp-stat-header">
<span class="comp-stat-nom">
    <span class="comp-stat-code">${code}</span>
    ${nom}
</span>
                    <span class="comp-stat-count">${count}×</span>
                </div>
                <div class="comp-stat-bar-wrap">
                    <div class="comp-stat-bar" style="width:${count / max * 100}%"></div>
                </div>
            </div>
        </div>
    `).join('');
}

// ─── Taux de conformité par engin ─────────────────────────────────────────────
// Vient du document de synthèse — 0 itération sur les docs.
export function renderParEngin(kpi) {
    const el = $('stats-par-engin');
    if (!el) return;

    const map  = kpi.par_engin || {};
    const rows = Object.entries(map)
        .map(([engin, s]) => ({
            engin,
            total:     s.total     || 0,
            conformes: s.conformes || 0,
            taux:      s.total ? Math.round((s.conformes || 0) / s.total * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total);

    if (!rows.length) {
        el.innerHTML = `<p class="stats-empty">Aucune donnée disponible.</p>`;
        return;
    }

    el.innerHTML = rows.map(r => {
        const color = r.taux >= 80 ? 'var(--green)' : r.taux >= 50 ? 'var(--amber)' : 'var(--accent)';
        return `
            <div class="engin-stat-row">
                <div class="engin-stat-left">
                    <span class="engin-stat-badge">${r.engin}</span>
                    <span class="engin-stat-detail">
                        ${r.total} contrôle${r.total > 1 ? 's' : ''}
                        · ${r.conformes} conforme${r.conformes > 1 ? 's' : ''}
                    </span>
                </div>
                <div class="engin-stat-right">
                    <div class="engin-stat-bar-wrap">
                        <div class="engin-stat-bar" style="width:${r.taux}%; background:${color};"></div>
                    </div>
                    <span class="engin-stat-taux" style="color:${color};">${r.taux}%</span>
                </div>
            </div>
        `;
    }).join('');
}

// ─── Arrêt (appelé à la déconnexion seulement) ────────────────────────────────
export function arreterStats() {
    _kpiData = null;
    _entries = [];
}
