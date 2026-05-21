// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS Firebase
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    doc, setDoc, getDoc, getDocs, addDoc,
    collection, collectionGroup,
    query, where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION Firebase
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey:            "AIzaSyAkhB59fG7oNtRfhb_0xeuW9PYmaUT9KRk",
    authDomain:        "completconforme.firebaseapp.com",
    projectId:         "completconforme",
    storageBucket:     "completconforme.firebasestorage.app",
    messagingSenderId: "595620033926",
    appId:             "1:595620033926:web:64dcfd0b141040146a2807"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

let db;
try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
        })
    });
    console.log("[Offline] Cache activé avec succès (multi-onglets).");
} catch (err) {
    console.warn("[Offline] Persistance indisponible :", err.message);
    db = getFirestore(app);
}

const ADMIN_PIN = "1234";

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN GITHUB
// ─────────────────────────────────────────────────────────────────────────────
const FIRESTORE_SECRET = { col: "config", doc: "secrets", field: "github_token" };

async function lireToken() {
    const snap = await getDoc(doc(db, FIRESTORE_SECRET.col, FIRESTORE_SECRET.doc));
    if (!snap.exists()) throw new Error("Aucun token configuré. Enregistrez-en un d'abord.");
    const token = snap.data()[FIRESTORE_SECRET.field];
    if (!token) throw new Error("Champ token vide dans Firestore.");
    return token;
}

// ─── ÉTAT GLOBAL ─────────────────────────────────────────────────────────────
let currentEmpId = "";
let currentKitId = "";

const CAL = {
    weekOffset:  0,
    selectedIso: null,
    empFilter:   "",
    wmsFilter:   "MAG2-E-PRE",
    cache:       {},
    loading:     false,
};

// ─── REFS DOM ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const loginPage  = $('login-page');
const appEl      = $('app');
const loginEmail = $('login-email');
const loginPwd   = $('login-pwd');
const btnLogin   = $('btn-login');
const loginError = $('login-error');
const btnLogout  = $('btn-logout');

const tabTerrain    = $('tab-terrain');
const tabAdmin      = $('tab-admin');
const tabHistorique = $('tab-historique');
const tabProfil     = $('tab-profil');
const secTerrain    = $('sec-terrain');
const secAdmin      = $('sec-admin');
const secHistorique = $('sec-historique');
const secProfil     = $('sec-profil');

const offlineBanner = $('offline-banner');

const viewCalendrier = $('view-calendrier');
const viewKits       = $('view-kits');
const viewDetail     = $('view-detail');

const btnRetourCal   = $('btn-retour-cal');
const kitsEmpTitle   = $('kits-emp-title');
const kitsEmpLoading = $('kits-emp-loading');
const kitsEmpVide    = $('kits-emp-vide');
const kitsEmpList    = $('kits-emp-list');

const btnRetourKits     = $('btn-retour-kits');
const detailEmpBadge    = $('detail-emp-badge');
const detailKitBadge    = $('detail-kit-badge');
const detailNom         = $('detail-nom');
const detailEmp         = $('detail-emp');
const detailEngin       = $('detail-engin');
const detailLoadingCard = $('detail-loading-card');
const detailKitCard     = $('detail-kit-card');
const compList          = $('comp-list');

const pinInputs    = document.querySelectorAll('.pin-input');
const pinError     = $('pin-error');
const adminAuth    = $('admin-auth');
const adminContent = $('admin-content');

const histoList    = $('histo-list');
const histoLoading = $('histo-loading');
const histoEmpty   = $('histo-empty');
const histoSearch  = $('histo-search');
const histoFilter  = $('histo-filter');

const tabStats   = $('tab-stats');
const secStats   = $('sec-stats');

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

onAuthStateChanged(auth, user => {
    if (user) showApp(user);
    else      showLogin();
});

function showLogin() {
    loginPage.style.display = 'flex';
    appEl.classList.remove('visible');
    loginEmail.value = '';
    loginPwd.value   = '';
    loginError.classList.remove('visible');
}

function showApp(user) {
    loginPage.style.display = 'none';
    appEl.classList.add('visible');
    const headerUser = $('header-user');
    if (headerUser) {
        headerUser.textContent = user.email.charAt(0).toUpperCase();
        headerUser.title = user.email;
    }
    showTab('terrain');
}

btnLogin.addEventListener('click', async () => {
    const email = loginEmail.value.trim();
    const pwd   = loginPwd.value;
    if (!email || !pwd) { showLoginError("Veuillez remplir tous les champs."); return; }
    btnLogin.disabled    = true;
    btnLogin.textContent = "Connexion…";
    loginError.classList.remove('visible');
    try {
        await signInWithEmailAndPassword(auth, email, pwd);
    } catch (err) {
        showLoginError(firebaseAuthMessage(err.code));
    } finally {
        btnLogin.disabled    = false;
        btnLogin.textContent = "Se connecter →";
    }
});

[loginEmail, loginPwd].forEach(el =>
    el.addEventListener('keydown', e => { if (e.key === 'Enter') btnLogin.click(); })
);

btnLogout.addEventListener('click', async () => {
    if (await showConfirmToast("Se déconnecter ?")) signOut(auth);
});

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.add('visible');
}

function firebaseAuthMessage(code) {
    const map = {
        'auth/invalid-email':          "Adresse e-mail invalide.",
        'auth/user-not-found':         "Aucun compte trouvé pour cet e-mail.",
        'auth/wrong-password':         "Mot de passe incorrect.",
        'auth/too-many-requests':      "Trop de tentatives. Réessayez plus tard.",
        'auth/network-request-failed': "Erreur réseau. Vérifiez votre connexion.",
        'auth/invalid-credential':     "Identifiants invalides.",
    };
    return map[code] || "Erreur de connexion (" + code + ").";
}

tabStats.addEventListener('click', () => showTab('stats'));
// ═══════════════════════════════════════════════════════════════════════════════
// OFFLINE
// ═══════════════════════════════════════════════════════════════════════════════

function updateOnlineBanner() {
    offlineBanner.classList.toggle('visible', !navigator.onLine);
}
window.addEventListener('online',  updateOnlineBanner);
window.addEventListener('offline', updateOnlineBanner);
updateOnlineBanner();

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION ONGLETS
// ═══════════════════════════════════════════════════════════════════════════════

tabTerrain.addEventListener('click',    () => showTab('terrain'));
tabAdmin.addEventListener('click',      () => showTab('admin'));
tabHistorique.addEventListener('click', () => showTab('historique'));
tabProfil.addEventListener('click',     () => showTab('profil'));

function showTab(tab) {
    tabTerrain.classList.toggle('active',    tab === 'terrain');
    tabAdmin.classList.toggle('active',      tab === 'admin');
    tabHistorique.classList.toggle('active', tab === 'historique');
    tabProfil.classList.toggle('active',     tab === 'profil');
    tabStats.classList.toggle('active',      tab === 'stats');

    secTerrain.classList.toggle('hidden',    tab !== 'terrain');
    secAdmin.classList.toggle('hidden',      tab !== 'admin');
    secHistorique.classList.toggle('hidden', tab !== 'historique');
    secProfil.classList.toggle('hidden',     tab !== 'profil');
    secStats.classList.toggle('hidden',      tab !== 'stats');

    if (tab === 'historique') chargerHistorique();
    if (tab === 'terrain') {
        CAL.cache = {};
        afficherVue('calendrier');
        renderCalendrier();
    }
    if (tab === 'profil') afficherProfil();
    if (tab === 'stats')      chargerStatistiques();
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION VUES TERRAIN
// ═══════════════════════════════════════════════════════════════════════════════

function afficherVue(vue) {
    viewCalendrier.classList.toggle('hidden', vue !== 'calendrier');
    viewKits.classList.toggle('hidden',       vue !== 'kits');
    viewDetail.classList.toggle('hidden',     vue !== 'detail');
}

btnRetourCal?.addEventListener('click', () => afficherVue('calendrier'));

btnRetourKits?.addEventListener('click', () => {
    afficherVue('kits');
    if (currentEmpId) chargerKitsEmplacement(currentEmpId);
});

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITAIRES DATE
// ═══════════════════════════════════════════════════════════════════════════════

const JOURS_COURTS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const MOIS_LONGS   = ['Janvier','Février','Mars','Avril','Mai','Juin',
                      'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function aujourd_hui() {
    return toIso(new Date());
}

function toIso(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fromIso(iso) {
    const [y,m,d] = iso.split('-').map(Number);
    return new Date(y, m-1, d);
}

function isoToDisplay(iso) {
    const d = fromIso(iso);
    return `${d.getDate()} ${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`;
}

function getWeekDays(offset = 0) {
    const now = new Date();
    const dow = now.getDay() || 7;
    const lun = new Date(now);
    lun.setDate(now.getDate() - dow + 1 + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(lun);
        d.setDate(lun.getDate() + i);
        return d;
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDRIER — CHARGEMENT FIRESTORE
// ═══════════════════════════════════════════════════════════════════════════════

async function chargerKitsSemaine(days) {
    const isos  = days.map(toIso);
    const debut = isos[0];
    const fin   = isos[6];

    const tousEnCache = isos.every(iso => iso in CAL.cache);
    if (tousEnCache) return;

    CAL.loading = true;
    try {
        const q = query(
            collectionGroup(db, "kits"),
            where("date_debut_iso", ">=", debut),
            where("date_debut_iso", "<=", fin)
        );
        const snap = await getDocs(q);

        isos.forEach(iso => { if (!(iso in CAL.cache)) CAL.cache[iso] = []; });

        snap.forEach(kitDoc => {
            const data = kitDoc.data();
            const iso  = data.date_debut_iso;
            if (!iso) return;
            if (!CAL.cache[iso]) CAL.cache[iso] = [];

            const pathParts = kitDoc.ref.path.split('/');
            const empId = pathParts[1] || "";

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
    } catch (err) {
        console.error("[CAL] Erreur chargement semaine :", err);
        showToast("⚠️ Erreur chargement calendrier : " + err.message, 'error');
    } finally {
        CAL.loading = false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDRIER — RENDU
// ═══════════════════════════════════════════════════════════════════════════════

async function renderCalendrier() {
    const days = getWeekDays(CAL.weekOffset);
    _renderWeekLabel(days);
    _renderCalStrip(days, true);
    await chargerKitsSemaine(days);
    _renderCalStrip(days, false);
    if (CAL.selectedIso) renderKitsJour(CAL.selectedIso);
    else _renderEmptyState();
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
                    ${nbKo      ? `<span class="cal-dot dot-amber" title="${nbKo} incomplet(s)"></span>` : ''}
                    ${nbPending ? `<span class="cal-dot dot-red"   title="${nbPending} à contrôler"></span>` : ''}
                    ${nbOk      ? `<span class="cal-dot dot-green" title="${nbOk} conforme(s)"></span>` : ''}
                </div>
                ${kitsFiltered.length ? `<span class="cal-count">${kitsFiltered.length}</span>` : ''}
            `;
            cell.addEventListener('click', () => selectJour(iso));
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

function selectJour(iso) {
    CAL.selectedIso = iso;
    _renderCalStrip(getWeekDays(CAL.weekOffset), false);
    renderKitsJour(iso);
}

function renderKitsJour(iso) {
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
        const isOk = k.statut_conformite === 'Conforme';
        const isKo = k.statut_conformite === 'Incomplet';

        const card = document.createElement('div');
        card.className = 'kit-liste-item' + (isOk ? ' kit-liste-ok' : isKo ? ' kit-liste-ko' : '');
        card.innerHTML = `
            <div class="kit-liste-left">
                <div class="kit-liste-meta">
                    ${k.engin ? `<span class="kit-liste-engin-badge">${k.engin}</span>` : ''}
                    <span class="kit-liste-code">${k.code_kit || k.kitId}</span>
                    ${k.code_contenant ? `<span class="kit-liste-contenant">📦 ${k.code_contenant}</span>` : ''}
                    ${k.empId ? `<span class="kit-liste-emp-badge">📍 ${k.empId}</span>` : ''}
                </div>
                <span class="kit-liste-nom">${k.nom_du_kit}</span>
                ${k.emplacement_wms ? `<span class="kit-liste-wms">🔧 WMS : ${k.emplacement_wms}</span>` : ''}
            </div>
            <div class="kit-liste-right">
                <span class="kit-liste-statut ${isOk ? 'ok' : isKo ? 'ko' : 'pending'}">
                    ${isOk ? '✅ Conforme' : isKo ? '⚠️ Incomplet' : '· À contrôler'}
                </span>
                <span class="kit-liste-arrow">›</span>
            </div>
        `;
        card.addEventListener('click', () => ouvrirDetailKit(k.empId, k.kitId));
        listEl.appendChild(card);
    });
}

function _renderEmptyState() {
    const container = $('cal-kits-container');
    if (container) container.classList.add('hidden');
}

$('cal-prev')?.addEventListener('click',  async () => { CAL.weekOffset--; await renderCalendrier(); });
$('cal-next')?.addEventListener('click',  async () => { CAL.weekOffset++; await renderCalendrier(); });
$('cal-today')?.addEventListener('click', async () => {
    CAL.weekOffset  = 0;
    CAL.selectedIso = aujourd_hui();
    await renderCalendrier();
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

// ═══════════════════════════════════════════════════════════════════════════════
// NIVEAU 2 — KITS D'UN EMPLACEMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function chargerKitsEmplacement(empId) {
    currentEmpId = empId;
    afficherVue('kits');

    kitsEmpTitle.textContent = `📍 ${empId}`;
    kitsEmpLoading.classList.remove('hidden');
    kitsEmpVide.classList.add('hidden');
    kitsEmpList.innerHTML = '';

    try {
        const kitsSnap = await getDocs(collection(db, "emplacements", empId, "kits"));
        const kits = [];
        kitsSnap.forEach(d => kits.push({ kitId: d.id, ...d.data() }));

        kitsEmpLoading.classList.add('hidden');

        if (!kits.length) {
            kitsEmpVide.classList.remove('hidden');
            kitsEmpVide.textContent = 'Aucun kit trouvé pour cet emplacement.';
            return;
        }

        kits.sort((a, b) => a.kitId.localeCompare(b.kitId));

        kits.forEach(k => {
            const statut = k.statut_conformite || 'Non vérifié';
            const isOk   = statut === 'Conforme';
            const isKo   = statut === 'Incomplet';

            const card = document.createElement('div');
            card.className = 'kit-liste-item' + (isOk ? ' kit-liste-ok' : isKo ? ' kit-liste-ko' : '');
            card.innerHTML = `
                <div class="kit-liste-left">
                    <div class="kit-liste-meta">
                        ${k.engin ? `<span class="kit-liste-engin-badge">${k.engin}</span>` : ''}
                        <span class="kit-liste-code">${k.code_kit || k.kitId}</span>
                        ${k.code_contenant ? `<span class="kit-liste-contenant">📦 ${k.code_contenant}</span>` : ''}
                    </div>
                    <span class="kit-liste-nom">${k.nom_du_kit || k.kitId}</span>
                    ${k.derniere_verification ? `<span class="kit-liste-date">🕒 ${
                        new Date(k.derniere_verification).toLocaleString('fr-FR', {
                            day:'2-digit', month:'2-digit', year:'numeric',
                            hour:'2-digit', minute:'2-digit'
                        })
                    }</span>` : ''}
                </div>
                <div class="kit-liste-right">
                    <span class="kit-liste-statut ${isOk ? 'ok' : isKo ? 'ko' : 'pending'}">
                        ${isOk ? '✅ Conforme' : isKo ? '⚠️ Incomplet' : '· À contrôler'}
                    </span>
                    <span class="kit-liste-arrow">›</span>
                </div>
            `;
            card.addEventListener('click', () => ouvrirDetailKit(empId, k.kitId));
            kitsEmpList.appendChild(card);
        });

    } catch (err) {
        kitsEmpLoading.classList.add('hidden');
        showToast('⚠️ ' + err.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// NIVEAU 3 — DÉTAIL KIT
// ═══════════════════════════════════════════════════════════════════════════════

async function ouvrirDetailKit(empId, kitId) {
    currentEmpId = empId;
    currentKitId = kitId;

    afficherVue('detail');
    detailLoadingCard.classList.remove('hidden');
    detailKitCard.classList.add('hidden');

    try {
        const kitDocSnap = await getDoc(doc(db, "emplacements", empId, "kits", kitId));
        const nomSnap    = await getDoc(doc(db, "nomenclature_kits", kitId));
        if (!nomSnap.exists()) throw new Error(`Nomenclature du kit « ${kitId} » introuvable.`);

        const kitData = kitDocSnap.exists() ? kitDocSnap.data() : {};
        const nomData = nomSnap.data();

        afficherDetailKit(kitId, { ...nomData, ...kitData }, empId);

    } catch (err) {
        detailLoadingCard.classList.add('hidden');
        showToast('⚠️ ' + err.message, 'error');
        afficherVue('calendrier');
    }
}

function afficherDetailKit(kitId, data, empId) {
    detailLoadingCard.classList.add('hidden');

    detailEmpBadge.textContent = empId;
    detailKitBadge.textContent = kitId;
    detailNom.textContent      = data.nom_du_kit || kitId;
    detailEmp.textContent      = empId;

    if (detailEngin) {
        const parts = [];
        if (data.engin)                     parts.push(`🚂 Engin : ${data.engin}`);
        if (data.code_kit)                  parts.push(`Code : ${data.code_kit}`);
        if (data.code_contenant)            parts.push(`📦 Contenant : ${data.code_contenant}`);
        if (data.emplacement_wms_remontage) parts.push(`🔧 WMS : ${data.emplacement_wms_remontage}`);
        if (data.date_debut_iso)            parts.push(`📅 Date : ${isoToDisplay(data.date_debut_iso)}`);
        detailEngin.textContent = parts.join('  ·  ');
    }

    compList.innerHTML = '';
    (data.composants || []).forEach(comp => {
        const item = document.createElement('div');
        item.className        = 'comp-item';
        item.dataset.required = comp.quantite_requise;
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
        input.addEventListener('input', () => evaluerItem(item, input, comp.quantite_requise));
        compList.appendChild(item);
    });

    detailKitCard.classList.remove('hidden');
}

function evaluerItem(item, input, required) {
    const val = input.value.trim();
    if (val === '') { item.classList.remove('checked', 'non-conforme'); return; }
    const counted = parseInt(val, 10);
    if (counted === required) {
        item.classList.add('checked'); item.classList.remove('non-conforme');
    } else {
        item.classList.add('non-conforme'); item.classList.remove('checked');
    }
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────

$('btn-conforme').addEventListener('click',  () => valider("Conforme"));
$('btn-incomplet').addEventListener('click', () => valider("Incomplet"));

async function valider(statut) {
    if (!currentEmpId || !currentKitId) return;

    const items = [...compList.querySelectorAll('.comp-item')];

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
            if (!await showConfirmToast(
                `${nonRenseignes.length} article(s) non renseignés. Valider quand même ?`
            )) return;
        }
    }

    const details = items.map(item => ({
        nom:              item.querySelector('.comp-name').textContent,
        quantite_requise: parseInt(item.dataset.required, 10),
        quantite_comptee: item.querySelector('.qty-input').value !== ''
                              ? parseInt(item.querySelector('.qty-input').value, 10)
                              : null,
    }));

    try {
        const now = new Date().toISOString();
        await setDoc(
            doc(db, "emplacements", currentEmpId, "kits", currentKitId),
            {
                statut_conformite:     statut,
                derniere_verification: now,
                verificateur_email:    auth.currentUser?.email || 'inconnu',
                detail_verification:   details,
            },
            { merge: true }
        );

                // ── 2. NOUVEAU — Archivage immuable dans historique_controles ──
        const kitSnap = await getDoc(doc(db, "emplacements", currentEmpId, "kits", currentKitId));
        const kitData = kitSnap.exists() ? kitSnap.data() : {};

        await addDoc(collection(db, "historique_controles"), {
            empId:               currentEmpId,
            kitId:               currentKitId,
            nom_du_kit:          kitData.nom_du_kit          || currentKitId,
            engin:               kitData.engin               || "",
            code_kit:            kitData.code_kit            || "",
            code_contenant:      kitData.code_contenant      || "",
            statut,
            verificateur_email:  auth.currentUser?.email     || "inconnu",
            timestamp:           now,
            detail_verification: details,
        });

        
        for (const iso in CAL.cache) {
            const idx = CAL.cache[iso].findIndex(
                k => k.kitId === currentKitId && k.empId === currentEmpId
            );
            if (idx !== -1) {
                delete CAL.cache[iso];
                break;
            }
        }
        if (CAL.selectedIso && CAL.cache[CAL.selectedIso]) {
            delete CAL.cache[CAL.selectedIso];
        }

        showToast(`✅ Statut « ${statut} » enregistré.`, 'success');
        setTimeout(() => {
            currentEmpId = '';
            currentKitId = '';
            afficherVue('calendrier');
            renderCalendrier();
        }, 1500);

    } catch (err) {
        showToast('Erreur d\'enregistrement : ' + err.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORIQUE
// ═══════════════════════════════════════════════════════════════════════════════

let histoData = [];

async function chargerHistorique() {
    histoList.innerHTML = '';
    histoLoading.classList.remove('hidden');
    histoEmpty.classList.add('hidden');

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
        histoData.sort((a, b) =>
            new Date(b.derniere_verification) - new Date(a.derniere_verification)
        );
        renderHistorique(histoData);

    } catch (err) {
        histoLoading.classList.add('hidden');
        histoEmpty.textContent = '⚠️ Erreur : ' + err.message;
        histoEmpty.classList.remove('hidden');
    }
}

function renderHistorique(liste) {
    histoLoading.classList.add('hidden');
    histoList.innerHTML = '';

    const filterVal = histoFilter?.value  || 'tous';
    const searchVal = (histoSearch?.value || '').trim().toUpperCase();

    const filtered = liste.filter(k => {
        const matchSearch = !searchVal ||
            k.empId.includes(searchVal) ||
            k.kitId.toUpperCase().includes(searchVal) ||
            (k.engin || '').toUpperCase().includes(searchVal);
        const matchFilter = filterVal === 'tous' || k.statut_conformite === filterVal;
        return matchSearch && matchFilter;
    });

    if (!filtered.length) {
        histoEmpty.classList.remove('hidden');
        histoEmpty.textContent = 'Aucun résultat trouvé.';
        return;
    }

    histoEmpty.classList.add('hidden');

    filtered.forEach(k => {
        const date = new Date(k.derniere_verification).toLocaleString('fr-FR', {
            day:'2-digit', month:'2-digit', year:'numeric',
            hour:'2-digit', minute:'2-digit'
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
        histoList.appendChild(row);
    });
}

histoSearch?.addEventListener('input',  () => renderHistorique(histoData));
histoFilter?.addEventListener('change', () => renderHistorique(histoData));

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — AUTH PIN
// ═══════════════════════════════════════════════════════════════════════════════

pinInputs.forEach((input, i) => {
    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 1);
        if (input.value && i < pinInputs.length - 1) pinInputs[i + 1].focus();
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !input.value && i > 0) pinInputs[i - 1].focus();
    });
});

$('btn-pin').addEventListener('click', () => {
    const saisi = [...pinInputs].map(i => i.value).join('');
    if (saisi === ADMIN_PIN) {
        adminAuth.classList.add('hidden');
        adminContent.classList.remove('hidden');
        adminContent.style.display = 'flex';
        pinError.textContent = '';
    } else {
        pinError.textContent = 'Code incorrect. Réessayez.';
        pinInputs.forEach(i => i.value = '');
        pinInputs[0].focus();
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — NAVIGATION ONGLETS
// ═══════════════════════════════════════════════════════════════════════════════

document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.add('hidden'));
        btn.classList.add('active');
        document.getElementById('admin-tab-' + btn.dataset.tab)?.classList.remove('hidden');
    });
});

// ─── TOGGLE MOT DE PASSE ──────────────────────────────────────────────────────
$('toggle-pwd').addEventListener('click', () => {
    const isPassword    = loginPwd.type === 'password';
    loginPwd.type       = isPassword ? 'text' : 'password';
    $('toggle-pwd').textContent = isPassword ? '🙈' : '👁';
});

document.querySelectorAll('.btn-toggle-pwd[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = $(btn.dataset.target);
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type       = isPassword ? 'text' : 'password';
        btn.textContent  = isPassword ? '🙈' : '👁';
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROFIL UTILISATEUR
// ═══════════════════════════════════════════════════════════════════════════════

function afficherProfil() {
    const user = auth.currentUser;
    if (!user) return;

    $('profil-initial').textContent = user.email.charAt(0).toUpperCase();
    $('profil-email').textContent   = user.email;
    $('profil-uid').textContent     = user.uid;

    const created = user.metadata.creationTime;
    $('profil-created').textContent = created
        ? new Date(created).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })
        : '—';

    const lastLogin = user.metadata.lastSignInTime;
    $('profil-last-login').textContent = lastLogin
        ? new Date(lastLogin).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : '—';

    ['pwd-current', 'pwd-new', 'pwd-confirm'].forEach(id => {
        const el = $(id);
        if (el) el.value = '';
    });
    $('pwd-change-error')?.classList.remove('visible');
    $('pwd-change-success')?.classList.remove('visible');
    $('pwd-strength-wrap')?.classList.remove('visible');
    if ($('pwd-strength-fill'))  $('pwd-strength-fill').className = 'pwd-strength-fill';
    if ($('pwd-strength-label')) $('pwd-strength-label').textContent = '';
}

$('pwd-new')?.addEventListener('input', () => {
    const val  = $('pwd-new').value;
    const wrap = $('pwd-strength-wrap');
    const fill = $('pwd-strength-fill');
    const lbl  = $('pwd-strength-label');

    if (!val) { wrap.classList.remove('visible'); return; }
    wrap.classList.add('visible');

    let score = 0;
    if (val.length >= 8)           score++;
    if (val.length >= 12)          score++;
    if (/[A-Z]/.test(val))         score++;
    if (/[0-9]/.test(val))         score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    const levels = [
        { label: 'Très faible', cls: 'strength-1' },
        { label: 'Faible',      cls: 'strength-2' },
        { label: 'Moyen',       cls: 'strength-3' },
        { label: 'Fort',        cls: 'strength-4' },
        { label: 'Très fort',   cls: 'strength-5' },
    ];
    const level    = levels[Math.min(score, 4)];
    fill.className = `pwd-strength-fill ${level.cls}`;
    lbl.textContent = level.label;
});

$('btn-change-pwd')?.addEventListener('click', async () => {
    const currentPwd = $('pwd-current').value;
    const newPwd     = $('pwd-new').value;
    const confirmPwd = $('pwd-confirm').value;
    const errEl      = $('pwd-change-error');
    const okEl       = $('pwd-change-success');

    errEl.classList.remove('visible');
    okEl.classList.remove('visible');

    if (!currentPwd || !newPwd || !confirmPwd)
        return afficherErreurPwd(errEl, 'Veuillez remplir tous les champs.');
    if (newPwd !== confirmPwd)
        return afficherErreurPwd(errEl, 'Les nouveaux mots de passe ne correspondent pas.');
    if (newPwd.length < 6)
        return afficherErreurPwd(errEl, 'Le nouveau mot de passe doit contenir au moins 6 caractères.');
    if (newPwd === currentPwd)
        return afficherErreurPwd(errEl, 'Le nouveau mot de passe doit être différent de l\'actuel.');

    const btn = $('btn-change-pwd');
    btn.disabled    = true;
    btn.textContent = 'Modification en cours…';

    try {
        const user       = auth.currentUser;
        const credential = EmailAuthProvider.credential(user.email, currentPwd);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPwd);

        ['pwd-current', 'pwd-new', 'pwd-confirm'].forEach(id => {
            const el = $(id); if (el) el.value = '';
        });
        $('pwd-strength-wrap').classList.remove('visible');
        okEl.textContent = '✅ Mot de passe modifié avec succès.';
        okEl.classList.add('visible');
        setTimeout(() => okEl.classList.remove('visible'), 5000);

    } catch (err) {
        const messages = {
            'auth/wrong-password':        'Mot de passe actuel incorrect.',
            'auth/invalid-credential':    'Mot de passe actuel incorrect.',
            'auth/weak-password':         'Nouveau mot de passe trop faible (minimum 6 caractères).',
            'auth/too-many-requests':     'Trop de tentatives. Veuillez réessayer plus tard.',
            'auth/requires-recent-login': 'Session expirée. Veuillez vous reconnecter.',
            'auth/network-request-failed':'Erreur réseau. Vérifiez votre connexion.',
        };
        afficherErreurPwd(errEl, messages[err.code] || `Erreur : ${err.message}`);
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Modifier le mot de passe →';
    }
});

function afficherErreurPwd(el, msg) {
    el.textContent = msg;
    el.classList.add('visible');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOASTS
// ═══════════════════════════════════════════════════════════════════════════════

function showConfirmToast(message) {
    return new Promise(resolve => {
        const existing = $('custom-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'custom-toast';
        toast.innerHTML = `
            <span class="toast-msg">${message}</span>
            <div class="toast-actions">
                <button class="toast-btn toast-cancel">Annuler</button>
                <button class="toast-btn toast-confirm">Confirmer</button>
            </div>
        `;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));

        const remove = val => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
            resolve(val);
        };
        toast.querySelector('.toast-cancel').addEventListener('click',  () => remove(false));
        toast.querySelector('.toast-confirm').addEventListener('click', () => remove(true));
    });
}

function showToast(message, type = 'info') {
    const existing = $('simple-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id        = 'simple-toast';
    toast.className = `simple-toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION APPLICATION
// ═══════════════════════════════════════════════════════════════════════════════

async function detectAppVersion() {
    try {
        const keys = await caches.keys();
        const key  = keys.find(k => k.startsWith('completconforme-'));
        if (!key) return;
        const version = key.replace('completconforme-', '');
        document.querySelectorAll('.app-version').forEach(el => el.textContent = version);
    } catch {}
}
detectAppVersion();

// ═══════════════════════════════════════════════════════════════════════════════
// GITHUB CONFIG — TOKEN + EMPLACEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

function initGithubConfig() {
    const GITHUB_OWNER      = "methodelogistiquesncf-boop";
    const GITHUB_REPO       = "completconforme";
    const EXPECTED_FILENAME = "emplacements_autorises.txt";
    const API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;

    const tokenInput   = document.getElementById("github-token-input");
    const btnSaveToken = document.getElementById("btn-save-token");
    const tokenStatus  = document.getElementById("token-status");
    const dropZoneEmp  = document.getElementById("drop-zone-emp");
    const fileInputEmp = document.getElementById("file-input-emp");
    const progAreaEmp  = document.getElementById("progress-area-emp");
    const progBarEmp   = document.getElementById("progress-bar-emp");
    const progLabelEmp = document.getElementById("progress-label-emp");
    const statusEmp    = document.getElementById("admin-status-emp");
    const previewWrap  = document.getElementById("emp-preview-wrap");
    const previewList  = document.getElementById("emp-preview-list");
    const previewCount = document.getElementById("emp-preview-count");

    if (!tokenInput || !dropZoneEmp) return;

    function setTokenStatus(msg, type = "info") {
        tokenStatus.textContent = msg;
        tokenStatus.className   = `admin-status ${type}`;
    }
    function setStatusEmp(msg, type = "info") {
        statusEmp.textContent = msg;
        statusEmp.className   = `admin-status ${type}`;
    }
    function setProgressEmp(pct, label) {
        progBarEmp.style.width   = pct + "%";
        progLabelEmp.textContent = label;
    }
    function afficherApercu(lignes) {
        previewList.innerHTML = "";
        lignes.forEach(id => {
            const badge = document.createElement("span");
            badge.textContent = id;
            badge.style.cssText = `
                font-family: var(--mono); font-size: .72rem; font-weight: 700;
                background: var(--accent-soft); color: var(--accent);
                border: 1px solid rgba(192,53,74,.18); border-radius: 6px;
                padding: .2rem .55rem; white-space: nowrap; letter-spacing: .04em;
            `;
            previewList.appendChild(badge);
        });
        previewCount.textContent =
            `${lignes.length} emplacement${lignes.length > 1 ? "s" : ""} envoyé${lignes.length > 1 ? "s" : ""}`;
        previewWrap.classList.remove("hidden");
    }

    async function chargerEtatToken() {
        try {
            const snap = await getDoc(doc(db, FIRESTORE_SECRET.col, FIRESTORE_SECRET.doc));
            if (snap.exists() && snap.data()[FIRESTORE_SECRET.field]) {
                setTokenStatus("✅ Token GitHub configuré.", "success");
                tokenInput.placeholder = "ghp_•••••••••• (déjà enregistré)";
            }
        } catch {}
    }
    chargerEtatToken();

    btnSaveToken.addEventListener("click", async () => {
        const val = tokenInput.value.trim();
        if (!val) { setTokenStatus("❌ Veuillez saisir un token.", "error"); return; }
        if (!val.startsWith("ghp_") && !val.startsWith("github_pat_")) {
            setTokenStatus("⚠️ Format inattendu. Un PAT GitHub commence par ghp_ ou github_pat_.", "error");
            return;
        }
        btnSaveToken.disabled    = true;
        btnSaveToken.textContent = "Enregistrement…";
        setTokenStatus("⏳ Enregistrement dans Firestore…", "info");
        try {
            await setDoc(
                doc(db, FIRESTORE_SECRET.col, FIRESTORE_SECRET.doc),
                {
                    [FIRESTORE_SECRET.field]: val,
                    token_mis_a_jour_le:      new Date().toISOString(),
                    token_mis_a_jour_par:     auth.currentUser?.email || "inconnu",
                },
                { merge: true }
            );
            tokenInput.value       = "";
            tokenInput.placeholder = "ghp_•••••••••• (déjà enregistré)";
            setTokenStatus("✅ Token enregistré dans Firestore avec succès.", "success");
        } catch (err) {
            setTokenStatus("❌ Erreur : " + err.message, "error");
        } finally {
            btnSaveToken.disabled    = false;
            btnSaveToken.textContent = "Enregistrer le token →";
        }
    });

    dropZoneEmp.addEventListener("dragover",  e => { e.preventDefault(); dropZoneEmp.classList.add("dragover"); });
    dropZoneEmp.addEventListener("dragleave", ()  => dropZoneEmp.classList.remove("dragover"));
    dropZoneEmp.addEventListener("drop", e => {
        e.preventDefault();
        dropZoneEmp.classList.remove("dragover");
        const file = e.dataTransfer?.files?.[0];
        if (file) traiterFichierEmp(file);
    });
    fileInputEmp.addEventListener("change", e => {
        const file = e.target.files?.[0];
        if (file) traiterFichierEmp(file);
        e.target.value = "";
    });

    async function traiterFichierEmp(file) {
        if (file.name !== EXPECTED_FILENAME) {
            setStatusEmp(`❌ Nom invalide : « ${file.name} ». Le fichier doit s'appeler exactement « ${EXPECTED_FILENAME} ».`, "error");
            return;
        }
        previewWrap.classList.add("hidden");
        progAreaEmp.classList.remove("hidden");
        setProgressEmp(5, "Lecture du fichier…");
        setStatusEmp("⏳ Lecture du fichier…", "info");
        try {
            const text   = await file.text();
            const lignes = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith("#"));
            if (!lignes.length) {
                setStatusEmp("❌ Le fichier est vide ou ne contient aucun identifiant valide.", "error");
                progAreaEmp.classList.add("hidden");
                return;
            }
            setProgressEmp(20, "Récupération du token…");
            const token = await lireToken();
            setProgressEmp(40, "Récupération du SHA actuel…");
            setStatusEmp("⏳ Connexion à GitHub…", "info");
            let sha = null;
            const getResp = await fetch(`${API_BASE}/${EXPECTED_FILENAME}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                }
            });
            if (getResp.ok) {
                sha = (await getResp.json()).sha;
            } else if (getResp.status !== 404) {
                throw new Error(`GitHub GET : ${(await getResp.json()).message}`);
            }
            setProgressEmp(65, "Envoi vers le dépôt…");
            setStatusEmp("⏳ Push vers GitHub…", "info");
            const base64Content = btoa(unescape(encodeURIComponent(text)));
            const putResp = await fetch(`${API_BASE}/${EXPECTED_FILENAME}`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    message: `[Admin] MAJ emplacements_autorises.txt`,
                    content: base64Content,
                    ...(sha ? { sha } : {}),
                }),
            });
            if (!putResp.ok) throw new Error(`GitHub PUT : ${(await putResp.json()).message}`);
            const result    = await putResp.json();
            const commitSha = result.commit?.sha?.slice(0, 7) || "ok";
            const commitUrl = result.commit?.html_url || "#";
            setProgressEmp(100, "Terminé.");
            statusEmp.className = "admin-status success";
            statusEmp.innerHTML =
                `✅ ${lignes.length} emplacement(s) envoyé(s) · Commit : ` +
                `<a href="${commitUrl}" target="_blank" rel="noopener"
                    style="color:var(--green);font-family:var(--mono);font-size:.8rem;">
                    ${commitSha} ↗
                </a>`;
            afficherApercu(lignes);
            await chargerListeEmplacementsAutorises();
        } catch (err) {
            console.error("[PushEmp]", err);
            setStatusEmp("❌ " + err.message, "error");
            progAreaEmp.classList.add("hidden");
        }
    }
}

initGithubConfig();

chargerListeEmplacementsAutorises();
document.getElementById("btn-refresh-emp")?.addEventListener("click", chargerListeEmplacementsAutorises);

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT EXCEL → GitHub + suivi pipeline Actions
// ═══════════════════════════════════════════════════════════════════════════════

function initImportGithubXls() {
    const GITHUB_OWNER     = "methodelogistiquesncf-boop";
    const GITHUB_REPO      = "completconforme";
    const TARGET_FOLDER    = "imports/pending";
    const ACCEPTED_EXT     = ["xlsx", "xls", "csv"];
    const API_BASE         = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;
    const API_ACTIONS      = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions`;
    const POLL_INTERVAL_MS = 4000;
    const POLL_TIMEOUT_MS  = 300000;

    const dropZoneXls     = document.getElementById("drop-zone-xls");
    const fileInputXls    = document.getElementById("file-input-xls");
    const progAreaXls     = document.getElementById("progress-area-xls");
    const progBarXls      = document.getElementById("progress-bar-xls");
    const progLabelXls    = document.getElementById("progress-label-xls");
    const statusXls       = document.getElementById("admin-status-xls");
    const workflowPanel   = document.getElementById("workflow-panel");
    const workflowLink    = document.getElementById("workflow-link");
    const workflowSpinner = document.getElementById("workflow-spinner");
    const workflowRunLbl  = document.getElementById("workflow-run-label");
    const workflowRunSt   = document.getElementById("workflow-run-status");
    const workflowSteps   = document.getElementById("workflow-steps");
    const workflowDur     = document.getElementById("workflow-duration");

    if (!dropZoneXls || !fileInputXls) {
        console.warn("[XLS] drop-zone-xls ou file-input-xls introuvable");
        return;
    }

    // Clic sur la drop zone → ouvre le sélecteur de fichier
    dropZoneXls.addEventListener("click", () => fileInputXls.click());

    // ── Helpers ───────────────────────────────────────────────────────────────
    function setStatusXls(msg, type = "info") {
        statusXls.textContent = msg;
        statusXls.className   = `admin-status ${type}`;
    }
    function setProgress(pct, label) {
        progBarXls.style.width   = pct + "%";
        progLabelXls.textContent = label;
    }
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function githubHeaders(token) {
        return {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        };
    }
    function formatDuration(start, end) {
        const secs = Math.round((new Date(end) - new Date(start)) / 1000);
        return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}min ${secs % 60}s`;
    }
    function iconRun(status, conclusion) {
        if (status === "queued")      return { icon: "⏳", label: "En file d'attente…",             color: "var(--muted)" };
        if (status === "in_progress") return { icon: "🔄", label: "Pipeline en cours…",             color: "var(--blue)"  };
        if (status === "completed") {
            if (conclusion === "success")   return { icon: "✅", label: "Pipeline terminé avec succès !", color: "var(--green)" };
            if (conclusion === "failure")   return { icon: "❌", label: "Pipeline échoué.",                color: "var(--red)"   };
            if (conclusion === "cancelled") return { icon: "🚫", label: "Pipeline annulé.",                color: "var(--muted)" };
        }
        return { icon: "⏳", label: "Démarrage…", color: "var(--muted)" };
    }
    function renderRunStatus(status, conclusion) {
        const { icon, label, color } = iconRun(status, conclusion);
        workflowSpinner.style.display = status !== "completed" ? "block" : "none";
        workflowRunLbl.textContent    = `${icon} ${label}`;
        workflowRunLbl.style.color    = color;
        if (status === "completed") {
            workflowRunSt.style.borderColor = conclusion === "success"
                ? "rgba(63,168,118,.45)" : "rgba(192,53,74,.35)";
            workflowRunSt.style.background  = conclusion === "success"
                ? "rgba(63,168,118,.05)" : "rgba(192,53,74,.05)";
        }
    }

    function resolveBusinessSteps(githubSteps, runConclusion, kitCount) {
        function groupState(matches) {
            const relevant = githubSteps.filter(s =>
                matches.some(m => s.name.toLowerCase().includes(m.toLowerCase()))
            );
            if (!relevant.length)                                                    return { status: "queued",     conclusion: null };
            if (relevant.some(s => s.conclusion === "failure"))                      return { status: "completed",  conclusion: "failure" };
            if (relevant.every(s => s.conclusion === "success" || s.conclusion === "skipped")) return { status: "completed", conclusion: "success" };
            if (relevant.some(s => s.status === "in_progress"))                      return { status: "in_progress", conclusion: null };
            return { status: "queued", conclusion: null };
        }

        const s1 = { icon: "📥", label: "Fichier importé avec succès",          status: "completed",  conclusion: "success" };
        const s2 = { icon: "⚙️", label: "Traitement du fichier",                 ...groupState(["checkout", "python", "instal", "identifier", "vérif", "detect"]) };
        const s3 = { icon: "🔥", label: "Exportation dans la base de données",   ...groupState(["importer", "firestore", "injection"]) };

        const resultLabel = kitCount !== null
            ? `${kitCount} kit${kitCount > 1 ? "s" : ""} importé${kitCount > 1 ? "s" : ""} avec succès`
            : "Finalisation de l'import";

        let s4State;
        if (runConclusion === "success") {
            s4State = { status: "completed", conclusion: "success" };
        } else if (s2.conclusion === "failure" || s3.conclusion === "failure") {
            s4State = { status: "queued", conclusion: null };
        } else {
            s4State = groupState(["archiver", "télécharger", "nettoy", "archiv"]);
            if (s4State.status === "queued" && s3.conclusion === "success") {
                s4State = { status: "in_progress", conclusion: null };
            }
        }

        return [s1, s2, s3, { icon: "📦", label: resultLabel, ...s4State }];
    }

    function renderBusinessSteps(githubSteps, runConclusion = null, kitCount = null) {
        workflowSteps.innerHTML = "";
        const steps = resolveBusinessSteps(githubSteps, runConclusion, kitCount);

        steps.forEach(step => {
            let displayIcon, color, rightEl;
            switch (true) {
                case step.conclusion === "success":
                    displayIcon = "✅"; color = "var(--green)";
                    rightEl = `<span style="font-family:var(--mono);font-size:.68rem;color:var(--muted);">succès</span>`;
                    break;
                case step.conclusion === "failure":
                    displayIcon = "❌"; color = "var(--red)";
                    rightEl = `<span style="font-family:var(--mono);font-size:.68rem;color:var(--muted);">échec</span>`;
                    break;
                case step.status === "in_progress":
                    displayIcon = step.icon; color = "var(--blue)";
                    rightEl = `<div class="spinner" style="width:14px;height:14px;border-width:2px;flex-shrink:0;"></div>`;
                    break;
                default:
                    displayIcon = step.icon; color = "var(--muted)";
                    rightEl = `<span style="font-family:var(--mono);font-size:.68rem;color:var(--muted);">en attente</span>`;
            }

            const borderColor = step.conclusion === "success"    ? "rgba(63,168,118,.4)"
                               : step.conclusion === "failure"    ? "rgba(192,53,74,.4)"
                               : step.status    === "in_progress" ? "var(--blue)"
                               : "var(--border)";

            const row = document.createElement("div");
            row.style.cssText = `
                display:flex;align-items:center;gap:.7rem;padding:.7rem .9rem;
                background:var(--input-bg);border:1.5px solid ${borderColor};
                border-radius:var(--radius);transition:border-color .2s;
            `;
            row.innerHTML = `
                <span style="font-size:1.05rem;flex-shrink:0;min-width:1.3rem;text-align:center;">${displayIcon}</span>
                <span style="font-size:.84rem;font-weight:600;color:${color};flex:1;line-height:1.35;">${step.label}</span>
                ${rightEl}
            `;
            workflowSteps.appendChild(row);
        });
    }

    async function fetchKitCount(jobId, token) {
        try {
            const res = await fetch(
                `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/jobs/${jobId}/logs`,
                { headers: githubHeaders(token), redirect: "follow" }
            );
            if (!res.ok) return null;
            const log = await res.text();
            const m = log.match(/(\d+)\s+kit[s(]*\s*[\w\s]*trait/)
                   || log.match(/(\d+)\s+kit[s]?\s+import/i)
                   || log.match(/kit[s]?\s+traité[s]?\s*:\s*(\d+)/i)
                   || log.match(/(\d[\s\d]*)\s+kit/i);
            if (!m) return null;
            const n = parseInt(m[1].replace(/\s/g, ""), 10);
            return isNaN(n) ? null : n;
        } catch { return null; }
    }

    async function pollRunJobs(runId, initialRun, token, deadline) {
        let run   = initialRun;
        let jobId = null;

        while (Date.now() < deadline) {
            try {
                const jobsRes = await fetch(`${API_ACTIONS}/runs/${runId}/jobs`, { headers: githubHeaders(token) });
                if (jobsRes.ok) {
                    const job = (await jobsRes.json()).jobs?.[0];
                    if (job) { jobId = job.id; renderBusinessSteps(job.steps || [], run.conclusion); }
                }
            } catch {}

            renderRunStatus(run.status, run.conclusion);

            if (run.status === "completed") {
                workflowSpinner.style.display = "none";
                if (run.created_at && run.updated_at) {
                    workflowDur.textContent   = `⏱ Durée totale : ${formatDuration(run.created_at, run.updated_at)}`;
                    workflowDur.style.display = "block";
                }
                if (jobId) {
                    const kitCount = await fetchKitCount(jobId, token);
                    try {
                        const jobsRes2 = await fetch(`${API_ACTIONS}/runs/${runId}/jobs`, { headers: githubHeaders(token) });
                        const job2 = jobsRes2.ok ? (await jobsRes2.json()).jobs?.[0] : null;
                        renderBusinessSteps(job2?.steps || [], run.conclusion, kitCount);
                    } catch { renderBusinessSteps([], run.conclusion, kitCount); }
                }
                return;
            }

            await sleep(POLL_INTERVAL_MS);

            try {
                const runRes = await fetch(`${API_ACTIONS}/runs/${runId}`, { headers: githubHeaders(token) });
                if (runRes.ok) run = await runRes.json();
            } catch {}
        }
    }

    async function pollWorkflow(commitSha, token) {
        workflowPanel.classList.remove("hidden");
        renderRunStatus("queued", null);
        renderBusinessSteps([]);

        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
            await sleep(POLL_INTERVAL_MS);
            try {
                const res = await fetch(
                    `${API_ACTIONS}/runs?head_sha=${commitSha}&per_page=10`,
                    { headers: githubHeaders(token) }
                );
                if (!res.ok) continue;
                const data = await res.json();
                const run  = data.workflow_runs?.find(r =>
                    !r.name?.toLowerCase().includes("pages") &&
                    !r.path?.toLowerCase().includes("pages")
                ) ?? data.workflow_runs?.[0];

                if (!run) continue;
                workflowLink.href          = run.html_url;
                workflowLink.style.display = "inline";
                renderRunStatus(run.status, run.conclusion);
                await pollRunJobs(run.id, run, token, deadline);
                return;
            } catch {}
        }

        workflowRunLbl.textContent    = "⚠️ Délai dépassé — vérifiez GitHub Actions.";
        workflowRunLbl.style.color    = "var(--amber)";
        workflowSpinner.style.display = "none";
    }

    // ── Drag & drop ───────────────────────────────────────────────────────────
    dropZoneXls.addEventListener("dragover",  e => { e.preventDefault(); dropZoneXls.classList.add("dragover"); });
    dropZoneXls.addEventListener("dragleave", ()  => dropZoneXls.classList.remove("dragover"));
    dropZoneXls.addEventListener("drop", e => {
        e.preventDefault();
        dropZoneXls.classList.remove("dragover");
        const file = e.dataTransfer?.files?.[0];
        if (file) traiterFichierXls(file);
    });

    // ── Sélection via input file ──────────────────────────────────────────────
    fileInputXls.addEventListener("change", e => {
        const file = e.target.files?.[0];
        if (file) traiterFichierXls(file);
        e.target.value = "";
    });

    // ── Traitement du fichier ─────────────────────────────────────────────────
    async function traiterFichierXls(file) {
        const ext = file.name.split(".").pop().toLowerCase();
        if (!ACCEPTED_EXT.includes(ext)) {
            setStatusXls(`❌ Format invalide : « .${ext} ». Utilisez .xlsx, .xls ou .csv.`, "error");
            return;
        }

        workflowPanel.classList.add("hidden");
        workflowSteps.innerHTML    = "";
        workflowLink.style.display = "none";
        workflowDur.style.display  = "none";
        progAreaXls.classList.remove("hidden");
        setProgress(5, "Lecture du fichier…");
        setStatusXls("⏳ Lecture du fichier…", "info");

        try {
            const buffer = await file.arrayBuffer();
            const uint8  = new Uint8Array(buffer);
            const base64 = btoa(uint8.reduce((d, b) => d + String.fromCharCode(b), ""));

            setProgress(20, "Récupération du token…");
            const token = await lireToken();

            const targetPath = `${TARGET_FOLDER}/${file.name}`;
            setProgress(40, "Vérification du fichier existant…");
            setStatusXls("⏳ Connexion à GitHub…", "info");

            let sha = null;
            const getResp = await fetch(`${API_BASE}/${targetPath}`, { headers: githubHeaders(token) });
            if (getResp.ok) {
                sha = (await getResp.json()).sha;
            } else if (getResp.status !== 404) {
                throw new Error(`GitHub GET : ${(await getResp.json()).message}`);
            }

            setProgress(65, "Envoi vers le dépôt…");
            setStatusXls("⏳ Push vers GitHub…", "info");

            const putResp = await fetch(`${API_BASE}/${targetPath}`, {
                method: "PUT",
                headers: { ...githubHeaders(token), "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: `[Admin] Import ${file.name} → ${TARGET_FOLDER}`,
                    content: base64,
                    ...(sha ? { sha } : {}),
                }),
            });
            if (!putResp.ok) throw new Error(`GitHub PUT : ${(await putResp.json()).message}`);

            const result    = await putResp.json();
            const commitSha = result.commit?.sha;
            const commitUrl = result.commit?.html_url || "#";
            const shortSha  = commitSha?.slice(0, 7) || "ok";

            setProgress(100, "Fichier envoyé — pipeline en attente…");
            statusXls.className = "admin-status success";
            statusXls.innerHTML =
                `✅ « ${file.name} » envoyé dans ` +
                `<code style="font-family:var(--mono);font-size:.8rem;">${TARGET_FOLDER}/</code>` +
                ` · Commit : ` +
                `<a href="${commitUrl}" target="_blank" rel="noopener"
                    style="color:var(--green);font-family:var(--mono);font-size:.8rem;">
                    ${shortSha} ↗
                </a>`;

            if (commitSha) await pollWorkflow(commitSha, token);

        } catch (err) {
            console.error("[XLS] Erreur:", err);
            setStatusXls("❌ " + err.message, "error");
            progAreaXls.classList.add("hidden");
            showToast("❌ " + err.message, "error");
        }
    }
}

initImportGithubXls();

// ═══════════════════════════════════════════════════════════════════════════════
// CHARGEMENT EMPLACEMENTS AUTORISÉS
// ═══════════════════════════════════════════════════════════════════════════════

async function chargerListeEmplacementsAutorises() {
    const GITHUB_OWNER = "methodelogistiquesncf-boop";
    const GITHUB_REPO  = "completconforme";
    const FILENAME     = "emplacements_autorises.txt";
    const API_URL      = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILENAME}`;

    const listWrap  = document.getElementById("emp-current-wrap");
    const listEl    = document.getElementById("emp-current-list");
    const countEl   = document.getElementById("emp-current-count");
    const loadingEl = document.getElementById("emp-current-loading");
    const errorEl   = document.getElementById("emp-current-error");

    if (!listWrap) return;

    loadingEl.classList.remove("hidden");
    errorEl.classList.add("hidden");
    listWrap.classList.add("hidden");

    try {
        const token = await lireToken();
        const res = await fetch(API_URL, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            }
        });
        if (!res.ok) throw new Error(`GitHub GET : ${(await res.json()).message}`);
        const data   = await res.json();
        const text   = atob(data.content.replace(/\n/g, ""));
        const lignes = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));

        loadingEl.classList.add("hidden");
        listEl.innerHTML = "";
        lignes.forEach(id => {
            const badge = document.createElement("span");
            badge.textContent = id;
            badge.style.cssText = `
                font-family: var(--mono); font-size: .72rem; font-weight: 700;
                background: var(--input-bg); color: var(--text);
                border: 1px solid var(--border); border-radius: 6px;
                padding: .2rem .55rem; white-space: nowrap; letter-spacing: .04em;
                cursor: default;
            `;
            listEl.appendChild(badge);
        });
        countEl.textContent = `${lignes.length} emplacement${lignes.length > 1 ? "s" : ""} autorisé${lignes.length > 1 ? "s" : ""}`;
        listWrap.classList.remove("hidden");
    } catch (err) {
        loadingEl.classList.add("hidden");
        errorEl.textContent = "⚠️ " + err.message;
        errorEl.classList.remove("hidden");
    }
}
// ═══════════════════════════════════════════════════════════════════════════════
// STATISTIQUES
// ═══════════════════════════════════════════════════════════════════════════════

async function chargerStatistiques() {
    const loading = $('stats-loading');
    const content = $('stats-content');
    loading.classList.remove('hidden');
    content.classList.add('hidden');

    try {
        const snap = await getDocs(collection(db, "historique_controles"));
        const entries = [];
        snap.forEach(d => entries.push({ id: d.id, ...d.data() }));
        entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        renderStatsKPI(entries);
        renderEvolution(entries);
        renderTopComposants(entries);
        renderParEngin(entries);

        loading.classList.add('hidden');
        content.classList.remove('hidden');
    } catch (err) {
        loading.classList.add('hidden');
        showToast('⚠️ ' + err.message, 'error');
    }
}

// ── KPI ───────────────────────────────────────────────────────────────────────
function renderStatsKPI(entries) {
    const total      = entries.length;
    const conformes  = entries.filter(e => e.statut === 'Conforme').length;
    const incomplets = entries.filter(e => e.statut === 'Incomplet').length;
    const taux       = total ? Math.round(conformes / total * 100) : null;

    const now = new Date();
    const dow = now.getDay() || 7;
    const lundi = new Date(now);
    lundi.setDate(now.getDate() - dow + 1);
    lundi.setHours(0, 0, 0, 0);
    const semaine = entries.filter(e => new Date(e.timestamp) >= lundi).length;

    $('kpi-total').textContent      = total;
    $('kpi-taux').textContent       = taux !== null ? taux + '%' : '—';
    $('kpi-incomplets').textContent = incomplets;
    $('kpi-semaine').textContent    = semaine;

    const tauxCard = $('kpi-taux-card');
    if (tauxCard && taux !== null) {
        tauxCard.className = 'stats-kpi-card '
            + (taux >= 80 ? 'stats-kpi-green' : taux >= 50 ? 'stats-kpi-amber' : 'stats-kpi-red');
    }
}

// ── ÉVOLUTION ─────────────────────────────────────────────────────────────────
function getWeekBounds(weeksAgo) {
    const now = new Date();
    const dow = now.getDay() || 7;
    const lun = new Date(now);
    lun.setDate(now.getDate() - dow + 1 - weeksAgo * 7);
    lun.setHours(0, 0, 0, 0);
    const fin = new Date(lun);
    fin.setDate(lun.getDate() + 7);
    return { start: lun, end: fin };
}

function numSemaine(d) {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
}

function renderEvolution(entries) {
    const el = $('chart-evolution');
    if (!el) return;

    const weeks = [];
    for (let i = 7; i >= 0; i--) {
        const { start, end } = getWeekBounds(i);
        const w = entries.filter(e => {
            const t = new Date(e.timestamp);
            return t >= start && t < end;
        });
        weeks.push({
            label:     `S${String(numSemaine(start)).padStart(2, '0')}`,
            total:     w.length,
            conformes:  w.filter(e => e.statut === 'Conforme').length,
            incomplets: w.filter(e => e.statut === 'Incomplet').length,
        });
    }

    const maxVal = Math.max(...weeks.map(w => w.total), 1);

    el.innerHTML = `
        <div class="evo-chart">
            ${weeks.map(w => `
                <div class="evo-col">
                    <div class="evo-bars">
                        <div class="evo-bar evo-bar-ko"
                             style="height:${w.incomplets / maxVal * 100}%"
                             title="${w.incomplets} non conforme(s)"></div>
                        <div class="evo-bar evo-bar-ok"
                             style="height:${w.conformes / maxVal * 100}%"
                             title="${w.conformes} conforme(s)"></div>
                    </div>
                    <div class="evo-total">${w.total || ''}</div>
                    <div class="evo-label">${w.label}</div>
                </div>
            `).join('')}
        </div>
        <div class="evo-legend">
            <span class="evo-legend-item">
                <span class="evo-dot" style="background:var(--green);"></span> Conforme
            </span>
            <span class="evo-legend-item">
                <span class="evo-dot" style="background:var(--accent);"></span> Non conforme
            </span>
        </div>
    `;
}

// ── TOP COMPOSANTS ────────────────────────────────────────────────────────────
function renderTopComposants(entries) {
    const el = $('stats-top-composants');
    if (!el) return;

    const compteur = {};
    entries
        .filter(e => e.statut === 'Incomplet')
        .forEach(e => {
            (e.detail_verification || []).forEach(c => {
                if (c.quantite_comptee !== null && c.quantite_comptee !== c.quantite_requise) {
                    compteur[c.nom] = (compteur[c.nom] || 0) + 1;
                }
            });
        });

    const sorted = Object.entries(compteur).sort((a, b) => b[1] - a[1]).slice(0, 8);

    if (!sorted.length) {
        el.innerHTML = `<p class="stats-empty">Aucun composant manquant enregistré.</p>`;
        return;
    }

    const max = sorted[0][1];
    el.innerHTML = sorted.map(([nom, count], i) => `
        <div class="comp-stat-row">
            <span class="comp-stat-rank">${i + 1}</span>
            <div class="comp-stat-info">
                <div class="comp-stat-header">
                    <span class="comp-stat-nom">${nom}</span>
                    <span class="comp-stat-count">${count}×</span>
                </div>
                <div class="comp-stat-bar-wrap">
                    <div class="comp-stat-bar" style="width:${count / max * 100}%"></div>
                </div>
            </div>
        </div>
    `).join('');
}

// ── PAR ENGIN ─────────────────────────────────────────────────────────────────
function renderParEngin(entries) {
    const el = $('stats-par-engin');
    if (!el) return;

    const map = {};
    entries.forEach(e => {
        const engin = e.engin || '—';
        if (!map[engin]) map[engin] = { total: 0, conformes: 0 };
        map[engin].total++;
        if (e.statut === 'Conforme') map[engin].conformes++;
    });

    const rows = Object.entries(map)
        .map(([engin, s]) => ({ engin, ...s, taux: Math.round(s.conformes / s.total * 100) }))
        .sort((a, b) => b.total - a.total);

    if (!rows.length) {
        el.innerHTML = `<p class="stats-empty">Aucune donnée disponible.</p>`;
        return;
    }

    el.innerHTML = rows.map(r => {
        const color = r.taux >= 80 ? 'var(--green)' : r.taux >= 50 ? 'var(--amber)' : 'var(--accent)';
        return `
            <div class="engin-stat-row">
                <div class="engin-stat-left">
                    <span class="engin-stat-badge">${r.engin}</span>
                    <span class="engin-stat-detail">
                        ${r.total} contrôle${r.total > 1 ? 's' : ''}
                        · ${r.conformes} conforme${r.conformes > 1 ? 's' : ''}
                    </span>
                </div>
                <div class="engin-stat-right">
                    <div class="engin-stat-bar-wrap">
                        <div class="engin-stat-bar"
                             style="width:${r.taux}%; background:${color};"></div>
                    </div>
                    <span class="engin-stat-taux" style="color:${color};">${r.taux}%</span>
                </div>
            </div>
        `;
    }).join('');
}
