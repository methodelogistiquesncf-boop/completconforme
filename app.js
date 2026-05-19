import { initializeApp }                          from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence,
         doc, setDoc, getDoc, getDocs,
         collection }                            from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword,
         signOut, onAuthStateChanged,
         updatePassword, reauthenticateWithCredential,
         EmailAuthProvider }                     from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION Firebase
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAkhB59fG7oNtRfhb_0xeuW9PYmaUT9KRk",
  authDomain: "completconforme.firebaseapp.com",
  projectId: "completconforme",
  storageBucket: "completconforme.firebasestorage.app",
  messagingSenderId: "595620033926",
  appId: "1:595620033926:web:64dcfd0b141040146a2807"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

try {
    await enableIndexedDbPersistence(db);
} catch (err) {
    console.warn("[Offline] Persistance indisponible :", err.code);
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
const dropZone     = $('drop-zone');
const fileInput    = $('file-input');
const adminStatus  = $('admin-status');
const progressArea = $('progress-area');
const progressBar  = $('progress-bar');
const progressLabel= $('progress-label');

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
        const date    = new Date(k.derniere_verification).toLocaleString('fr-FR', {
            day:'2-digit', month:'2-digit', year:'numeric',
            hour:'2-digit', minute:'2-digit'
        });
        const statut  = k.statut_conformite || 'Non vérifié';
        const isOk    = statut === 'Conforme';
        const isKo    = statut === 'Incomplet';
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
// ADMIN — IMPORT EXCEL
// ═══════════════════════════════════════════════════════════════════════════════

dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) traiterFichier(file);
});
fileInput.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) traiterFichier(file);
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
    const isPassword = loginPwd.type === 'password';
    loginPwd.type       = isPassword ? 'text' : 'password';
    $('toggle-pwd').textContent = isPassword ? '🙈' : '👁';
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROFIL UTILISATEUR
// ═══════════════════════════════════════════════════════════════════════════════

// ─── AFFICHAGE ────────────────────────────────────────────────────────────────

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

    // Réinitialiser le formulaire à chaque ouverture
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
    if (val.length >= 8)               score++;
    if (val.length >= 12)              score++;
    if (/[A-Z]/.test(val))             score++;
    if (/[0-9]/.test(val))             score++;
    if (/[^A-Za-z0-9]/.test(val))     score++;

    const levels = [
        { label: 'Très faible', cls: 'strength-1' },
        { label: 'Faible',      cls: 'strength-2' },
        { label: 'Moyen',       cls: 'strength-3' },
        { label: 'Fort',        cls: 'strength-4' },
        { label: 'Très fort',   cls: 'strength-5' },
    ];
    const level      = levels[Math.min(score, 4)];
    fill.className   = `pwd-strength-fill ${level.cls}`;
    lbl.textContent  = level.label;
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

        // Réauthentification obligatoire avant opération sensible
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPwd);

        // Réinitialisation des champs
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
async function detectAppVersion() {
    try {
        const keys = await caches.keys();
        const key  = keys.find(k => k.startsWith('completconforme-'));
        if (!key) return;
        const version = key.replace('completconforme-', ''); // → "v3"
        document.querySelectorAll('.app-version').forEach(el => el.textContent = version);
    } catch {}
}
detectAppVersion();
