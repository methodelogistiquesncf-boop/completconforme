// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS Firebase
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    doc, setDoc, getDoc, getDocs,
    collection
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

// Persistance offline — initializeFirestore ne peut pas être appelé dans un
// import dynamique ; on l'appelle directement avec un fallback getFirestore.
let db;
try {
    db = initializeFirestore(app, { localCache: persistentLocalCache() });
} catch (err) {
    console.warn("[Offline] Persistance indisponible :", err.message);
    db = getFirestore(app);
}

const ADMIN_PIN = "1234";

// ─── ÉTAT GLOBAL ─────────────────────────────────────────────────────────────
let currentEmpId = "";
let currentKitId = "";

// ─── REFS DOM ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// Auth
const loginPage  = $('login-page');
const appEl      = $('app');
const loginEmail = $('login-email');
const loginPwd   = $('login-pwd');
const btnLogin   = $('btn-login');
const loginError = $('login-error');
const btnLogout  = $('btn-logout');

// Onglets
const tabTerrain    = $('tab-terrain');
const tabAdmin      = $('tab-admin');
const tabHistorique = $('tab-historique');
const tabProfil     = $('tab-profil');
const secTerrain    = $('sec-terrain');
const secAdmin      = $('sec-admin');
const secHistorique = $('sec-historique');
const secProfil     = $('sec-profil');

const offlineBanner = $('offline-banner');

// Vues terrain
const viewListe  = $('view-liste');
const viewKits   = $('view-kits');
const viewDetail = $('view-detail');

// Vue liste niveau 1
const inputEmp     = $('input-emplacement');
const btnVerifier  = $('btn-verifier');
const searchStatus = $('search-status');
const listeLoading = $('liste-loading');
const listeVide    = $('liste-vide');
const listeKits    = $('liste-kits');

// Vue kits niveau 2
const btnRetourListe = $('btn-retour-liste');
const kitsEmpTitle   = $('kits-emp-title');
const kitsEmpLoading = $('kits-emp-loading');
const kitsEmpVide    = $('kits-emp-vide');
const kitsEmpList    = $('kits-emp-list');

// Vue détail niveau 3
const btnRetourKits     = $('btn-retour-kits');
const detailEmpBadge    = $('detail-emp-badge');
const detailKitBadge    = $('detail-kit-badge');
const detailNom         = $('detail-nom');
const detailEmp         = $('detail-emp');
const detailEngin       = $('detail-engin');
const detailLoadingCard = $('detail-loading-card');
const detailKitCard     = $('detail-kit-card');
const compList          = $('comp-list');

// Admin
const pinInputs    = document.querySelectorAll('.pin-input');
const pinError     = $('pin-error');
const adminAuth    = $('admin-auth');
const adminContent = $('admin-content');


// Historique
const histoList    = $('histo-list');
const histoLoading = $('histo-loading');
const histoEmpty   = $('histo-empty');
const histoSearch  = $('histo-search');
const histoFilter  = $('histo-filter');

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

    secTerrain.classList.toggle('hidden',    tab !== 'terrain');
    secAdmin.classList.toggle('hidden',      tab !== 'admin');
    secHistorique.classList.toggle('hidden', tab !== 'historique');
    secProfil.classList.toggle('hidden',     tab !== 'profil');

    if (tab === 'historique') chargerHistorique();
    if (tab === 'terrain')   { afficherVue('liste'); chargerListeKits(); }
    if (tab === 'profil')    afficherProfil();
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION VUES TERRAIN (3 niveaux)
// ═══════════════════════════════════════════════════════════════════════════════

function afficherVue(vue) {
    viewListe.classList.toggle('hidden',  vue !== 'liste');
    viewKits.classList.toggle('hidden',   vue !== 'kits');
    viewDetail.classList.toggle('hidden', vue !== 'detail');
}

btnRetourListe?.addEventListener('click', () => {
    afficherVue('liste');
    chargerListeKits();
});

btnRetourKits?.addEventListener('click', () => {
    afficherVue('kits');
    chargerKitsEmplacement(currentEmpId);
});

// ═══════════════════════════════════════════════════════════════════════════════
// NIVEAU 1 — LISTE GLOBALE DES KITS NON CONFORMES
// ═══════════════════════════════════════════════════════════════════════════════

let tousLesKits = [];

async function chargerListeKits() {
    listeLoading.classList.remove('hidden');
    listeVide.classList.add('hidden');
    listeKits.innerHTML      = '';
    searchStatus.textContent = '';

    try {
        const empSnap = await getDocs(collection(db, "emplacements"));
        tousLesKits   = [];

        const promises = empSnap.docs.map(async empDoc => {
            const empId    = empDoc.id;
            const kitsSnap = await getDocs(collection(db, "emplacements", empId, "kits"));
            kitsSnap.forEach(kitDoc => {
                const data = kitDoc.data();
                if (data.statut_conformite !== "Conforme") {
                    tousLesKits.push({
                        empId,
                        kitId:             kitDoc.id,
                        statut_conformite: data.statut_conformite || "Non vérifié",
                        nom_du_kit:        data.nom_du_kit        || kitDoc.id,
                        engin:             data.engin             || "",
                        code_kit:          data.code_kit          || "",
                    });
                }
            });
        });

        await Promise.all(promises);

        tousLesKits.sort((a, b) => {
            const ordre = { "Incomplet": 0, "Non vérifié": 1 };
            const oa = ordre[a.statut_conformite] ?? 2;
            const ob = ordre[b.statut_conformite] ?? 2;
            if (oa !== ob) return oa - ob;
            return a.empId.localeCompare(b.empId);
        });

        renderListeKits(tousLesKits);

    } catch (err) {
        listeLoading.classList.add('hidden');
        searchStatus.textContent = '⚠️ Erreur : ' + err.message;
    }
}

function renderListeKits(liste) {
    listeLoading.classList.add('hidden');
    listeKits.innerHTML = '';

    const searchVal = (inputEmp?.value || '').trim().toUpperCase();
    const filtered  = searchVal
        ? liste.filter(k =>
            k.empId.includes(searchVal) ||
            k.kitId.toUpperCase().includes(searchVal) ||
            (k.engin || '').toUpperCase().includes(searchVal)
          )
        : liste;

    if (!filtered.length) {
        listeVide.classList.remove('hidden');
        listeVide.textContent = searchVal
            ? `Aucun résultat pour « ${searchVal} ».`
            : 'Tous les kits sont conformes. 🎉';
        return;
    }

    listeVide.classList.add('hidden');

    let lastEmp = null;
    filtered.forEach(k => {
        if (k.empId !== lastEmp) {
            const sep = document.createElement('div');
            sep.className = 'liste-emp-sep';
            sep.innerHTML = `<span class="liste-emp-label">📍 ${k.empId}</span>`;
            listeKits.appendChild(sep);
            lastEmp = k.empId;
        }

        const isKo = k.statut_conformite === 'Incomplet';
        const card = document.createElement('div');
        card.className = 'kit-liste-item' + (isKo ? ' kit-liste-ko' : '');
        card.innerHTML = `
            <div class="kit-liste-left">
                <div class="kit-liste-meta">
                    ${k.engin ? `<span class="kit-liste-engin-badge">${k.engin}</span>` : ''}
                    <span class="kit-liste-code">${k.code_kit || k.kitId}</span>
                </div>
                <span class="kit-liste-nom">${k.nom_du_kit}</span>
            </div>
            <div class="kit-liste-right">
                <span class="kit-liste-statut ${isKo ? 'ko' : 'pending'}">
                    ${isKo ? '⚠️ Incomplet' : '· À contrôler'}
                </span>
                <span class="kit-liste-arrow">›</span>
            </div>
        `;
        card.addEventListener('click', () => ouvrirDetailKit(k.empId, k.kitId));
        listeKits.appendChild(card);
    });
}

inputEmp?.addEventListener('input',   () => renderListeKits(tousLesKits));
btnVerifier?.addEventListener('click', () => renderListeKits(tousLesKits));
inputEmp?.addEventListener('keydown', e => { if (e.key === 'Enter') btnVerifier.click(); });

// ═══════════════════════════════════════════════════════════════════════════════
// NIVEAU 2 — TOUS LES KITS D'UN EMPLACEMENT
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
            card.className = 'kit-liste-item'
                + (isOk ? ' kit-liste-ok' : isKo ? ' kit-liste-ko' : '');
            card.innerHTML = `
                <div class="kit-liste-left">
                    <div class="kit-liste-meta">
                        ${k.engin ? `<span class="kit-liste-engin-badge">${k.engin}</span>` : ''}
                        <span class="kit-liste-code">${k.code_kit || k.kitId}</span>
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
// NIVEAU 3 — DÉTAIL PIÈCES D'UN KIT
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
        afficherVue('liste');
    }
}

function afficherDetailKit(kitId, data, empId) {
    detailLoadingCard.classList.add('hidden');

    detailEmpBadge.textContent = empId;
    detailKitBadge.textContent = kitId;
    detailNom.textContent      = data.nom_du_kit || kitId;
    detailEmp.textContent      = empId;
    if (detailEngin) {
        detailEngin.textContent = data.engin
            ? `🚂 Engin : ${data.engin}  ·  Code : ${data.code_kit}` : '';
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
        await setDoc(
            doc(db, "emplacements", currentEmpId, "kits", currentKitId),
            {
                statut_conformite:     statut,
                derniere_verification: new Date().toISOString(),
                verificateur_email:    auth.currentUser?.email || 'inconnu',
                detail_verification:   details,
            },
            { merge: true }
        );

        showToast(`✅ Statut « ${statut} » enregistré.`, 'success');
        setTimeout(() => {
            currentEmpId = '';
            currentKitId = '';
            afficherVue('liste');
            chargerListeKits();
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
// ADMIN — IMPORT EXCEL (Nomenclature)
// ═══════════════════════════════════════════════════════════════════════════════

dropZone?.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone?.addEventListener('dragleave', ()  => dropZone.classList.remove('dragover'));
dropZone?.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) traiterFichier(file);
});
fileInput?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) traiterFichier(file);
    e.target.value = '';
});

function setStatus(msg, type = 'info') {
    adminStatus.textContent = msg;
    adminStatus.className   = `admin-status ${type}`;
}

async function traiterFichier(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        setStatus('Format invalide. Utilisez .xlsx ou .csv.', 'error'); return;
    }

    progressArea.classList.remove('hidden');
    progressBar.style.width   = '0%';
    progressLabel.textContent = 'Lecture du fichier…';
    setStatus('Analyse en cours…', 'info');

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onerror = () => setStatus('Impossible de lire le fichier.', 'error');

    reader.onload = async e => {
        try {
            const wb     = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const sheet  = wb.Sheets[wb.SheetNames[0]];
            const lignes = XLSX.utils.sheet_to_json(sheet);

            if (!lignes.length) throw new Error("Aucune donnée exploitable.");

            const index = {};
            lignes.forEach(l => {
                const row = {};
                Object.keys(l).forEach(k => { row[k.trim()] = l[k]; });

                const engin       = String(row['Engin']            || row['engin']    || '').trim();
                const codeKit     = String(row['Code kit']         || row['code_kit'] || '').trim();
                const nomKit      = String(row['designations kit'] || row['nom_kit']  || 'Kit sans nom').trim();
                const emplacement = String(row['emplacement']      || row['Emplacement'] || '').trim();
                const nomComp     = String(row['designation article'] || row['designations article'] || '').trim();
                const quantite    = Number(row['quantite'] || row['Quantite'] || row['quantité'] || 1);

                if (!engin || !codeKit || !emplacement) return;

                const kitId = `${engin}_${codeKit}`;
                if (!index[emplacement])        index[emplacement] = {};
                if (!index[emplacement][kitId]) {
                    index[emplacement][kitId] = {
                        engin, code_kit: codeKit, nom_du_kit: nomKit, composants: []
                    };
                }
                if (nomComp) {
                    index[emplacement][kitId].composants.push({
                        nom: nomComp, quantite_requise: quantite || 1
                    });
                }
            });

            let totalKits = 0;
            Object.values(index).forEach(kits => { totalKits += Object.keys(kits).length; });

            setStatus('Vérification des données existantes…', 'info');
            let ecrits = 0, ignores = 0;

            for (const [empId, kits] of Object.entries(index)) {
                await setDoc(doc(db, "emplacements", empId), { id: empId }, { merge: true });

                for (const [kitId, kitData] of Object.entries(kits)) {
                    const kitRef  = doc(db, "emplacements", empId, "kits", kitId);
                    const kitSnap = await getDoc(kitRef);

                    if (kitSnap.exists()) {
                        ignores++;
                    } else {
                        await setDoc(kitRef, {
                            ...kitData,
                            statut_conformite:    "Non vérifié",
                            derniere_mise_a_jour: new Date().toISOString(),
                        });

                        const nomRef  = doc(db, "nomenclature_kits", kitId);
                        const nomSnap = await getDoc(nomRef);
                        if (!nomSnap.exists()) await setDoc(nomRef, kitData);

                        ecrits++;
                    }

                    const done = ecrits + ignores;
                    const pct  = Math.round((done / totalKits) * 100);
                    progressBar.style.width   = pct + '%';
                    progressLabel.textContent = `${done} / ${totalKits} kits traités…`;
                    setStatus(`Import en cours… ${pct}%`, 'info');
                }
            }

            progressBar.style.width = '100%';
            setStatus(
                `✅ Import terminé — ${ecrits} kit(s) ajouté(s)` +
                `${ignores ? `, ${ignores} ignoré(s) déjà présent(s)` : ''}.`,
                'success'
            );

        } catch (err) {
            console.error(err);
            setStatus('❌ Échec : ' + err.message, 'error');
        } finally {
            fileInput.value = '';
        }
    };
}

// ─── TOGGLE MOT DE PASSE (page de connexion) ──────────────────────────────────
$('toggle-pwd').addEventListener('click', () => {
    const isPassword    = loginPwd.type === 'password';
    loginPwd.type       = isPassword ? 'text' : 'password';
    $('toggle-pwd').textContent = isPassword ? '🙈' : '👁';
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
        ? new Date(created).toLocaleDateString('fr-FR', {
              day: '2-digit', month: 'long', year: 'numeric'
          })
        : '—';

    const lastLogin = user.metadata.lastSignInTime;
    $('profil-last-login').textContent = lastLogin
        ? new Date(lastLogin).toLocaleString('fr-FR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
          })
        : '—';

    ['pwd-current', 'pwd-new', 'pwd-confirm'].forEach(id => {
        const el = $(id);
        if (el) el.value = '';
    });
    $('pwd-change-error')?.classList.remove('visible');
    $('pwd-change-success')?.classList.remove('visible');
    $('pwd-strength-wrap')?.classList.remove('visible');
    if ($('pwd-strength-fill')) $('pwd-strength-fill').className = 'pwd-strength-fill';
    if ($('pwd-strength-label')) $('pwd-strength-label').textContent = '';
}

// ─── INDICATEUR DE FORCE DU MOT DE PASSE ─────────────────────────────────────

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

// ─── TOGGLE MOT DE PASSE (formulaire profil, via data-target) ─────────────────

document.querySelectorAll('.btn-toggle-pwd[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = $(btn.dataset.target);
        if (!input) return;
        const isPassword    = input.type === 'password';
        input.type          = isPassword ? 'text' : 'password';
        btn.textContent     = isPassword ? '🙈' : '👁';
    });
});

// ─── CHANGEMENT DE MOT DE PASSE ───────────────────────────────────────────────

$('btn-change-pwd')?.addEventListener('click', async () => {
    const currentPwd = $('pwd-current').value;
    const newPwd     = $('pwd-new').value;
    const confirmPwd = $('pwd-confirm').value;
    const errEl      = $('pwd-change-error');
    const okEl       = $('pwd-change-success');

    errEl.classList.remove('visible');
    okEl.classList.remove('visible');

    if (!currentPwd || !newPwd || !confirmPwd) {
        return afficherErreurPwd(errEl, 'Veuillez remplir tous les champs.');
    }
    if (newPwd !== confirmPwd) {
        return afficherErreurPwd(errEl, 'Les nouveaux mots de passe ne correspondent pas.');
    }
    if (newPwd.length < 6) {
        return afficherErreurPwd(errEl, 'Le nouveau mot de passe doit contenir au moins 6 caractères.');
    }
    if (newPwd === currentPwd) {
        return afficherErreurPwd(errEl, 'Le nouveau mot de passe doit être différent de l\'actuel.');
    }

    const btn = $('btn-change-pwd');
    btn.disabled    = true;
    btn.textContent = 'Modification en cours…';

    try {
        const user       = auth.currentUser;
        const credential = EmailAuthProvider.credential(user.email, currentPwd);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPwd);

        ['pwd-current', 'pwd-new', 'pwd-confirm'].forEach(id => {
            const el = $(id);
            if (el) el.value = '';
        });
        $('pwd-strength-wrap').classList.remove('visible');

        okEl.textContent = '✅ Mot de passe modifié avec succès.';
        okEl.classList.add('visible');
        setTimeout(() => okEl.classList.remove('visible'), 5000);

    } catch (err) {
        const messages = {
            'auth/wrong-password':         'Mot de passe actuel incorrect.',
            'auth/invalid-credential':     'Mot de passe actuel incorrect.',
            'auth/weak-password':          'Nouveau mot de passe trop faible (minimum 6 caractères).',
            'auth/too-many-requests':      'Trop de tentatives. Veuillez réessayer plus tard.',
            'auth/requires-recent-login':  'Session expirée. Veuillez vous reconnecter.',
            'auth/network-request-failed': 'Erreur réseau. Vérifiez votre connexion.',
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
// GITHUB TOKEN (Firestore) + PUSH emplacements_autorises.txt
// À ajouter à la fin de app.js, après initImportOF()
//
// ⚙️  Seules 2 constantes à configurer :
// ═══════════════════════════════════════════════════════════════════════════════
 
function initGithubConfig() {
 
    // ── ⚙️  À CONFIGURER ────────────────────────────────────────────────────
    const GITHUB_OWNER = "methodelogistiquesncf-boop"; // votre utilisateur ou org GitHub
    const GITHUB_REPO  = "completconforme";            // nom du dépôt
    // ── Le token est lu depuis Firestore : config/secrets → champ github_token ─
 
    const EXPECTED_FILENAME = "emplacements_autorises.txt";
    const FIRESTORE_SECRET  = { col: "config", doc: "secrets", field: "github_token" };
    const API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;
 
    // ── Refs DOM ─────────────────────────────────────────────────────────────
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
 
    // ── Helpers ───────────────────────────────────────────────────────────────
 
    function setTokenStatus(msg, type = "info") {
        tokenStatus.textContent = msg;
        tokenStatus.className   = `admin-status ${type}`;
    }
 
    function setStatusEmp(msg, type = "info") {
        statusEmp.textContent = msg;
        statusEmp.className   = `admin-status ${type}`;
    }
 
    function setProgress(pct, label) {
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
 
    // ── Lecture du token depuis Firestore ─────────────────────────────────────
 
    async function lireToken() {
        const snap = await getDoc(doc(db, FIRESTORE_SECRET.col, FIRESTORE_SECRET.doc));
        if (!snap.exists()) throw new Error("Aucun token configuré. Enregistrez-en un d'abord.");
        const token = snap.data()[FIRESTORE_SECRET.field];
        if (!token) throw new Error("Champ token vide dans Firestore.");
        return token;
    }
 
    // ── Chargement initial : indique si un token est déjà enregistré ──────────
 
    async function chargerEtatToken() {
        try {
            const snap = await getDoc(doc(db, FIRESTORE_SECRET.col, FIRESTORE_SECRET.doc));
            if (snap.exists() && snap.data()[FIRESTORE_SECRET.field]) {
                setTokenStatus("✅ Token GitHub configuré.", "success");
                tokenInput.placeholder = "ghp_•••••••••• (déjà enregistré)";
            }
        } catch (err) {
            // Pas bloquant au démarrage
        }
    }
    chargerEtatToken();
 
    // ── Sauvegarde du token dans Firestore ────────────────────────────────────
 
    btnSaveToken.addEventListener("click", async () => {
        const val = tokenInput.value.trim();
        if (!val) {
            setTokenStatus("❌ Veuillez saisir un token.", "error");
            return;
        }
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
 
    // ── Drag & drop fichier ───────────────────────────────────────────────────
 
    dropZoneEmp.addEventListener("dragover", e => {
        e.preventDefault();
        dropZoneEmp.classList.add("dragover");
    });
    dropZoneEmp.addEventListener("dragleave", () =>
        dropZoneEmp.classList.remove("dragover")
    );
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
 
    // ── Push vers GitHub ──────────────────────────────────────────────────────
 
    async function traiterFichierEmp(file) {
 
        // 1. Validation du nom exact
        if (file.name !== EXPECTED_FILENAME) {
            setStatusEmp(
                `❌ Nom invalide : « ${file.name} ». ` +
                `Le fichier doit s'appeler exactement « ${EXPECTED_FILENAME} ».`,
                "error"
            );
            return;
        }
 
        previewWrap.classList.add("hidden");
        progAreaEmp.classList.remove("hidden");
        setProgress(5, "Lecture du fichier…");
        setStatusEmp("⏳ Lecture du fichier…", "info");
 
        try {
            // 2. Lecture contenu
            const text = await file.text();
            const lignes = text
                .split(/\r?\n/)
                .map(l => l.trim())
                .filter(l => l.length > 0 && !l.startsWith("#"));
 
            if (!lignes.length) {
                setStatusEmp("❌ Le fichier est vide ou ne contient aucun identifiant valide.", "error");
                progAreaEmp.classList.add("hidden");
                return;
            }
 
            setProgress(20, "Récupération du token…");
 
            // 3. Lecture du token depuis Firestore
            const token = await lireToken();
 
            setProgress(40, "Récupération du SHA actuel…");
            setStatusEmp("⏳ Connexion à GitHub…", "info");
 
            // 4. Récupérer le SHA du fichier existant (requis par l'API pour écraser)
            let sha = null;
            const getResp = await fetch(`${API_BASE}/${EXPECTED_FILENAME}`, {
                headers: {
                    Authorization:          `Bearer ${token}`,
                    Accept:                 "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                }
            });
 
            if (getResp.ok) {
                const existing = await getResp.json();
                sha = existing.sha;
            } else if (getResp.status !== 404) {
                const err = await getResp.json();
                throw new Error(`GitHub GET : ${err.message}`);
            }
 
            setProgress(65, "Envoi vers le dépôt…");
            setStatusEmp("⏳ Push vers GitHub…", "info");
 
            // 5. Encodage base64 + PUT
            const base64Content = btoa(unescape(encodeURIComponent(text)));
            
 
            const putResp = await fetch(`${API_BASE}/${EXPECTED_FILENAME}`, {
                method:  "PUT",
                headers: {
                    Authorization:          `Bearer ${token}`,
                    Accept:                 "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "Content-Type":         "application/json",
                },
                body: JSON.stringify({
                    message: `[Admin] MAJ emplacements_autorises.txt`,
                    content: base64Content,
                    ...(sha ? { sha } : {}),
                }),
            });
 
            if (!putResp.ok) {
                const err = await putResp.json();
                throw new Error(`GitHub PUT : ${err.message}`);
            }
 
            const result     = await putResp.json();
            const commitSha  = result.commit?.sha?.slice(0, 7) || "ok";
            const commitUrl  = result.commit?.html_url || "#";
 
            setProgress(100, "Terminé.");
            statusEmp.className   = "admin-status success";
            statusEmp.innerHTML   =
                `✅ ${lignes.length} emplacement(s) envoyé(s) · Commit : ` +
                `<a href="${commitUrl}" target="_blank" rel="noopener"
                    style="color:var(--green);font-family:var(--mono);font-size:.8rem;">
                    ${commitSha} ↗
                </a>`;
 
            afficherApercu(lignes);
 
        } catch (err) {
            console.error("[PushEmp]", err);
            setStatusEmp("❌ " + err.message, "error");
            progAreaEmp.classList.add("hidden");
        }
    }
}
 
initGithubConfig();
// ═══════════════════════════════════════════════════════════════════════════════
// PUSH Excel → imports/pending/ + suivi live du workflow GitHub Actions
// À ajouter à la fin de app.js, après initGithubConfig()
// ═══════════════════════════════════════════════════════════════════════════════
 
function initImportGithubXls() {
 
    // ── ⚙️  Configuration ────────────────────────────────────────────────────
    const GITHUB_OWNER     = "methodelogistiquesncf-boop";
    const GITHUB_REPO      = "completconforme";
    const TARGET_FOLDER    = "imports/pending";
    const ACCEPTED_EXT     = ["xlsx", "xls", "csv"];
    const FIRESTORE_SECRET = { col: "config", doc: "secrets", field: "github_token" };
    const API_BASE         = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;
    const API_ACTIONS      = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions`;
 
    const POLL_INTERVAL_MS = 4000;   // polling toutes les 4 secondes
    const POLL_TIMEOUT_MS  = 300000; // abandon après 5 minutes
 
    // Correspondance nom d'étape workflow → libellé lisible
    const STEP_LABELS = {
        "Checkout":                       "📥 Récupération du dépôt",
        "Setup Python 3.11":              "🐍 Installation Python 3.11",
        "Installer les dépendances":      "📦 Installation des dépendances",
        "Identifier le fichier importé":  "🔍 Détection du fichier",
        "Vérifier qu'un fichier a été détecté": "✔️ Vérification",
        "Importer dans Firestore":        "🔥 Injection dans Firestore",
        "Archiver le fichier traité":     "🗃️ Archivage du fichier",
        "Télécharger le fichier nettoyé": "⬇️ Téléchargement fichier nettoyé",
    };
 
    // ── Refs DOM ──────────────────────────────────────────────────────────────
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
 
    if (!dropZoneXls) return;
 
    // ── Helpers ───────────────────────────────────────────────────────────────
 
    function setStatusXls(msg, type = "info") {
        statusXls.textContent = msg;
        statusXls.className   = `admin-status ${type}`;
    }
 
    function setProgress(pct, label) {
        progBarXls.style.width   = pct + "%";
        progLabelXls.textContent = label;
    }
 
    async function lireToken() {
        const snap = await getDoc(doc(db, FIRESTORE_SECRET.col, FIRESTORE_SECRET.doc));
        if (!snap.exists()) throw new Error("Aucun token GitHub configuré. Enregistrez-en un dans « Configuration GitHub ».");
        const token = snap.data()[FIRESTORE_SECRET.field];
        if (!token)  throw new Error("Champ token vide dans Firestore.");
        return token;
    }
 
    // ── Icônes & couleurs des statuts GitHub Actions ──────────────────────────
 
    function iconStep(status, conclusion) {
        if (status === "queued")      return { icon: "⏳", color: "var(--muted)" };
        if (status === "in_progress") return { icon: "🔄", color: "var(--blue)" };
        if (status === "completed") {
            if (conclusion === "success")   return { icon: "✅", color: "var(--green)" };
            if (conclusion === "skipped")   return { icon: "⏭️", color: "var(--muted)" };
            if (conclusion === "failure")   return { icon: "❌", color: "var(--red)" };
            if (conclusion === "cancelled") return { icon: "🚫", color: "var(--muted)" };
        }
        return { icon: "⏸️", color: "var(--muted)" };
    }
 
    function iconRun(status, conclusion) {
        if (status === "queued")      return { icon: "⏳", label: "En file d'attente…",    color: "var(--muted)" };
        if (status === "in_progress") return { icon: "🔄", label: "Pipeline en cours…",    color: "var(--blue)"  };
        if (status === "completed") {
            if (conclusion === "success")   return { icon: "✅", label: "Pipeline terminé avec succès !", color: "var(--green)" };
            if (conclusion === "failure")   return { icon: "❌", label: "Pipeline échoué.",               color: "var(--red)"   };
            if (conclusion === "cancelled") return { icon: "🚫", label: "Pipeline annulé.",               color: "var(--muted)" };
        }
        return { icon: "⏳", label: "Démarrage…", color: "var(--muted)" };
    }
 
    // ── Rendu des étapes ──────────────────────────────────────────────────────
 
    function renderSteps(steps) {
        workflowSteps.innerHTML = "";
        steps.forEach(step => {
            // Ignorer les étapes système de GitHub
            if (step.name === "Set up job" || step.name === "Complete job") return;
 
            const { icon, color } = iconStep(step.status, step.conclusion);
            const label = STEP_LABELS[step.name] || step.name;
 
            const row = document.createElement("div");
            row.dataset.stepName = step.name;
            row.style.cssText = `
                display: flex; align-items: center; gap: .65rem;
                padding: .55rem .85rem;
                background: var(--input-bg);
                border: 1.5px solid var(--border);
                border-radius: var(--radius);
                transition: border-color .2s;
            `;
 
            const isActive = step.status === "in_progress";
            if (isActive) row.style.borderColor = "var(--blue)";
            if (step.conclusion === "success")  row.style.borderColor = "rgba(63,168,118,.4)";
            if (step.conclusion === "failure")  row.style.borderColor = "rgba(192,53,74,.4)";
 
            row.innerHTML = `
                <span style="font-size:.95rem;flex-shrink:0;">${icon}</span>
                <span style="font-size:.83rem;font-weight:600;color:${color};flex:1;">${label}</span>
                ${step.status === "in_progress"
                    ? `<div class="spinner" style="width:14px;height:14px;border-width:2px;flex-shrink:0;"></div>`
                    : `<span style="font-family:var(--mono);font-size:.68rem;color:var(--muted);">
                           ${step.conclusion || step.status}
                       </span>`
                }
            `;
            workflowSteps.appendChild(row);
        });
    }
 
    // ── Rendu statut global du run ────────────────────────────────────────────
 
    function renderRunStatus(status, conclusion) {
        const { icon, label, color } = iconRun(status, conclusion);
        const isRunning = status !== "completed";
 
        workflowSpinner.style.display = isRunning ? "block" : "none";
        workflowRunLbl.textContent    = `${icon} ${label}`;
        workflowRunLbl.style.color    = color;
 
        if (status === "completed") {
            workflowRunSt.style.borderColor =
                conclusion === "success" ? "rgba(63,168,118,.45)" : "rgba(192,53,74,.35)";
            workflowRunSt.style.background  =
                conclusion === "success" ? "rgba(63,168,118,.05)" : "rgba(192,53,74,.05)";
        }
    }
 
    // ── Durée formatée ────────────────────────────────────────────────────────
 
    function formatDuration(start, end) {
        const secs = Math.round((new Date(end) - new Date(start)) / 1000);
        if (secs < 60) return `${secs}s`;
        return `${Math.floor(secs / 60)}min ${secs % 60}s`;
    }
 
    // ── Polling GitHub Actions ────────────────────────────────────────────────
 
    async function pollWorkflow(commitSha, token) {
        workflowPanel.classList.remove("hidden");
        renderRunStatus("queued", null);
 
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let runId      = null;
 
        // Phase 1 : attendre que GitHub Actions crée le run lié au commit
        while (Date.now() < deadline) {
            await sleep(POLL_INTERVAL_MS);
 
            const res = await fetch(
                `${API_ACTIONS}/runs?head_sha=${commitSha}&per_page=5`,
                { headers: githubHeaders(token) }
            );
            if (!res.ok) continue;
 
            const data = await res.json();
            const run  = data.workflow_runs?.[0];
            if (!run) continue;
 
            runId = run.id;
 
            // Afficher le lien vers le run
            workflowLink.href          = run.html_url;
            workflowLink.style.display = "inline";
 
            renderRunStatus(run.status, run.conclusion);
 
            // Phase 2 : suivre les étapes jusqu'à complétion
            await pollRunJobs(runId, run, token, deadline);
            return;
        }
 
        // Timeout
        workflowRunLbl.textContent = "⚠️ Délai dépassé — vérifiez GitHub Actions.";
        workflowRunLbl.style.color = "var(--amber)";
        workflowSpinner.style.display = "none";
    }
 
    async function pollRunJobs(runId, initialRun, token, deadline) {
        let run = initialRun;
 
        while (Date.now() < deadline) {
            // Récupérer les jobs et leurs étapes
            const jobsRes = await fetch(
                `${API_ACTIONS}/runs/${runId}/jobs`,
                { headers: githubHeaders(token) }
            );
 
            if (jobsRes.ok) {
                const jobsData = await jobsRes.json();
                const job      = jobsData.jobs?.[0]; // 1 seul job dans ce workflow
                if (job?.steps) renderSteps(job.steps);
            }
 
            renderRunStatus(run.status, run.conclusion);
 
            if (run.status === "completed") {
                workflowSpinner.style.display = "none";
 
                // Durée totale
                if (run.created_at && run.updated_at) {
                    workflowDur.textContent = `⏱ Durée totale : ${formatDuration(run.created_at, run.updated_at)}`;
                    workflowDur.style.display = "block";
                }
                return;
            }
 
            await sleep(POLL_INTERVAL_MS);
 
            // Rafraîchir le run
            const runRes = await fetch(
                `${API_ACTIONS}/runs/${runId}`,
                { headers: githubHeaders(token) }
            );
            if (runRes.ok) run = await runRes.json();
        }
    }
 
    function githubHeaders(token) {
        return {
            Authorization:          `Bearer ${token}`,
            Accept:                 "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        };
    }
 
    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
 
    // ── Drag & drop ───────────────────────────────────────────────────────────
 
    dropZoneXls.addEventListener("dragover", e => {
        e.preventDefault();
        dropZoneXls.classList.add("dragover");
    });
    dropZoneXls.addEventListener("dragleave", () =>
        dropZoneXls.classList.remove("dragover")
    );
    dropZoneXls.addEventListener("drop", e => {
        e.preventDefault();
        dropZoneXls.classList.remove("dragover");
        const file = e.dataTransfer?.files?.[0];
        if (file) traiterFichierXls(file);
    });
    fileInputXls.addEventListener("change", e => {
        const file = e.target.files?.[0];
        if (file) traiterFichierXls(file);
        e.target.value = "";
    });
 
    // ── Traitement principal ──────────────────────────────────────────────────
 
    async function traiterFichierXls(file) {
 
        // 1. Validation extension
        const ext = file.name.split(".").pop().toLowerCase();
        if (!ACCEPTED_EXT.includes(ext)) {
            setStatusXls(`❌ Format invalide : « .${ext} ». Utilisez .xlsx, .xls ou .csv.`, "error");
            return;
        }
 
        // Reset UI
        workflowPanel.classList.add("hidden");
        workflowSteps.innerHTML    = "";
        workflowLink.style.display = "none";
        workflowDur.style.display  = "none";
        progAreaXls.classList.remove("hidden");
        setProgress(5, "Lecture du fichier…");
        setStatusXls("⏳ Lecture du fichier…", "info");
 
        try {
            // 2. Lecture binaire → base64
            const buffer = await file.arrayBuffer();
            const uint8  = new Uint8Array(buffer);
            const base64 = btoa(uint8.reduce((d, b) => d + String.fromCharCode(b), ""));
 
            setProgress(20, "Récupération du token…");
            const token = await lireToken();
 
            const targetPath = `${TARGET_FOLDER}/${file.name}`;
            setProgress(40, "Vérification du fichier existant…");
            setStatusXls("⏳ Connexion à GitHub…", "info");
 
            // 3. SHA si fichier existant
            let sha = null;
            const getResp = await fetch(`${API_BASE}/${targetPath}`, {
                headers: githubHeaders(token)
            });
            if (getResp.ok) {
                sha = (await getResp.json()).sha;
            } else if (getResp.status !== 404) {
                throw new Error(`GitHub GET : ${(await getResp.json()).message}`);
            }
 
            setProgress(65, "Envoi vers le dépôt…");
            setStatusXls("⏳ Push vers GitHub…", "info");
 
            // 4. PUT fichier
            const putResp = await fetch(`${API_BASE}/${targetPath}`, {
                method:  "PUT",
                headers: { ...githubHeaders(token), "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: `[Admin] Import ${file.name} → ${TARGET_FOLDER}`,
                    content: base64,
                    ...(sha ? { sha } : {}),
                }),
            });
 
            if (!putResp.ok) {
                throw new Error(`GitHub PUT : ${(await putResp.json()).message}`);
            }
 
            const result    = await putResp.json();
            const commitSha = result.commit?.sha;
            const commitUrl = result.commit?.html_url || "#";
            const shortSha  = commitSha?.slice(0, 7) || "ok";
 
            setProgress(100, "Fichier envoyé — pipeline en attente…");
            statusXls.className = "admin-status success";
            statusXls.innerHTML =
                `✅ « ${file.name} » envoyé dans <code style="font-family:var(--mono);font-size:.8rem;">${TARGET_FOLDER}/</code> · Commit : ` +
                `<a href="${commitUrl}" target="_blank" rel="noopener"
                    style="color:var(--green);font-family:var(--mono);font-size:.8rem;">
                    ${shortSha} ↗
                </a>`;
 
            // 5. Suivi live du workflow Actions
            if (commitSha) {
                await pollWorkflow(commitSha, token);
            }
 
        } catch (err) {
            console.error("[PushXls]", err);
            setStatusXls("❌ " + err.message, "error");
            progAreaXls.classList.add("hidden");
        }
    }
}
 
initImportGithubXls();
 / ═══════════════════════════════════════════════════════
// ADMIN — NAVIGATION ONGLETS
// ═══════════════════════════════════════════════════════
document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.add('hidden'));
        btn.classList.add('active');
        document.getElementById('admin-tab-' + btn.dataset.tab)?.classList.remove('hidden');
    });
});
