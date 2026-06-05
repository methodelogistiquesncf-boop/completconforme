import { $ }                                        from "./utils.js";
import { chargerAcces, sauvegarderAcces, MODULES }   from "./acces.js";
import { showToast }                                  from "./utils.js";
import { _appliquerVisibiliteOnglets }                from "../app.js";

let _config  = {};
let _changed = false;

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initAdminAcces() {
    $('btn-save-acces')?.addEventListener('click', _sauvegarder);
    $('btn-add-user-acces')?.addEventListener('click', _ajouterUtilisateur);
    $('acces-search')?.addEventListener('input', () => _renderTable());
    await _charger();
}

// ─── Chargement ───────────────────────────────────────────────────────────────
async function _charger() {
    $('acces-loading')?.classList.remove('hidden');
    try {
        _config = await chargerAcces();
        _renderTable();
    } finally {
        $('acces-loading')?.classList.add('hidden');
    }
}

// ─── Rendu du tableau ─────────────────────────────────────────────────────────
function _renderTable() {
    const tbody     = $('acces-tbody');
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

// ─── Construction d'une ligne ──────────────────────────────────────────────────
function _buildRow(email, droits) {
    const tr = document.createElement('tr');
    tr.style.borderTop = '1px solid var(--border)';

    // ── Colonne email ──
    const tdEmail = document.createElement('td');
    tdEmail.style.padding    = '8px 14px';
    tdEmail.style.fontSize   = '.82rem';
    tdEmail.style.color      = 'var(--muted)';
    tdEmail.style.fontFamily = 'var(--mono)';
    tdEmail.textContent      = email;
    tr.appendChild(tdEmail);

    // ── Colonne prénom ──
    const tdPrenom    = document.createElement('td');
    tdPrenom.style.padding = '6px 8px';
    const inputPrenom = document.createElement('input');
    inputPrenom.type        = 'text';
    inputPrenom.value       = droits.prenom || '';
    inputPrenom.placeholder = 'Prénom';
    inputPrenom.className   = 'acces-name-input';
    inputPrenom.addEventListener('input', () => {
        _config[email].prenom = inputPrenom.value.trim();
        _marquerChangement();
    });
    tdPrenom.appendChild(inputPrenom);
    tr.appendChild(tdPrenom);

    // ── Colonne nom ──
    const tdNom    = document.createElement('td');
    tdNom.style.padding = '6px 8px';
    const inputNom = document.createElement('input');
    inputNom.type        = 'text';
    inputNom.value       = droits.nom || '';
    inputNom.placeholder = 'Nom';
    inputNom.className   = 'acces-name-input';
    inputNom.addEventListener('input', () => {
        _config[email].nom = inputNom.value.trim();
        _marquerChangement();
    });
    tdNom.appendChild(inputNom);
    tr.appendChild(tdNom);

    // ── Colonnes toggles (modules) ──
    MODULES.forEach(mod => {
        const td = document.createElement('td');
        td.style.textAlign = 'center';
        td.style.padding   = '6px 8px';

        const label   = document.createElement('label');
        label.className = 'acces-toggle';

        const input   = document.createElement('input');
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

    // ── Bouton supprimer ──
    const tdDel = document.createElement('td');
    tdDel.style.textAlign = 'center';
    tdDel.style.padding   = '6px 8px';

    const btn         = document.createElement('button');
    btn.className     = 'acces-btn-del';
    btn.textContent   = '✕';
    btn.title         = 'Supprimer';
    btn.addEventListener('click', () => {
        delete _config[email];
        _renderTable();
        _marquerChangement();
    });
    tdDel.appendChild(btn);
    tr.appendChild(tdDel);

    return tr;
}

// ─── Ajout d'un utilisateur ───────────────────────────────────────────────────
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

    _config[email] = {
        prenom:     '',
        nom:        '',
        terrain:    true,
        reprises:   false,
        historique: false,
        stats:      false,
        admin:      false,
        import:     false,
    };

    if (input) input.value = '';
    _renderTable();
    _marquerChangement();
}

// ─── Marquage des changements ─────────────────────────────────────────────────
function _marquerChangement() {
    _changed = true;
    const btn = $('btn-save-acces');
    if (btn) {
        btn.removeAttribute('disabled');
        btn.style.opacity = '1';
    }
}

// ─── Sauvegarde ───────────────────────────────────────────────────────────────
async function _sauvegarder() {
    const btn = $('btn-save-acces');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    try {
        await sauvegarderAcces(_config);
        _appliquerVisibiliteOnglets();
        showToast('✅ Droits enregistrés.', 'success');
        _changed = false;
    } catch (err) {
        showToast('❌ ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled     = false;
            btn.textContent  = '💾 Enregistrer';
            btn.style.opacity = '1';
        }
    }
}
