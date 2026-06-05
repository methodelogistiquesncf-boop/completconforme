// ─────────────────────────────────────────────────────────────────────────────
// modules/admin.js — Verrou PIN, onglets admin, toggles mot de passe
// ─────────────────────────────────────────────────────────────────────────────
import { $, showToast }                from "./utils.js";
import { initGithubConfig }            from "./github.js";
import { initialiserDocumentStats }    from "./init_stats_kpi.js";
import { initAdminAcces }              from "./admin_acces.js";

const ADMIN_PIN = "8184";

// ─── Garde : initAdminAcces n'est appelé qu'une seule fois après unlock ───────
let _accesPanelInit = false;

// ─── Init & câblage ───────────────────────────────────────────────────────────
export function initAdmin() {
    _initPin();
    _initAdminTabs();
    _initTogglesPwd();

    $('btn-init-stats')?.addEventListener('click', async () => {
        const btn = $('btn-init-stats');
        btn.disabled = true;
        await initialiserDocumentStats();
        btn.disabled = false;
    });
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

    // Valider aussi sur Entrée depuis n'importe quel champ PIN
    pinInputs.forEach(input => {
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') $('btn-pin')?.click();
        });
    });

    $('btn-pin')?.addEventListener('click', () => {
        const saisi = [...pinInputs].map(i => i.value).join('');

        if (saisi === ADMIN_PIN) {
            $('admin-auth').classList.add('hidden');

            const content = $('admin-content');
            content.classList.remove('hidden');
            content.style.display = 'flex';

            if ($('pin-error')) $('pin-error').textContent = '';

            // Initialisation des outils admin (une seule fois)
            initGithubConfig();

            if (!_accesPanelInit) {
                initAdminAcces();
                _accesPanelInit = true;
            }

        } else {
            if ($('pin-error')) $('pin-error').textContent = 'Code incorrect. Réessayez.';
            pinInputs.forEach(i => i.value = '');
            pinInputs[0].focus();
        }
    });
}

// ─── Navigation onglets admin ─────────────────────────────────────────────────
function _initAdminTabs() {
    const btns   = document.querySelectorAll('.admin-tab-btn');
    const panels = document.querySelectorAll('.admin-tab-panel');

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b   => b.classList.remove('active'));
            panels.forEach(p => p.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById('admin-tab-' + btn.dataset.tab)?.classList.remove('hidden');
        });
    });
}

// ─── Toggles affichage mot de passe (tous les boutons [data-target]) ──────────
function _initTogglesPwd() {
    document.querySelectorAll('.btn-toggle-pwd[data-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = $(btn.dataset.target);
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type      = isPassword ? 'text' : 'password';
            btn.textContent = isPassword ? '🙈' : '👁';
        });
    });
}
