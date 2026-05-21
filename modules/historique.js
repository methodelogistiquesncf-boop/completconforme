// ─────────────────────────────────────────────────────────────────────────────
// modules/historique.js — Chargement et rendu de l'historique des contrôles
// ─────────────────────────────────────────────────────────────────────────────
import {
    collection, getDocs,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db }                    from "./firebase.js";
import { $, showToast }          from "./utils.js";

// ─── État interne ─────────────────────────────────────────────────────────────
let histoData = [];

// ─── Init & câblage ───────────────────────────────────────────────────────────
export function initHistorique() {
    $('histo-search')?.addEventListener('input',  () => renderHistorique(histoData));
    $('histo-filter')?.addEventListener('change', () => renderHistorique(histoData));
}

// ─── Chargement ───────────────────────────────────────────────────────────────
export async function chargerHistorique() {
    const listEl  = $('histo-list');
    const loading = $('histo-loading');
    const empty   = $('histo-empty');

    listEl.innerHTML = '';
    loading.classList.remove('hidden');
    empty.classList.add('hidden');

    try {
        const empSnap = await getDocs(collection(db, "emplacements"));
        histoData = [];

        const promises = empSnap.docs.map(async empDoc => {
            const empId    = empDoc.id;
            const kitsSnap = await getDocs(collection(db, "emplacements", empId, "kits"));
            kitsSnap.forEach(kitDoc => {
                const data = kitDoc.data();
                if (data.derniere_verification) {
                    histoData.push({ empId, kitId: kitDoc.id, ...data });
                }
            });
        });

        await Promise.all(promises);
        histoData.sort((a, b) => new Date(b.derniere_verification) - new Date(a.derniere_verification));
        renderHistorique(histoData);

    } catch (err) {
        loading.classList.add('hidden');
        empty.textContent = '⚠️ Erreur : ' + err.message;
        empty.classList.remove('hidden');
    }
}

// ─── Rendu ────────────────────────────────────────────────────────────────────
export function renderHistorique(liste) {
    const loading   = $('histo-loading');
    const empty     = $('histo-empty');
    const listEl    = $('histo-list');
    const filterVal = $('histo-filter')?.value  || 'tous';
    const searchVal = ($('histo-search')?.value || '').trim().toUpperCase();

    loading.classList.add('hidden');
    listEl.innerHTML = '';

    const filtered = liste.filter(k => {
        const matchSearch = !searchVal ||
            k.empId.includes(searchVal) ||
            k.kitId.toUpperCase().includes(searchVal) ||
            (k.engin || '').toUpperCase().includes(searchVal);
        const matchFilter = filterVal === 'tous' || k.statut_conformite === filterVal;
        return matchSearch && matchFilter;
    });

    if (!filtered.length) {
        empty.classList.remove('hidden');
        empty.textContent = 'Aucun résultat trouvé.';
        return;
    }

    empty.classList.add('hidden');

    filtered.forEach(k => {
        const date = new Date(k.derniere_verification).toLocaleString('fr-FR', {
            day:'2-digit', month:'2-digit', year:'numeric',
            hour:'2-digit', minute:'2-digit',
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
