// ─────────────────────────────────────────────────────────────────────────────
// modules/terrain.js — Calendrier, vue kits, vue détail, validation
// ─────────────────────────────────────────────────────────────────────────────
import {
    doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
    collection, collectionGroup,
    query, where, onSnapshot, increment,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db, auth }                                  from "./firebase.js";
import { $, JOURS_COURTS, MOIS_LONGS, aujourd_hui,
         toIso, fromIso, isoToDisplay, getWeekDays,
         showToast, showConfirmToast, numSemaine }   from "./utils.js";
import { invaliderCacheStats }                        from "./stats.js";

// ─── État interne ─────────────────────────────────────────────────────────────
let currentEmpId        = "";
let currentKitId        = "";
let _currentKitData     = {};
let _unsubscribeSemaine = null;

const CAL = {
    weekOffset:  0,
    selectedIso: null,
    empFilter:   "",
    wmsFilter:   "MAG2-E-PRE",
    cache:       {},
    loading:     false,
};

// ─── Init & câblage ───────────────────────────────────────────────────────────
export function initTerrain() {
    $('cal-prev')?.addEventListener('click',  () => { CAL.weekOffset--; renderCalendrier(); });
    $('cal-next')?.addEventListener('click',  () => { CAL.weekOffset++; renderCalendrier(); });
    $('cal-today')?.addEventListener('click', () => {
        CAL.weekOffset  = 0;
        CAL.selectedIso = aujourd_hui();
        renderCalendrier();
    });

    $('cal-emp-input')?.addEventListener('input', e => {
        CAL.empFilter = e.target.value.trim();
        _renderCalStrip(getWeekDays(CAL.weekOffset), false);
        if (CAL.selectedIso) renderKitsJour(CAL.selectedIso);
    });

    $('cal-wms-input')?.addEventListener('input', e => {
        CAL.wmsFilter = e.target.value.trim();
        _renderCalStrip(getWeekDays(CAL.weekOffset), false);
        if (CAL.selectedIso) renderKitsJour(CAL.selectedIso);
    });

    $('btn-retour-cal')?.addEventListener('click',  () => afficherVue('calendrier'));
    $('btn-retour-cals')?.addEventListener('click', () => afficherVue('calendrier'));

    $('btn-retour-kits')?.addEventListener('click', () => {
        afficherVue('kits');
        if (currentEmpId) chargerKitsEmplacement(currentEmpId);
    });

    $('btn-conforme')?.addEventListener('click',  () => _valider("Conforme"));
    $('btn-incomplet')?.addEventListener('click', () => _valider("Incomplet"));
}

// ─── Activation / désactivation de l'onglet ──────────────────────────────────
export function activerTerrain() {
    CAL.cache = {};
    if (_unsubscribeSemaine) {
        _unsubscribeSemaine();
        _unsubscribeSemaine = null;
    }
    afficherVue('calendrier');
    renderCalendrier();
}

export function desactiverTerrain() {
    if (_unsubscribeSemaine) {
        _unsubscribeSemaine();
        _unsubscribeSemaine = null;
    }
}

// ─── Navigation entre vues ────────────────────────────────────────────────────
export function afficherVue(vue) {
    $('view-calendrier').classList.toggle('hidden', vue !== 'calendrier');
    $('view-kits').classList.toggle('hidden',       vue !== 'kits');
    $('view-detail').classList.toggle('hidden',     vue !== 'detail');
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDRIER — LISTENER TEMPS RÉEL
// ═══════════════════════════════════════════════════════════════════════════════
function _ecouterKitsSemaine(days) {
    const isos               = days.map(toIso);
    const debut              = isos[0];
    const fin                = isos[6];
    const aujourdhui         = aujourd_hui();
    const estSemaineCourante = isos.includes(aujourdhui);

    if (!estSemaineCourante && isos.every(iso => iso in CAL.cache)) {
        _renderCalStrip(days, false);
        if (CAL.selectedIso) renderKitsJour(CAL.selectedIso);
        else _renderEmptyState();
        return;
    }

    if (_unsubscribeSemaine) {
        _unsubscribeSemaine();
        _unsubscribeSemaine = null;
    }

    CAL.loading = true;

    const q = query(
        collectionGroup(db, "kits"),
        where("date_debut_iso", ">=", debut),
        where("date_debut_iso", "<=", fin)
    );

    _unsubscribeSemaine = onSnapshot(q,
        (snap) => {
            isos.forEach(iso => { CAL.cache[iso] = []; });

            snap.forEach(kitDoc => {
                const data = kitDoc.data();
                const iso  = data.date_debut_iso;
                if (!iso || !CAL.cache[iso]) return;

                const empId = kitDoc.ref.path.split('/')[1] || "";

                CAL.cache[iso].push({
                    kitId:             kitDoc.id,
                    empId,
                    nom_du_kit:        data.nom_du_kit        || kitDoc.id,
                    engin:             data.engin             || "",
                    code_kit:          data.code_kit          || "",
                    code_contenant:    data.code_contenant    || "",
                    statut_conformite: data.statut_conformite || "Non vérifié",
                    emplacement_wms:   data.emplacement_wms_remontage || "",
                    date_debut_iso:    iso,
                });
            });

            CAL.loading = false;
            _renderCalStrip(days, false);
            if (CAL.selectedIso) renderKitsJour(CAL.selectedIso);
            else _renderEmptyState();
        },
        (err) => {
            CAL.loading = false;
            console.error("[CAL] Erreur onSnapshot :", err);
            showToast("⚠️ Erreur calendrier : " + err.message, 'error');
            _unsubscribeSemaine = null;
        }
    );
}

// ─── Rendu principal ──────────────────────────────────────────────────────────
export function renderCalendrier() {
    const days = getWeekDays(CAL.weekOffset);
    _renderWeekLabel(days);
    _renderCalStrip(days, true);
    _ecouterKitsSemaine(days);
}

function _renderWeekLabel(days) {
    const lbl = $('cal-week-label');
    if (!lbl) return;
    lbl.textContent = `${days[0].getDate()} ${MOIS_LONGS[days[0].getMonth()]} — ${days[6].getDate()} ${MOIS_LONGS[days[6].getMonth()]} ${days[6].getFullYear()}`;
}

function _renderCalStrip(days, skeleton = false) {
    const strip = $('cal-strip');
    if (!strip) return;
    strip.innerHTML = '';
    const today = aujourd_hui();

    days.forEach((d, i) => {
        const iso  = toIso(d);
        const kits = skeleton ? [] : (CAL.cache[iso] || []);

        const emp = CAL.empFilter.toUpperCase();
        const wms = CAL.wmsFilter.toUpperCase();
        const kitsFiltered = kits.filter(k =>
            (!emp || k.empId.toUpperCase().includes(emp) || k.engin.toUpperCase().includes(emp)) &&
            (!wms || k.emplacement_wms.toUpperCase().includes(wms))
        );

        const nbKo      = kitsFiltered.filter(k => k.statut_conformite === 'Incomplet').length;
        const nbPending = kitsFiltered.filter(k => k.statut_conformite !== 'Conforme' && k.statut_conformite !== 'Incomplet').length;
        const nbOk      = kitsFiltered.filter(k => k.statut_conformite === 'Conforme').length;

        const isToday    = iso === today;
        const isSelected = iso === CAL.selectedIso;

        const cell = document.createElement('div');
        cell.className = 'cal-day'
            + (isToday    ? ' cal-today'    : '')
            + (isSelected ? ' cal-selected' : '')
            + (skeleton   ? ' cal-skeleton' : '');

        if (!skeleton) {
            cell.innerHTML = `
                <div class="cal-day-header">
                    <span class="cal-dow">${JOURS_COURTS[i]}</span>
                    <span class="cal-num">${d.getDate()}</span>
                </div>
                <div class="cal-dots">
                    ${nbKo      ? `<span class="cal-dot dot-amber" title="${nbKo} incomplet(s)"></span>`     : ''}
                    ${nbPending ? `<span class="cal-dot dot-red"   title="${nbPending} à contrôler"></span>` : ''}
                    ${nbOk      ? `<span class="cal-dot dot-green" title="${nbOk} conforme(s)"></span>`      : ''}
                </div>
                ${kitsFiltered.length ? `<span class="cal-count">${kitsFiltered.length}</span>` : ''}
            `;
            cell.addEventListener('click', () => _selectJour(iso));
        } else {
            cell.innerHTML = `
                <div class="cal-day-header">
                    <span class="cal-dow">${JOURS_COURTS[i]}</span>
                    <span class="cal-num">${d.getDate()}</span>
                </div>
            `;
        }
        strip.appendChild(cell);
    });
}

function _selectJour(iso) {
    CAL.selectedIso = iso;
    _renderCalStrip(getWeekDays(CAL.weekOffset), false);
    renderKitsJour(iso);
}

export function renderKitsJour(iso) {
    const container = $('cal-kits-container');
    const header    = $('cal-kits-header');
    const listEl    = $('cal-kits-list');
    if (!container || !listEl) return;

    container.classList.remove('hidden');

    const kits = CAL.cache[iso] || [];
    const emp  = CAL.empFilter.toUpperCase();
    const wms  = CAL.wmsFilter.toUpperCase();
    const filtered = kits.filter(k =>
        (!emp || k.empId.toUpperCase().includes(emp) || k.engin.toUpperCase().includes(emp)) &&
        (!wms || k.emplacement_wms.toUpperCase().includes(wms))
    );

    filtered.sort((a, b) => {
        const ordre = { "Incomplet": 0, "Non vérifié": 1, "Conforme": 2 };
        return (ordre[a.statut_conformite] ?? 1) - (ordre[b.statut_conformite] ?? 1);
    });

    if (header) {
        header.innerHTML = `
            <span class="cal-kits-date">${isoToDisplay(iso)}</span>
            <span class="cal-kits-count">${filtered.length} kit${filtered.length > 1 ? 's' : ''}</span>
        `;
    }

    listEl.innerHTML = '';

    if (!filtered.length) {
        listEl.innerHTML = `
            <div class="cal-empty">
                <span class="cal-empty-icon">✓</span>
                <span>Aucun kit pour cette date${emp ? ' et cet emplacement' : ''}</span>
            </div>
        `;
        return;
    }

    filtered.forEach(k => {
        listEl.appendChild(_buildKitCard(k, () => ouvrirDetailKit(k.empId, k.kitId)));
    });
}

function _renderEmptyState() {
    $('cal-kits-container')?.classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════════════════════════
// VUE KITS D'UN EMPLACEMENT
// ═══════════════════════════════════════════════════════════════════════════════
export async function chargerKitsEmplacement(empId) {
    currentEmpId = empId;
    afficherVue('kits');

    const title   = $('kits-emp-title');
    const loading = $('kits-emp-loading');
    const vide    = $('kits-emp-vide');
    const listEl  = $('kits-emp-list');

    title.textContent = `📍 ${empId}`;
    loading.classList.remove('hidden');
    vide.classList.add('hidden');
    listEl.innerHTML = '';

    try {
        const kitsSnap = await getDocs(collection(db, "emplacements", empId, "kits"));
        const kits = [];
        kitsSnap.forEach(d => kits.push({ kitId: d.id, ...d.data() }));
        loading.classList.add('hidden');

        if (!kits.length) {
            vide.classList.remove('hidden');
            vide.textContent = 'Aucun kit trouvé pour cet emplacement.';
            return;
        }

        kits.sort((a, b) => a.kitId.localeCompare(b.kitId));
        kits.forEach(k => {
            const card = _buildKitCard(k, () => ouvrirDetailKit(empId, k.kitId), true);
            listEl.appendChild(card);
        });
    } catch (err) {
        loading.classList.add('hidden');
        showToast('⚠️ ' + err.message, 'error');
    }
}

// ─── Constructeur de carte kit ────────────────────────────────────────────────
function _buildKitCard(k, onClick, showDate = false) {
    const statut = k.statut_conformite || 'Non vérifié';
    const isOk   = statut === 'Conforme';
    const isKo   = statut === 'Incomplet';

    const card = document.createElement('div');
    card.className = 'kit-liste-item' + (isOk ? ' kit-liste-ok' : isKo ? ' kit-liste-ko' : '');
    card.innerHTML = `
        <div class="kit-liste-left">
            <div class="kit-liste-meta">
                ${k.engin          ? `<span class="kit-liste-engin-badge">${k.engin}</span>` : ''}
                <span class="kit-liste-code">${k.code_kit || k.kitId}</span>
                ${k.code_contenant ? `<span class="kit-liste-contenant">📦 ${k.code_contenant}</span>` : ''}
                ${k.empId && !showDate ? `<span class="kit-liste-emp-badge">📍 ${k.empId}</span>` : ''}
            </div>
            <span class="kit-liste-nom">${k.nom_du_kit || k.kitId}</span>
            ${k.emplacement_wms ? `<span class="kit-liste-wms">🔧 WMS : ${k.emplacement_wms}</span>` : ''}
            ${showDate && k.derniere_verification ? `<span class="kit-liste-date">🕒 ${
                new Date(k.derniere_verification).toLocaleString('fr-FR', {
                    day:'2-digit', month:'2-digit', year:'numeric',
                    hour:'2-digit', minute:'2-digit',
                })
            }</span>` : ''}
            ${k.observation ? `<span class="kit-liste-obs">💬 ${k.observation}</span>` : ''}
        </div>
        <div class="kit-liste-right">
            <span class="kit-liste-statut ${isOk ? 'ok' : isKo ? 'ko' : 'pending'}">
                ${isOk ? '✅ Conforme' : isKo ? '⚠️ Incomplet' : '· À contrôler'}
            </span>
            <span class="kit-liste-arrow">›</span>
        </div>
    `;
    card.addEventListener('click', onClick);
    return card;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VUE DÉTAIL KIT
// ═══════════════════════════════════════════════════════════════════════════════
export async function ouvrirDetailKit(empId, kitId) {
    currentEmpId = empId;
    currentKitId = kitId;
    afficherVue('detail');

    const loadCard = $('detail-loading-card');
    const kitCard  = $('detail-kit-card');
    loadCard.classList.remove('hidden');
    kitCard.classList.add('hidden');

    try {
        const kitDocSnap = await getDoc(doc(db, "emplacements", empId, "kits", kitId));
        const nomSnap    = await getDoc(doc(db, "nomenclature_kits", kitId));
        if (!nomSnap.exists()) throw new Error(`Nomenclature du kit « ${kitId} » introuvable.`);

        const kitData = kitDocSnap.exists() ? kitDocSnap.data() : {};
        _afficherDetailKit(kitId, { ...nomSnap.data(), ...kitData }, empId);

    } catch (err) {
        loadCard.classList.add('hidden');
        showToast('⚠️ ' + err.message, 'error');
        afficherVue('calendrier');
    }
}

function _afficherDetailKit(kitId, data, empId) {
    _currentKitData = data;

    $('detail-loading-card').classList.add('hidden');

    $('detail-emp-badge').textContent = empId;
    $('detail-kit-badge').textContent = kitId;
    $('detail-nom').textContent       = data.nom_du_kit || kitId;
    $('detail-emp').textContent       = empId;

    const enginEl = $('detail-engin');
    if (enginEl) {
        const parts = [];
        if (data.engin)                     parts.push(`🚂 Engin : ${data.engin}`);
        if (data.code_kit)                  parts.push(`Code : ${data.code_kit}`);
        if (data.code_contenant)            parts.push(`📦 Contenant : ${data.code_contenant}`);
        if (data.emplacement_wms_remontage) parts.push(`🔧 WMS : ${data.emplacement_wms_remontage}`);
        if (data.date_debut_iso)            parts.push(`📅 Date : ${isoToDisplay(data.date_debut_iso)}`);
        enginEl.textContent = parts.join('  ·  ');
    }

    const compList = $('comp-list');
    compList.innerHTML = '';
    (data.composants || []).forEach(comp => {
        const item = document.createElement('div');
        item.className         = 'comp-item';
        item.dataset.required  = comp.quantite_requise;
        item.dataset.codePiece = comp.code_piece || '';
        item.innerHTML = `
            <div class="comp-left">
                <div class="comp-status-icon">
                    <svg class="icon-ok" width="12" height="9" viewBox="0 0 12 9" fill="none">
                        <path d="M1 4L4.5 7.5L11 1" stroke="white" stroke-width="2"
                              stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <svg class="icon-ko" width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1L9 9M9 1L1 9" stroke="white" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                ${comp.code_piece ? `<span class="comp-code-piece">${comp.code_piece}</span>` : ''}
                <span class="comp-name">${comp.nom}</span>
            </div>
            <span class="comp-qty-required">${comp.quantite_requise}</span>
            <input type="number" class="qty-input" min="0" placeholder="—"
                   aria-label="Quantité comptée">
        `;
        const input = item.querySelector('.qty-input');
        input.addEventListener('input', () => _evaluerItem(item, input, comp.quantite_requise));
        compList.appendChild(item);
    });

    // ── Observation ───────────────────────────────────────────────────────────
    const obsEl      = $('obs-textarea');
    const obsCounter = $('obs-counter');

    if (obsEl) {
        obsEl.value = data.observation || '';

        const _majCompteur = () => {
            if (!obsCounter) return;
            const n = obsEl.value.length;
            obsCounter.textContent = `${n} / 500`;
            obsCounter.className   = 'obs-counter'
                + (n > 480 ? ' danger' : n > 450 ? ' warn' : '');
        };

        _majCompteur();
        obsEl.oninput = _majCompteur;
    }

    $('detail-kit-card').classList.remove('hidden');
}

// ─── Évaluation d'un item ─────────────────────────────────────────────────────
function _evaluerItem(item, input, required) {
    const val = input.value.trim();
    if (val === '') { item.classList.remove('checked', 'non-conforme'); return; }
    const counted = parseInt(val, 10);
    if (counted === required) {
        item.classList.add('checked'); item.classList.remove('non-conforme');
    } else {
        item.classList.add('non-conforme'); item.classList.remove('checked');
    }
}

// ─── Validation ───────────────────────────────────────────────────────────────
async function _valider(statut) {
    if (!currentEmpId || !currentKitId) return;

    const items       = [...$('comp-list').querySelectorAll('.comp-item')];
    const observation = ($('obs-textarea')?.value || '').trim();

    if (statut === "Conforme") {
        const nonConformes  = items.filter(i => i.classList.contains('non-conforme'));
        const nonRenseignes = items.filter(i =>
            !i.classList.contains('checked') && !i.classList.contains('non-conforme')
        );
        if (nonConformes.length > 0) {
            showToast(`❌ ${nonConformes.length} article(s) en quantité incorrecte.`, 'error');
            return;
        }
        if (nonRenseignes.length > 0) {
            if (!await showConfirmToast(`${nonRenseignes.length} article(s) non renseignés. Valider quand même ?`))
                return;
        }
    }

    const details = items.map(item => ({
        nom:              item.querySelector('.comp-name').textContent,
        code_piece:       item.dataset.codePiece || '',
        quantite_requise: parseInt(item.dataset.required, 10),
        quantite_comptee: item.querySelector('.qty-input').value !== ''
                              ? parseInt(item.querySelector('.qty-input').value, 10)
                              : null,
    }));

    try {
        const now      = new Date().toISOString();
        const email    = auth.currentUser?.email || "inconnu";
        const kitData  = _currentKitData;
        const engin    = kitData.engin?.trim() || "—";
        const dateNow  = new Date();
        const semLabel = `${dateNow.getFullYear()}-W${String(numSemaine(dateNow)).padStart(2, '0')}`;

        // ── 1. Statut sur le kit ──────────────────────────────────────────────
        await setDoc(
            doc(db, "emplacements", currentEmpId, "kits", currentKitId),
            {
                statut_conformite:     statut,
                derniere_verification: now,
                verificateur_email:    email,
                detail_verification:   details,
                observation,
            },
            { merge: true }
        );

        // ── 2. Historique ─────────────────────────────────────────────────────
        await addDoc(collection(db, "historique_controles"), {
            empId:               currentEmpId,
            kitId:               currentKitId,
            nom_du_kit:          kitData.nom_du_kit     || currentKitId,
            engin:               kitData.engin          || "",
            code_kit:            kitData.code_kit       || "",
            code_contenant:      kitData.code_contenant || "",
            statut,
            observation,
            verificateur_email:  email,
            timestamp:           now,
            detail_verification: details,
        });

        // ── 3. Document de synthèse stats/kpi ─────────────────────────────────
        const statsRef  = doc(db, "stats", "kpi");
        const statsSnap = await getDoc(statsRef);

        if (!statsSnap.exists()) {
            await setDoc(statsRef, {
                total:      0,
                conformes:  0,
                incomplets: 0,
                par_engin:  {},
                par_semaine: {},
            });
        }

        await updateDoc(statsRef, {
            total:                                       increment(1),
            conformes:                                   increment(statut === "Conforme"  ? 1 : 0),
            incomplets:                                  increment(statut === "Incomplet" ? 1 : 0),
            [`par_engin.${engin}.total`]:                increment(1),
            [`par_engin.${engin}.conformes`]:            increment(statut === "Conforme"  ? 1 : 0),
            [`par_semaine.${semLabel}.total`]:           increment(1),
            [`par_semaine.${semLabel}.conformes`]:       increment(statut === "Conforme"  ? 1 : 0),
            [`par_semaine.${semLabel}.incomplets`]:      increment(statut === "Incomplet" ? 1 : 0),
        });

        // ── 4. Invalide le cache stats ────────────────────────────────────────
        invaliderCacheStats();

        showToast(`✅ Statut « ${statut} » enregistré.`, 'success');
        setTimeout(() => {
            currentEmpId    = '';
            currentKitId    = '';
            _currentKitData = {};
            afficherVue('calendrier');
        }, 1500);

    } catch (err) {
        showToast("Erreur d'enregistrement : " + err.message, 'error');
    }
}
