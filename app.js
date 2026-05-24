// ─────────────────────────────────────────────────────────────────────────────
// app.js — Orchestrateur : init, auth, routing entre onglets, offline, version
// ─────────────────────────────────────────────────────────────────────────────
import { initAuth, setAuthCallbacks }                      from "./modules/auth.js";
import { initTerrain, activerTerrain, ouvrirDetailKit }    from "./modules/terrain.js";
import { initHistorique, chargerHistorique, setOnOpenKit } from "./modules/historique.js";
import { initAdmin }                                       from "./modules/admin.js";
import { initProfil, afficherProfil }                      from "./modules/profil.js";
import { chargerStatistiques }                             from "./modules/stats.js";
import { $ }                                               from "./modules/utils.js";

// ─── Démarrage ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTerrain();
    initHistorique();
    initAdmin();
    initProfil();
    _initTabNav();
    _initOfflineBanner();
    _detectAppVersion();

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
const TABS = ['terrain', 'historique', 'admin', 'profil', 'stats'];

export function showTab(tab) {
    TABS.forEach(t => {
        $(`tab-${t}`)?.classList.toggle('active',  t === tab);
        $(`sec-${t}`)?.classList.toggle('hidden', t !== tab);
        $(`sidebar-${t}`)?.classList.toggle('active', t === tab);
    });

    switch (tab) {
        case 'terrain':     activerTerrain();       break;
        case 'historique':  chargerHistorique();    break;
        case 'profil':      afficherProfil();       break;
        case 'stats':       chargerStatistiques();  break;
    }
}

function _initTabNav() {
    TABS.forEach(t => {
        $(`tab-${t}`)?.addEventListener('click', () => showTab(t));
    });

    const pairs = [
        ['sidebar-terrain',    'tab-terrain'],
        ['sidebar-historique', 'tab-historique'],
        ['sidebar-admin',      'tab-admin'],
        ['sidebar-profil',     'tab-profil'],
        ['sidebar-stats',      'tab-stats'],
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
