// ─────────────────────────────────────────────────────────────────────────────
// modules/import.js — Verrou PIN, onglets et outils d'import
//   · Emplacements autorisés (.txt)
//   · Import kits Excel (.xlsx / .xls / .csv)
// ─────────────────────────────────────────────────────────────────────────────
import { $, showToast }                                          from "./utils.js";
import { initDropZoneEmplacements, initImportGithubXls,
         chargerListeEmplacementsAutorises }                     from "./github.js";

const IMPORT_PIN = "1234";

// ─── Drapeaux pour n'initialiser les outils qu'une seule fois ─────────────────
let _toolsReady = false;

// ─── Init & câblage ───────────────────────────────────────────────────────────
export function initImport() {
    _initPin();
    _initImportTabs();

    // Bouton rafraîchir la liste des emplacements
    $("btn-refresh-emp")?.addEventListener("click", chargerListeEmplacementsAutorises);
}

// ─── Verrou PIN ───────────────────────────────────────────────────────────────
function _initPin() {
    // On cible uniquement les inputs du bloc import pour ne pas interférer
    // avec le PIN de la section Admin
    const pinRow    = $('import-pin-row');
    if (!pinRow) return;

    const pinInputs = pinRow.querySelectorAll('.pin-input');

    pinInputs.forEach((input, i) => {
        input.addEventListener('input', () => {
            input.value = input.value.replace(/\D/g, '').slice(0, 1);
            if (input.value && i < pinInputs.length - 1) pinInputs[i + 1].focus();
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Backspace' && !input.value && i > 0) pinInputs[i - 1].focus();
        });
        // Valider sur Entrée depuis le dernier champ
        if (i === pinInputs.length - 1) {
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') $('btn-import-pin')?.click();
            });
        }
    });

    $('btn-import-pin')?.addEventListener('click', () => {
        const saisi = [...pinInputs].map(i => i.value).join('');

        if (saisi === IMPORT_PIN) {
            $('import-auth').classList.add('hidden');

            const content = $('import-content');
            content.classList.remove('hidden');
            content.style.display = 'flex';

            $('import-pin-error').textContent = '';

            // Initialisation différée des outils au premier déverrouillage
            if (!_toolsReady) {
                _toolsReady = true;
                initDropZoneEmplacements();
                initImportGithubXls();
                chargerListeEmplacementsAutorises();
            }
        } else {
            $('import-pin-error').textContent = 'Code incorrect. Réessayez.';
            pinInputs.forEach(i => i.value = '');
            pinInputs[0].focus();
        }
    });
}

// ─── Navigation onglets Import ────────────────────────────────────────────────
function _initImportTabs() {
    // On cible uniquement les boutons / panneaux à l'intérieur de #sec-import
    // pour ne pas interférer avec les onglets de la section Admin
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
