// ═══════════════════════════════════════════════════════════════════════════════
// STATISTIQUES — stats.js
// À importer dans app.js : import { initStats, chargerStats } from './stats.js';
// ═══════════════════════════════════════════════════════════════════════════════

import { getDocs, collection } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ─── Chart.js via CDN (chargé une seule fois) ─────────────────────────────────
let chartJsReady = false;
async function loadChartJs() {
    if (window.Chart) { chartJsReady = true; return; }
    return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
        s.onload  = () => { chartJsReady = true; res(); };
        s.onerror = () => rej(new Error('Chart.js non chargé'));
        document.head.appendChild(s);
    });
}

// ─── Instances de charts (pour destroy avant recréation) ─────────────────────
let chartDonut    = null;
let chartTimeline = null;
let chartAgents   = null;

// ─── Période active (jours, 0 = tout) ────────────────────────────────────────
let periodeActive = 90;

// ─── Références DOM ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ═══════════════════════════════════════════════════════════════════════════════
// INIT — appeler une fois au démarrage
// ═══════════════════════════════════════════════════════════════════════════════
export function initStats() {
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            periodeActive = parseInt(btn.dataset.period, 10);
            chargerStats(window.__db);
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHARGEMENT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export async function chargerStats(db) {
    window.__db = db;

    const loading = $('stats-loading');
    loading?.classList.remove('hidden');

    try {
        await loadChartJs();

        // ── Lire tous les emplacements + kits ─────────────────────────────────
        const empSnap = await getDocs(collection(db, "emplacements"));
        const allKits = [];   // données statiques (statut actuel)
        const allVerifs = []; // données historiques (chaque contrôle)

        for (const empDoc of empSnap.docs) {
            const empId = empDoc.id;
            const kitsSnap = await getDocs(collection(db, "emplacements", empId, "kits"));
            kitsSnap.forEach(kitDoc => {
                const d = kitDoc.data();
                allKits.push({ empId, kitId: kitDoc.id, ...d });
                if (d.derniere_verification) {
                    allVerifs.push({
                        empId,
                        kitId:    kitDoc.id,
                        nom:      d.nom_du_kit || kitDoc.id,
                        statut:   d.statut_conformite || 'Non vérifié',
                        agent:    d.verificateur_email || '—',
                        date:     new Date(d.derniere_verification),
                    });
                }
            });
        }

        // ── Filtrer par période ───────────────────────────────────────────────
        const cutoff = periodeActive > 0
            ? new Date(Date.now() - periodeActive * 86400000)
            : null;

        const verifs = cutoff
            ? allVerifs.filter(v => v.date >= cutoff)
            : allVerifs;

        // ── KPIs (sur l'ensemble des kits, pas filtrés par période) ──────────
        const total       = allKits.length;
        const conformes   = allKits.filter(k => k.statut_conformite === 'Conforme').length;
        const incomplets  = allKits.filter(k => k.statut_conformite === 'Incomplet').length;
        const nonVerifies = allKits.filter(k => !k.statut_conformite || k.statut_conformite === 'Non vérifié').length;
        const taux        = total > 0 ? Math.round((conformes / total) * 100) : 0;

        $('kpi-total').textContent      = total;
        $('kpi-conformes').textContent  = conformes;
        $('kpi-incomplets').textContent = incomplets;
        $('kpi-nonverifies').textContent = nonVerifies;
        $('kpi-taux').textContent       = taux + '%';

        // ── Donut ─────────────────────────────────────────────────────────────
        renderDonut(conformes, incomplets, nonVerifies);

        // ── Timeline ─────────────────────────────────────────────────────────
        renderTimeline(verifs);

        // ── Top incomplets (sur la période) ──────────────────────────────────
        renderTopIncomplets(verifs);

        // ── Agents ───────────────────────────────────────────────────────────
        renderAgents(verifs);

    } catch (err) {
        console.error('[Stats]', err);
    } finally {
        loading?.classList.add('hidden');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DONUT — répartition statuts
// ═══════════════════════════════════════════════════════════════════════════════
function renderDonut(conformes, incomplets, nonVerifies) {
    const canvas = $('chart-donut');
    if (!canvas) return;

    if (chartDonut) { chartDonut.destroy(); chartDonut = null; }

    const data   = [conformes, incomplets, nonVerifies];
    const labels = ['Conformes', 'Incomplets', 'Non vérifiés'];
    const colors = ['#3FA876', '#C97C2E', '#4A7FD4'];

    chartDonut = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }]
        },
        options: {
            cutout: '72%',
            plugins: { legend: { display: false }, tooltip: { callbacks: {
                label: ctx => ` ${ctx.label} : ${ctx.raw}`
            }}},
            animation: { duration: 500 },
        }
    });

    // Légende manuelle
    const legend = $('donut-legend');
    if (legend) {
        legend.innerHTML = labels.map((l, i) => `
            <div class="donut-legend-item">
                <span class="donut-dot" style="background:${colors[i]}"></span>
                <span>${l}</span>
                <span style="margin-left:auto;font-family:var(--mono);font-weight:800;">${data[i]}</span>
            </div>
        `).join('');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINE — contrôles par jour/semaine
// ═══════════════════════════════════════════════════════════════════════════════
function renderTimeline(verifs) {
    const canvas = $('chart-timeline');
    if (!canvas) return;
    if (chartTimeline) { chartTimeline.destroy(); chartTimeline = null; }

    if (!verifs.length) { canvas.parentElement.innerHTML = '<p style="text-align:center;color:var(--muted);padding:2rem;font-size:.85rem;">Aucune donnée sur cette période.</p>'; return; }

    // Grouper par date (YYYY-MM-DD)
    const byDate = {};
    verifs.forEach(v => {
        const key = v.date.toISOString().slice(0, 10);
        if (!byDate[key]) byDate[key] = { conformes: 0, incomplets: 0 };
        if (v.statut === 'Conforme')  byDate[key].conformes++;
        if (v.statut === 'Incomplet') byDate[key].incomplets++;
    });

    const dates = Object.keys(byDate).sort();
    const labelsFmt = dates.map(d => {
        const [y, m, j] = d.split('-');
        return `${j}/${m}`;
    });

    chartTimeline = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labelsFmt,
            datasets: [
                {
                    label: 'Conformes',
                    data: dates.map(d => byDate[d].conformes),
                    backgroundColor: 'rgba(63,168,118,.75)',
                    borderRadius: 4,
                    stack: 'stack',
                },
                {
                    label: 'Incomplets',
                    data: dates.map(d => byDate[d].incomplets),
                    backgroundColor: 'rgba(201,124,46,.75)',
                    borderRadius: 4,
                    stack: 'stack',
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.2,
            plugins: {
                legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12, padding: 12 } },
                tooltip: { mode: 'index' },
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 12 } },
                y: { grid: { color: 'rgba(0,0,0,.05)' }, ticks: { stepSize: 1, font: { size: 10 } }, beginAtZero: true },
            },
            animation: { duration: 400 },
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP INCOMPLETS
// ═══════════════════════════════════════════════════════════════════════════════
function renderTopIncomplets(verifs) {
    const container = $('stats-top-incomplets');
    if (!container) return;

    const incomplets = verifs.filter(v => v.statut === 'Incomplet');
    const counts = {};
    incomplets.forEach(v => {
        const key = v.kitId;
        if (!counts[key]) counts[key] = { nom: v.nom, count: 0 };
        counts[key].count++;
    });

    const sorted = Object.entries(counts)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 8);

    if (!sorted.length) {
        container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:1.5rem;font-size:.85rem;">Aucun kit incomplet sur cette période. 🎉</p>';
        return;
    }

    const max = sorted[0][1].count;
    container.innerHTML = sorted.map(([, v], i) => `
        <div class="rank-item">
            <span class="rank-pos">${i + 1}</span>
            <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.3rem;">
                    <span class="rank-label">${v.nom}</span>
                    <span class="rank-count">${v.count}×</span>
                </div>
                <div class="rank-bar-wrap">
                    <div class="rank-bar" style="width:${Math.round((v.count / max) * 100)}%"></div>
                </div>
            </div>
        </div>
    `).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITÉ PAR AGENT
// ═══════════════════════════════════════════════════════════════════════════════
function renderAgents(verifs) {
    const canvas = $('chart-agents');
    if (!canvas) return;
    if (chartAgents) { chartAgents.destroy(); chartAgents = null; }

    if (!verifs.length) { canvas.parentElement.innerHTML = '<p style="text-align:center;color:var(--muted);padding:2rem;font-size:.85rem;">Aucune donnée sur cette période.</p>'; return; }

    // Compter par agent
    const byAgent = {};
    verifs.forEach(v => {
        const agent = v.agent;
        if (!byAgent[agent]) byAgent[agent] = { conformes: 0, incomplets: 0 };
        if (v.statut === 'Conforme')  byAgent[agent].conformes++;
        if (v.statut === 'Incomplet') byAgent[agent].incomplets++;
    });

    // Tronquer les emails pour l'affichage
    const agents = Object.keys(byAgent).sort();
    const labels = agents.map(a => {
        const local = a.split('@')[0];
        return local.length > 14 ? local.slice(0, 14) + '…' : local;
    });

    chartAgents = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Conformes',
                    data: agents.map(a => byAgent[a].conformes),
                    backgroundColor: 'rgba(63,168,118,.8)',
                    borderRadius: 4,
                    stack: 'stack',
                },
                {
                    label: 'Incomplets',
                    data: agents.map(a => byAgent[a].incomplets),
                    backgroundColor: 'rgba(201,124,46,.8)',
                    borderRadius: 4,
                    stack: 'stack',
                },
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
                tooltip: { mode: 'index' },
            },
            scales: {
                x: { grid: { color: 'rgba(0,0,0,.05)' }, ticks: { stepSize: 1, font: { size: 10 } }, beginAtZero: true },
                y: { grid: { display: false }, ticks: { font: { size: 11 } } },
            },
            animation: { duration: 400 },
        }
    });
}
