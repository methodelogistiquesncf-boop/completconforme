// ─────────────────────────────────────────────────────────────────────────────
// modules/historique.js — Recherche manuelle sur historique_controles
//
// Collection cible : /historique_controles (plate, un doc par contrôle)
// Champs : empId, engin, nom_du_kit, code_kit, statut, timestamp,
//          verificateur_email, kitId, detail_verification
//
// Stratégie quota :
//   • Rien chargé au démarrage
//   • Requête ciblée where() + orderBy(timestamp) + limit(50)
//   • Cache mémoire par clé "mode:valeur" dans la session
//
// Index Firestore composites à créer (console Firebase → Indexes → Composite) :
//   1. historique_controles | empId ASC      · timestamp DESC
//   2. historique_controles | engin ASC      · timestamp DESC
//   3. historique_controles | nom_du_kit ASC · timestamp DESC
//   4. historique_controles | code_kit ASC   · timestamp DESC
// ─────────────────────────────────────────────────────────────────────────────
import {
    collection, query, where, orderBy, limit, getDocs,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db }           from "./firebase.js";
import { $, showToast } from "./utils.js";

// ─── Constantes ───────────────────────────────────────────────────────────────
const COLLECTION = "historique_controles";
const LIMIT      = 50;

// ─── Callback externe (fourni par app.js) ─────────────────────────────────────
// Appelé quand l'agent clique sur une carte → ouvre le détail du kit en Terrain
let _onOpenKit = null;
export function setOnOpenKit(fn) { _onOpenKit = fn; }

// ─── Placeholders selon le mode ───────────────────────────────────────────────
const PLACEHOLDERS = {
    empId:      'Ex : ETKI.0070301',
    engin:      'Ex : B82551 4C TRANSILIEN1 (2e série)',
    nom_du_kit: 'Ex : KIT TRAIT MEC PORTE SIMPLE',
    code_kit:   'Ex : K21 OO990648',
};

// ─── Cache mémoire session (clé = "mode:valeur") ──────────────────────────────
const _cache = new Map();

// ─── Résultats courants (re-filtrer sans re-requêter) ─────────────────────────
let _currentDocs = [];

// ─── Init & câblage ───────────────────────────────────────────────────────────
export function initHistorique() {
    const input     = $('histo-search');
    const modeSel   = $('histo-mode');
    const filterSel = $('histo-filter');

    // Mettre à jour le placeholder quand le mode change
    modeSel?.addEventListener('change', () => {
        if (input) input.placeholder = PLACEHOLDERS[modeSel.value] || '';
        input?.focus();
    });

    // Lancer sur Entrée
    input?.addEventListener('keydown', e => {
        if (e.key === 'Enter') lancerRecherche();
    });

    // Bouton recherche
    $('histo-search-btn')?.addEventListener('click', lancerRecherche);

    // Filtrer les résultats déjà chargés sans re-requêter
    filterSel?.addEventListener('change', () => renderResultats());
}

// ─── Recherche principale ─────────────────────────────────────────────────────
async function lancerRecherche() {
    const raw  = ($('histo-search')?.value || '').trim();
    const mode = $('histo-mode')?.value || 'empId';

    if (!raw) {
        showToast('Entrez une valeur à rechercher.');
        return;
    }

    // Normaliser : emplacement et code kit en majuscules
    const val = (mode === 'empId' || mode === 'code_kit')
        ? raw.toUpperCase()
        : raw;

    const cacheKey = `${mode}:${val}`;

    afficherEtat('loading');

    // Cache hit
     _cache.delete(cacheKey);
    if (_cache.has(cacheKey)) {
        renderResultats(_cache.get(cacheKey));
        return;
    }

    // ── Requête Firestore ciblée ──────────────────────────────────────────────
    try {
        const col = collection(db, COLLECTION);
        let q;

        if (mode === 'nom_du_kit' || mode === 'engin') {
            // Recherche préfixe : >= val, <= val + '\uf8ff' (simule startsWith)
            // Permet de taper "B82551" et trouver "B82551 4C TRANSILIEN1..."
            const v   = val.toUpperCase();
            const end = v + '\uf8ff';
            q = query(col,
                where(mode, '>=', v),
                where(mode, '<=', end),
                orderBy(mode),
                orderBy('timestamp', 'desc'),
                limit(LIMIT)
            );
        } else {
            // empId et code_kit : correspondance exacte (toujours en majuscules)
            q = query(col,
                where(mode, '==', val),
                orderBy('timestamp', 'desc'),
                limit(LIMIT)
            );
        }

        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        _cache.set(cacheKey, docs);
        renderResultats(docs);

    } catch (err) {
        // Firestore renvoie un lien direct si l'index est manquant
        const msg       = err.message || '';
        const indexLink = msg.match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0];
        if (indexLink) {
            afficherEtat('error',
                `⚠️ Index manquant — créez-le ici :\n${indexLink}`
            );
        } else {
            afficherEtat('error', '⚠️ Erreur : ' + msg);
        }
    }
}

// ─── Rendu ────────────────────────────────────────────────────────────────────
function renderResultats(docs) {
    if (docs !== undefined) _currentDocs = docs;

    const filterVal = $('histo-filter')?.value || 'tous';
    const listEl    = $('histo-list');

    const filtered = _currentDocs.filter(k =>
        filterVal === 'tous' || k.statut === filterVal
    );

    listEl.innerHTML = '';

    if (!filtered.length) {
        afficherEtat('empty',
            _currentDocs.length
                ? 'Aucun résultat pour ce filtre.'
                : 'Aucun contrôle trouvé.'
        );
        return;
    }

    afficherEtat('results');

    const counter = $('histo-counter');
    if (counter) {
        const plus = _currentDocs.length >= LIMIT ? ` · ${LIMIT} max` : '';
        counter.textContent =
            `${filtered.length} contrôle${filtered.length > 1 ? 's' : ''}${plus}`;
    }

    filtered.forEach(k => {
        const ts   = k.timestamp ? new Date(k.timestamp) : null;
        const date = ts ? ts.toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        }) : '—';

        const statut    = k.statut || 'Non vérifié';
        const isOk      = statut === 'Conforme';
        const isKo      = statut === 'Incomplet';
        const manquants = (k.detail_verification || []).filter(c =>
            c.quantite_comptee !== null &&
            c.quantite_comptee !== undefined &&
            c.quantite_comptee !== c.quantite_requise
        );

        const row = document.createElement('div');
        row.className = `histo-item ${isOk ? 'histo-ok' : isKo ? 'histo-ko' : ''}`;
        row.innerHTML = `
            <div class="histo-main">
                <div class="histo-left">
                    <span class="histo-badge ${isOk ? 'badge-ok' : isKo ? 'badge-ko' : 'badge-neutral'}">
                        ${isOk ? '✅' : isKo ? '⚠️' : '—'} ${statut}
                    </span>
                    <div class="histo-ids">
                        <span class="histo-emp">${k.empId || '—'}</span>
                        <div class="histo-kit-row">
                            ${k.engin ? `<span class="histo-engin">${k.engin}</span>` : ''}
                            <span class="histo-kit">${k.code_kit || k.kitId || '—'}</span>
                        </div>
                        <span class="histo-kit-nom">${k.nom_du_kit || ''}</span>
                    </div>
                </div>
                <div class="histo-meta">
                    <span class="histo-date">🕒 ${date}</span>
                    <span class="histo-agent">👤 ${k.verificateur_email || '—'}</span>
                </div>
            </div>
            ${manquants.length ? `
            <div class="histo-detail">
                ${manquants.map(c => `
                    <span class="histo-ecart">
                        ${c.nom} : <strong>${c.quantite_comptee}</strong>/${c.quantite_requise}
                    </span>
                `).join('')}
            </div>` : ''}
        `;
        // Clic → ouvre le détail dans Terrain
        if (_onOpenKit && k.empId && (k.kitId || k.code_kit)) {
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => {
                _onOpenKit(k.empId, k.kitId || k.code_kit);
            });
        }

        listEl.appendChild(row);
    });
}

// ─── États UI ─────────────────────────────────────────────────────────────────
function afficherEtat(etat, message = '') {
    const loading = $('histo-loading');
    const empty   = $('histo-empty');
    const listEl  = $('histo-list');
    const counter = $('histo-counter');
    const invite  = $('histo-invite');

    loading?.classList.add('hidden');
    empty?.classList.add('hidden');
    invite?.classList.add('hidden');
    if (counter) counter.textContent = '';

    switch (etat) {
        case 'loading':
            listEl.innerHTML = '';
            loading?.classList.remove('hidden');
            break;
        case 'empty':
        case 'not-found':
        case 'error':
            listEl.innerHTML = '';
            if (empty) { empty.textContent = message; empty.classList.remove('hidden'); }
            break;
        case 'results':
            break;
    }
}

// ─── Appelé au changement d'onglet (depuis app.js) ────────────────────────────
export function chargerHistorique() {
    const listEl  = $('histo-list');
    const empty   = $('histo-empty');
    const counter = $('histo-counter');
    const invite  = $('histo-invite');

    if (listEl)  listEl.innerHTML = '';
    if (empty)   { empty.textContent = ''; empty.classList.add('hidden'); }
    if (counter) counter.textContent = '';

    const searchVal = ($('histo-search')?.value || '').trim();
    if (searchVal && _currentDocs.length) {
        renderResultats();
        invite?.classList.add('hidden');
    } else {
        invite?.classList.remove('hidden');
    }
}
