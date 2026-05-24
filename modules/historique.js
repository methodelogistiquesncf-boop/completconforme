// ─────────────────────────────────────────────────────────────────────────────
// modules/historique.js — Historique : recherche à la demande (sans quota)
//
// Stratégie zéro-quota :
//   • Aucune lecture Firestore au chargement de la page.
//   • On requête uniquement quand l'agent valide une recherche.
//   • Les résultats sont mis en cache mémoire (sessionStorage) pour éviter
//     de re-requêter la même clé dans la même session.
// ─────────────────────────────────────────────────────────────────────────────
import {
    doc, getDoc, collection, getDocs,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db }           from "./firebase.js";
import { $, showToast } from "./utils.js";

// ─── Cache mémoire (clé = empId, valeur = tableau de kits) ───────────────────
const _cache = new Map();

// ─── Init & câblage ───────────────────────────────────────────────────────────
export function initHistorique() {
    const searchInput  = $('histo-search');
    const searchBtn    = $('histo-search-btn');
    const filterSelect = $('histo-filter');

    // Lancer la recherche sur Entrée
    searchInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter') lancerRecherche();
    });

    // Lancer la recherche sur clic du bouton
    searchBtn?.addEventListener('click', lancerRecherche);

    // Filtrer sans re-requêter (sur les résultats déjà en mémoire)
    filterSelect?.addEventListener('change', () => renderResultats());
}

// ─── Recherche à la demande ───────────────────────────────────────────────────
async function lancerRecherche() {
    const raw = ($('histo-search')?.value || '').trim();
    if (!raw) {
        showToast('Entrez un emplacement ou un identifiant de kit.');
        return;
    }

    // Normaliser : on accepte "ETKI.001.01 / KIT-002" ou "ETKI.001.01"
    // → on extrait la partie emplacement (tout avant un éventuel "/" ou espace)
    const empId = raw.split(/[\s/]+/)[0].toUpperCase();

    afficherEtat('loading');

    // ── Cache hit ? ──────────────────────────────────────────────────────────
    if (_cache.has(empId)) {
        renderResultats(_cache.get(empId));
        return;
    }

    // ── Firestore : 1 lecture sur l'emplacement + ses kits ───────────────────
    try {
        // Vérifier que l'emplacement existe
        const empRef  = doc(db, "emplacements", empId);
        const empSnap = await getDoc(empRef);

        if (!empSnap.exists()) {
            afficherEtat('not-found', `Aucun emplacement trouvé pour « ${empId} ».`);
            return;
        }

        // Charger tous les kits de cet emplacement (sous-collection)
        const kitsSnap = await getDocs(collection(db, "emplacements", empId, "kits"));
        const kits = [];

        kitsSnap.forEach(kitDoc => {
            const data = kitDoc.data();
            if (data.derniere_verification) {
                kits.push({ empId, kitId: kitDoc.id, ...data });
            }
        });

        // Trier du plus récent au plus ancien
        kits.sort((a, b) =>
            new Date(b.derniere_verification) - new Date(a.derniere_verification)
        );

        // Mettre en cache pour cette session
        _cache.set(empId, kits);

        renderResultats(kits);

    } catch (err) {
        afficherEtat('error', '⚠️ Erreur Firestore : ' + err.message);
    }
}

// ─── Rendu des résultats ──────────────────────────────────────────────────────
let _currentKits = [];   // résultats de la dernière requête

function renderResultats(kits) {
    if (kits !== undefined) _currentKits = kits;

    const filterVal = $('histo-filter')?.value || 'tous';
    const listEl    = $('histo-list');

    const filtered = _currentKits.filter(k =>
        filterVal === 'tous' || k.statut_conformite === filterVal
    );

    listEl.innerHTML = '';

    if (!filtered.length) {
        afficherEtat('empty',
            _currentKits.length
                ? 'Aucun kit ne correspond au filtre sélectionné.'
                : 'Aucun contrôle enregistré pour cet emplacement.'
        );
        return;
    }

    afficherEtat('results');

    // Compteur
    const counter = $('histo-counter');
    if (counter) {
        counter.textContent =
            `${filtered.length} contrôle${filtered.length > 1 ? 's' : ''} affiché${filtered.length > 1 ? 's' : ''}`;
    }

    filtered.forEach(k => {
        const date = new Date(k.derniere_verification).toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });

        const statut    = k.statut_conformite || 'Non vérifié';
        const isOk      = statut === 'Conforme';
        const isKo      = statut === 'Incomplet';
        const manquants = (k.detail_verification || []).filter(c =>
            c.quantite_comptee !== null && c.quantite_comptee !== c.quantite_requise
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
                        <span class="histo-emp">${k.empId}</span>
                        <div class="histo-kit-row">
                            ${k.engin ? `<span class="histo-engin">${k.engin}</span>` : ''}
                            <span class="histo-kit">${k.kitId}</span>
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

// ─── États de l'UI ────────────────────────────────────────────────────────────
function afficherEtat(etat, message = '') {
    const loading = $('histo-loading');
    const empty   = $('histo-empty');
    const listEl  = $('histo-list');
    const counter = $('histo-counter');

    // Tout masquer par défaut
    loading?.classList.add('hidden');
    empty?.classList.add('hidden');
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
            if (empty) {
                empty.textContent = message;
                empty.classList.remove('hidden');
            }
            break;

        case 'results':
            // Le rendu se charge dans renderResultats()
            break;
    }
}

// ─── Appelé depuis app.js lors du changement d'onglet ─────────────────────────
// (remplace chargerHistorique — plus rien à charger au démarrage)
export function chargerHistorique() {
    // Réinitialiser l'UI sans toucher à Firestore
    const listEl = $('histo-list');
    const empty  = $('histo-empty');
    const counter = $('histo-counter');

    if (listEl)  listEl.innerHTML = '';
    if (empty)   { empty.textContent = ''; empty.classList.add('hidden'); }
    if (counter) counter.textContent = '';

    // Si l'agent revient sur l'onglet avec une recherche en cours → ré-afficher
    const searchVal = ($('histo-search')?.value || '').trim();
    if (searchVal && _currentKits.length) {
        renderResultats();
    }
}
