// ─────────────────────────────────────────────────────────────────────────────
// modules/import.js — Onglets et outils d'import (sans verrou PIN)
//   · Emplacements autorisés (.txt)
//   · Import kits Excel (.xlsx / .xls / .csv)
// ─────────────────────────────────────────────────────────────────────────────
import { $ }                                                     from "./utils.js";
import { initDropZoneEmplacements, initImportGithubXls,
         chargerListeEmplacementsAutorises }                     from "./github.js";

// ─── Init & câblage ───────────────────────────────────────────────────────────
export function initImport() {
    _afficherContenu();
    _initImportTabs();
    _initOutils();

    // Bouton rafraîchir la liste des emplacements
    $("btn-refresh-emp")?.addEventListener("click", chargerListeEmplacementsAutorises);
}

// ─── Affichage direct du contenu (pas de PIN) ─────────────────────────────────
function _afficherContenu() {
    const content = $('import-content');
    if (!content) return;
    content.classList.remove('hidden');
    content.style.display = 'flex';
}

// ─── Initialisation des outils d'import ──────────────────────────────────────
function _initOutils() {
    initDropZoneEmplacements();
    initImportGithubXls();
    chargerListeEmplacementsAutorises();
}

// ─── Navigation onglets Import ────────────────────────────────────────────────
function _initImportTabs() {
    const container = document.getElementById('sec-import');
    if (!container) return;

    const btns   = container.querySelectorAll('.admin-tab-btn');
    const panels = container.querySelectorAll('.admin-tab-panel');

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b   => b.classList.remove('active'));
            panels.forEach(p => p.classList.add('hidden'));

            btn.classList.add('active');
            container.querySelector(`#import-tab-${btn.dataset.tab}`)
                      ?.classList.remove('hidden');
        });
    });
}
