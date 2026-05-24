// ─────────────────────────────────────────────────────────────────────────────
// modules/historique.js — Recherche intelligente sur historique_controles
//
// Collection cible : /historique_controles (plate, un doc par contrôle)
// Champs : empId, engin, nom_du_kit, code_kit, statut, timestamp,
//          verificateur_email, kitId, detail_verification
//
// Stratégie quota :
//   • Rien chargé au démarrage
//   • Requête ciblée where() + orderBy(timestamp) + limit(50)
//   • Cache mémoire par clé de recherche dans la session
//
// Index Firestore composites à créer (console Firebase → Indexes) :
//   1. Collection: historique_controles | empId ASC, timestamp DESC
//   2. Collection: historique_controles | engin ASC, timestamp DESC
//   3. Collection: historique_controles | nom_du_kit ASC, timestamp DESC
// ─────────────────────────────────────────────────────────────────────────────
import {
    collection, query, where, orderBy, limit, getDocs,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db }           from "./firebase.js";
import { $, showToast } from "./utils.js";

// ─── Constantes ───────────────────────────────────────────────────────────────
const COLLECTION   = "historique_controles";
const LIMIT        = 50;

// ─── Cache mémoire session (clé = "mode:valeur") ──────────────────────────────
const _cache = new Map();

// ─── Résultats courants (pour re-filtrer sans re-requêter) ────────────────────
let _currentDocs = [];

// ─── Détection automatique du mode de recherche ───────────────────────────────
// • Emplacement : contient un point  → ex: ETKI.001.01, MAG2.003
// • Engin       : commence par une série de chiffres ou contient "série"
//                 ou ressemble à un code matériel (>= 4 chars, maj+chiffres)
// • Nom de kit  : tout le reste (texte libre)
function detecterMode(val) {
    if (!val) return null;
    const v = val.trim();

    // Emplacement : contient un point entouré de caractères
    if (/[A-Z0-9]+\.[A-Z0-9]/.test(v.toUpperCase())) return 'empId';

    // Engin : commence par B ou un code série connu, ou contient un espace
    // (les engins ont souvent la forme "B82551 4C TRANSILIEN1...")
    // On considère qu'un engin contient au moins un espace ET commence par
    // une lettre majuscule + chiffres
    if (/^[A-Z][0-9]/.test(v.toUpperCase()) && v.includes(' ')) return 'engin';

    // Code kit : que des majuscules/chiffres/tirets sans point ni espace
    if (/^[A-Z0-9_-]+$/i.test(v) && v.length >= 4) return 'code_kit';

    // Sinon : nom de kit (texte libre)
    return 'nom_du_kit';
}

// ─── Init & câblage ───────────────────────────────────────────────────────────
export function initHistorique() {
    const input      = $('histo-search');
    const filterSel  = $('histo-filter');

    // Lancer sur Entrée
    input?.addEventListener('keydown', e => {
        if (e.key === 'Enter') lancerRecherche();
    });

    // Bouton recherche
    $('histo-search-btn')?.addEventListener('click', lancerRecherche);

    // Filtrer les résultats déjà chargés
    filterSel?.addEventListener('change', () => renderResultats());

    // Hint de mode en temps réel sous le champ
    input?.addEventListener('input', () => {
        const val  = input.value.trim();
        const mode = detecterMode(val);
        const hint = $('histo-mode-hint');
        if (!hint) return;
        if (!val) { hint.textContent = ''; return; }
        const labels = {
            empId:      '📍 Recherche par emplacement',
            engin:      '🚂 Recherche par engin',
            nom_du_kit: '🧰 Recherche par nom de kit',
            code_kit:   '🔑 Recherche par code kit',
        };
        hint.textContent = labels[mode] || '';
    });
}

// ─── Recherche principale ─────────────────────────────────────────────────────
async function lancerRecherche() {
    const raw = ($('histo-search')?.value || '').trim();
    if (!raw) { showToast('Entrez un emplacement, un engin ou un nom de kit.'); return; }

    const mode = detecterMode(raw);
    if (!mode) { showToast('Recherche non reconnue.'); return; }

    // Normaliser la valeur selon le mode
    const val = (mode === 'empId' || mode === 'code_kit')
        ? raw.toUpperCase()
        : raw;   // engin et nom_du_kit : respecter la casse Firestore

    const cacheKey = `${mode}:${val}`;

    afficherEtat('loading');

    // Cache hit
    if (_cache.has(cacheKey)) {
        renderResultats(_cache.get(cacheKey));
        return;
    }

    // ── Requête Firestore ciblée ──────────────────────────────────────────────
    try {
        const col = collection(db, COLLECTION);
        let q;

        if (mode === 'nom_du_kit') {
            // Recherche préfixe sur nom_du_kit (Firestore ne supporte pas LIKE)
            // On utilise range >= val, < val + '\uf8ff' pour simuler "startsWith"
            const end = val + '\uf8ff';
            q = query(col,
                where('nom_du_kit', '>=', val.toUpperCase()),
                where('nom_du_kit', '<=', val.toUpperCase() + '\uf8ff'),
                orderBy('nom_du_kit'),
                orderBy('timestamp', 'desc'),
                limit(LIMIT)
            );
        } else {
            const field = mode; // empId | engin | code_kit
            q = query(col,
                where(field, '==', val),
                orderBy('timestamp', 'desc'),
                limit(LIMIT)
            );
        }

        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        _cache.set(cacheKey, docs);
        renderResultats(docs);

    } catch (err) {
        // Si l'index n'existe pas encore, Firestore retourne un lien direct
        const msg = err.message || '';
        const indexLink = msg.match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0];
        if (indexLink) {
            afficherEtat('error',
                `⚠️ Index manquant — cliquez ici pour le créer automatiquement dans Firebase : ${indexLink}`
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
        const total = _currentDocs.length;
        const plus  = total >= LIMIT ? ` (${LIMIT} max affichés)` : '';
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

    // Ré-afficher les résultats si on revient sur l'onglet
    const searchVal = ($('histo-search')?.value || '').trim();
    if (searchVal && _currentDocs.length) {
        renderResultats();
        invite?.classList.add('hidden');
    } else {
        invite?.classList.remove('hidden');
    }
}
