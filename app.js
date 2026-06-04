// ─────────────────────────────────────────────────────────────────────────────
// app.js — Orchestrateur : init, auth, routing entre onglets, offline, version
// ─────────────────────────────────────────────────────────────────────────────
import { initAuth, setAuthCallbacks }                      from "./modules/auth.js";
import { initHistorique, chargerHistorique, setOnOpenKit } from "./modules/historique.js";
import { initAdmin }                                       from "./modules/admin.js";
import { initImport }                                      from "./modules/import.js";
import { initProfil, afficherProfil }                      from "./modules/profil.js";
import { $ }                                               from "./modules/utils.js";
import { initStats, chargerStatistiques, arreterStats }    from "./modules/stats.js";
import { initTerrain, activerTerrain, desactiverTerrain,
         ouvrirDetailKit }                                 from "./modules/terrain.js";
import { initReprises, chargerReprises,
         setReprisesOnOpenKit }                            from "./modules/reprises.js";

// ─── Démarrage ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTerrain();
    initHistorique();
    initAdmin();
    initImport();
    initProfil();
    initStats();
    initReprises();
    _initTabNav();
    _initOfflineBanner();
    _detectAppVersion();

    // Clic sur "Ouvrir le kit" depuis Reprises → ouvre dans Terrain
    setReprisesOnOpenKit((empId, kitId) => {
        showTab('terrain');
        ouvrirDetailKit(empId, kitId);
    });

    // Clic sur une carte historique → ouvre le détail dans Terrain
    setOnOpenKit((empId, kitId) => {
        showTab('terrain');
        ouvrirDetailKit(empId, kitId);
    });

    // Quand l'utilisateur se connecte → aller sur l'onglet Terrain
    setAuthCallbacks({
        onLogin:  () => showTab('terrain'),
        onLogout: () => { /* login page gérée dans auth.js */ },
    });

    initAuth();
});

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION ONGLETS
// ═══════════════════════════════════════════════════════════════════════════════
const TABS = ['terrain', 'historique', 'import', 'admin', 'profil', 'stats', 'reprises'];

export function showTab(tab) {
    if (tab !== 'terrain') desactiverTerrain();
    if (tab !== 'stats')   arreterStats();

    TABS.forEach(t => {
        $(`tab-${t}`)?.classList.toggle('active',   t === tab);
        $(`sec-${t}`)?.classList.toggle('hidden',   t !== tab);
        $(`sidebar-${t}`)?.classList.toggle('active', t === tab);
    });

    switch (tab) {
        case 'terrain':    activerTerrain();      break;
        case 'historique': chargerHistorique();   break;
        case 'profil':     afficherProfil();      break;
        case 'stats':      chargerStatistiques(); break;
        case 'reprises':   chargerReprises();     break;
    }
}

function _initTabNav() {
    TABS.forEach(t => {
        $(`tab-${t}`)?.addEventListener('click', () => showTab(t));
    });

    const pairs = [
        ['sidebar-terrain',    'tab-terrain'],
        ['sidebar-historique', 'tab-historique'],
        ['sidebar-import',     'tab-import'],
        ['sidebar-admin',      'tab-admin'],
        ['sidebar-profil',     'tab-profil'],
        ['sidebar-stats',      'tab-stats'],
        ['sidebar-reprises',   'tab-reprises'],
    ];
    pairs.forEach(([sbId, tabId]) => {
        $(`${sbId}`)?.addEventListener('click', () => $(`${tabId}`)?.click());
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// OFFLINE
// ═══════════════════════════════════════════════════════════════════════════════
function _initOfflineBanner() {
    const banner = $('offline-banner');
    const update = () => banner?.classList.toggle('visible', !navigator.onLine);
    window.addEventListener('online',  update);
    window.addEventListener('offline', update);
    update();
}

// ═══════════════════════════════════════════════════════════════════════════════
// DÉTECTION DE VERSION (cache Service Worker)
// ═══════════════════════════════════════════════════════════════════════════════
async function _detectAppVersion() {
    try {
        const keys    = await caches.keys();
        const key     = keys.find(k => k.startsWith('completconforme-'));
        if (!key) return;
        const version = key.replace('completconforme-', '');
        document.querySelectorAll('.app-version').forEach(el => el.textContent = version);
    } catch {}
}
