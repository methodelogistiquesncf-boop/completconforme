import { $ } from "./utils.js";
import { chargerAcces, sauvegarderAcces, MODULES } from "./acces.js";
import { showToast } from "./utils.js";
import { _appliquerVisibiliteOnglets } from "../app.js";

const LABELS = {
    terrain:    'Terrain',
    reprises:   'Reprises',
    historique: 'Historique',
    stats:      'Statistiques',
    admin:      'Admin',
};

let _config = {};
let _changed = false;

export async function initAdminAcces() {
    $('btn-save-acces')?.addEventListener('click', _sauvegarder);
    $('btn-add-user-acces')?.addEventListener('click', _ajouterUtilisateur);
    $('acces-search')?.addEventListener('input', () => _renderTable());
    await _charger();
}

async function _charger() {
    $('acces-loading')?.classList.remove('hidden');
    try {
        _config = await chargerAcces();
        _renderTable();
    } finally {
        $('acces-loading')?.classList.add('hidden');
    }
}

function _renderTable() {
    const tbody    = $('acces-tbody');
    const recherche = ($('acces-search')?.value || '').toLowerCase();
    if (!tbody) return;

    tbody.innerHTML = '';
    let count = 0;

    Object.entries(_config).forEach(([email, droits]) => {
        if (recherche && !email.toLowerCase().includes(recherche)) return;
        count++;
        tbody.appendChild(_buildRow(email, droits));
    });

    const total = Object.keys(_config).length;
    if ($('acces-count'))
        $('acces-count').textContent =
            count === total ? `${total} utilisateur(s)` : `${count} / ${total}`;
}

function _buildRow(email, droits) {
    const tr = document.createElement('tr');
        tr.style.borderTop = '1px solid var(--border)';
    // Colonne email
    const tdEmail = document.createElement('td');
    tdEmail.textContent = email;
    tr.appendChild(tdEmail);

    // Colonnes toggles
    MODULES.forEach(mod => {
        const td = document.createElement('td');
        td.style.textAlign = 'center';

        const label = document.createElement('label');
        label.className = 'acces-toggle';

        const input = document.createElement('input');
        input.type    = 'checkbox';
        input.checked = !!droits[mod];
        input.addEventListener('change', () => {
            _config[email][mod] = input.checked;
            _marquerChangement();
        });

        label.appendChild(input);
        label.insertAdjacentHTML('beforeend', '<span class="acces-slider"></span>');
        td.appendChild(label);
        tr.appendChild(td);
    });

    // Bouton supprimer
    const tdDel = document.createElement('td');
    tdDel.style.textAlign = 'center';
    const btn = document.createElement('button');
    btn.className   = 'acces-btn-del';
    btn.textContent = '✕';
    btn.title       = 'Supprimer';
    btn.addEventListener('click', () => {
        delete _config[email];
        _renderTable();
        _marquerChangement();
    });
    tdDel.appendChild(btn);
    tr.appendChild(tdDel);

    return tr;
}

function _ajouterUtilisateur() {
    const input = $('acces-new-email');
    const email = input?.value.trim().toLowerCase();
    if (!email || !email.includes('@')) {
        showToast('Entrez un email valide.', 'error');
        return;
    }
    if (_config[email]) {
        showToast('Cet utilisateur existe déjà.', 'info');
        return;
    }
    // Accès par défaut : terrain uniquement
    _config[email] = { terrain: true, reprises: false,
                       historique: false, stats: false, admin: false };
    if (input) input.value = '';
    _renderTable();
    _marquerChangement();
}

function _marquerChangement() {
    _changed = true;
    $('btn-save-acces')?.removeAttribute('disabled');
}

async function _sauvegarder() {
    const btn = $('btn-save-acces');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    try {
        await sauvegarderAcces(_config);
        _appliquerVisibiliteOnglets(); // ← ajoutez cette ligne
        showToast('✅ Droits enregistrés.', 'success');
        _changed = false;
    } catch (err) {
        showToast('❌ ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer'; }
    }
}
