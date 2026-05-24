// ─────────────────────────────────────────────────────────────────────────────
// modules/stats.js — KPI, évolution 8 semaines, top composants, par engin
// ─────────────────────────────────────────────────────────────────────────────
import {
    collection, getDocs,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db }                               from "./firebase.js";
import { $, showToast, numSemaine, getWeekBounds } from "./utils.js";
import { exportHistorique, exportStatsEngin } from "./export.js";

let _entries = [];

export function initStats() {
    $('btn-export-histo')?.addEventListener('click', () => exportHistorique(_entries));
    $('btn-export-engin')?.addEventListener('click', () => exportStatsEngin(_entries));
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────
export async function chargerStatistiques() {
    const loading = $('stats-loading');
    const content = $('stats-content');
    loading.classList.remove('hidden');
    content.classList.add('hidden');
    try {
        const snap = await getDocs(collection(db, "historique_controles"));
        _entries = [];  // ← tableau du module, plus "const entries"
        snap.forEach(d => _entries.push({ id: d.id, ...d.data() }));
        _entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        renderStatsKPI(_entries);
        renderEvolution(_entries);
        renderTopComposants(_entries);
        renderParEngin(_entries);

        loading.classList.add('hidden');
        content.classList.remove('hidden');
    } catch (err) {
        loading.classList.add('hidden');
        showToast('⚠️ ' + err.message, 'error');
    }

}

// ─── KPI ──────────────────────────────────────────────────────────────────────
export function renderStatsKPI(entries) {
    const total      = entries.length;
    const conformes  = entries.filter(e => e.statut === 'Conforme').length;
    const incomplets = entries.filter(e => e.statut === 'Incomplet').length;
    const taux       = total ? Math.round(conformes / total * 100) : null;

    // Semaine en cours
    const now = new Date();
    const dow = now.getDay() || 7;
    const lundi = new Date(now);
    lundi.setDate(now.getDate() - dow + 1);
    lundi.setHours(0, 0, 0, 0);
    const semaine = entries.filter(e => new Date(e.timestamp) >= lundi).length;

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
export function renderEvolution(entries) {
    const el = $('chart-evolution');
    if (!el) return;

    const weeks = [];
    for (let i = 7; i >= 0; i--) {
        const { start, end } = getWeekBounds(i);
        const w = entries.filter(e => {
            const t = new Date(e.timestamp);
            return t >= start && t < end;
        });
        weeks.push({
            label:      `S${String(numSemaine(start)).padStart(2, '0')}`,
            total:      w.length,
            conformes:  w.filter(e => e.statut === 'Conforme').length,
            incomplets: w.filter(e => e.statut === 'Incomplet').length,
        });
    }

    const maxVal = Math.max(...weeks.map(w => w.total), 1);

    el.innerHTML = `
        <div class="evo-chart">
            ${weeks.map(w => `
                <div class="evo-col">
                    <div class="evo-bars">
                        <div class="evo-bar evo-bar-ko"
                             style="height:${w.incomplets / maxVal * 100}%"
                             title="${w.incomplets} non conforme(s)"></div>
                        <div class="evo-bar evo-bar-ok"
                             style="height:${w.conformes / maxVal * 100}%"
                             title="${w.conformes} conforme(s)"></div>
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
export function renderTopComposants(entries) {
    const el = $('stats-top-composants');
    if (!el) return;

    const compteur = {};
    entries
        .filter(e => e.statut === 'Incomplet')
        .forEach(e => {
            (e.detail_verification || []).forEach(c => {
                if (c.quantite_comptee !== null && c.quantite_comptee !== c.quantite_requise)
                    compteur[c.nom] = (compteur[c.nom] || 0) + 1;
            });
        });

    const sorted = Object.entries(compteur).sort((a, b) => b[1] - a[1]).slice(0, 8);

    if (!sorted.length) {
        el.innerHTML = `<p class="stats-empty">Aucun composant manquant enregistré.</p>`;
        return;
    }

    const max = sorted[0][1];
    el.innerHTML = sorted.map(([nom, count], i) => `
        <div class="comp-stat-row">
            <span class="comp-stat-rank">${i + 1}</span>
            <div class="comp-stat-info">
                <div class="comp-stat-header">
                    <span class="comp-stat-nom">${nom}</span>
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
export function renderParEngin(entries) {
    const el = $('stats-par-engin');
    if (!el) return;

    const map = {};
    entries.forEach(e => {
        const engin = e.engin || '—';
        if (!map[engin]) map[engin] = { total: 0, conformes: 0 };
        map[engin].total++;
        if (e.statut === 'Conforme') map[engin].conformes++;
    });

    const rows = Object.entries(map)
        .map(([engin, s]) => ({ engin, ...s, taux: Math.round(s.conformes / s.total * 100) }))
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
