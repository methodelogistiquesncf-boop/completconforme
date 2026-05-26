// ─────────────────────────────────────────────────────────────────────────────
// modules/admin.js — Verrou PIN, onglets admin, toggles mot de passe
// ─────────────────────────────────────────────────────────────────────────────
import { $, showToast }                         from "./utils.js";
import { initGithubConfig, initDropZoneEmplacements,
         initImportGithubXls, chargerListeEmplacementsAutorises }
                                                from "./github.js";

const ADMIN_PIN = "8184";

// ─── Init & câblage ───────────────────────────────────────────────────────────
export function initAdmin() {
    _initPin();
    _initAdminTabs();
    _initTogglesPwd();

}

// ─── Verrou PIN ───────────────────────────────────────────────────────────────
function _initPin() {
    const pinInputs = document.querySelectorAll('.pin-input');

    pinInputs.forEach((input, i) => {
        input.addEventListener('input', () => {
            input.value = input.value.replace(/\D/g, '').slice(0, 1);
            if (input.value && i < pinInputs.length - 1) pinInputs[i + 1].focus();
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Backspace' && !input.value && i > 0) pinInputs[i - 1].focus();
        });
    });

    $('btn-pin')?.addEventListener('click', () => {
        const saisi = [...pinInputs].map(i => i.value).join('');
        if (saisi === ADMIN_PIN) {
            $('admin-auth').classList.add('hidden');
            const content = $('admin-content');
            content.classList.remove('hidden');
            content.style.display = 'flex';
            $('pin-error').textContent = '';

            // Initialisation différée des outils admin au premier déverrouillage
            initGithubConfig();

        } else {
            $('pin-error').textContent = 'Code incorrect. Réessayez.';
            pinInputs.forEach(i => i.value = '');
            pinInputs[0].focus();
        }
    });
}

// ─── Navigation onglets admin ─────────────────────────────────────────────────
function _initAdminTabs() {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById('admin-tab-' + btn.dataset.tab)?.classList.remove('hidden');
        });
    });
}

// ─── Toggles affichage mot de passe (tous les boutons [data-target]) ─────────
function _initTogglesPwd() {
    document.querySelectorAll('.btn-toggle-pwd[data-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = $(btn.dataset.target);
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type       = isPassword ? 'text' : 'password';
            btn.textContent  = isPassword ? '🙈' : '👁';
        });
    });
}
