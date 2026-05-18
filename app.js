import { initializeApp }                          from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence,
         doc, setDoc, getDoc, getDocs,
         collection, updateDoc, query, where,
         orderBy }                               from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }           from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

// ─── PERSISTENCE OFFLINE ──────────────────────────────────────────────────────
try {
    await enableIndexedDbPersistence(db);
} catch (err) {
    console.warn("[Offline] Persistance indisponible :", err.code);
}

// ─── ADMIN PIN ────────────────────────────────────────────────────────────────
const ADMIN_PIN = "1234";

// ─── ÉTAT GLOBAL ─────────────────────────────────────────────────────────────
let currentEmpId = "";
let currentKitId = "";

// ─── REFS DOM ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const loginPage    = $('login-page');
const appEl        = $('app');
const loginEmail   = $('login-email');
const loginPwd     = $('login-pwd');
const btnLogin     = $('btn-login');
const loginError   = $('login-error');
const btnLogout    = $('btn-logout');
const headerUser   = $('header-user');

const tabTerrain   = $('tab-terrain');
const tabAdmin     = $('tab-admin');
const tabHistorique= $('tab-historique');
const secTerrain   = $('sec-terrain');
const secAdmin     = $('sec-admin');
const secHistorique= $('sec-historique');

const offlineBanner= $('offline-banner');
const compList     = $('comp-list');

// ── Vues terrain ──────────────────────────────────────────────────────────────
const viewListe    = $('view-liste');
const viewDetail   = $('view-detail');

// ── Vue liste ─────────────────────────────────────────────────────────────────
const inputEmp     = $('input-emplacement');
const btnVerifier  = $('btn-verifier');
const searchStatus = $('search-status');
const listeLoading = $('liste-loading');
const listeVide    = $('liste-vide');
const listeKits    = $('liste-kits');

// ── Vue détail ────────────────────────────────────────────────────────────────
const btnRetour    = $('btn-retour');
const detailEmpBadge = $('detail-emp-badge');
const detailKitBadge = $('detail-kit-badge');
const detailNom      = $('detail-nom');
const detailEmp      = $('detail-emp');
const detailEngin    = $('detail-engin');
const detailLoadingCard = $('detail-loading-card');
const detailKitCard     = $('detail-kit-card');

// ── Admin ─────────────────────────────────────────────────────────────────────
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

// ── Historique ────────────────────────────────────────────────────────────────
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
    else       showLogin();
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
    if (headerUser) headerUser.textContent = user.email;
}

btnLogin.addEventListener('click', async () => {
    const email = loginEmail.value.trim();
    const pwd   = loginPwd.value;
    if (!email || !pwd) { showLoginError("Veuillez remplir tous les champs."); return; }
    btnLogin.disabled = true;
    btnLogin.textContent = "Connexion…";
    loginError.classList.remove('visible');
    try {
        await signInWithEmailAndPassword(auth, email, pwd);
    } catch (err) {
        showLoginError(firebaseAuthMessage(err.code));
    } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = "Se connecter →";
    }
});

[loginEmail, loginPwd].forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') btnLogin.click(); });
});

btnLogout.addEventListener('click', async () => {
    const confirmed = await showConfirmToast("Se déconnecter ?");
    if (confirmed) signOut(auth);
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
        'auth/invalid-credential':     "Identifiants invalides. Vérifiez votre e-mail et mot de passe.",
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

function showTab(tab) {
    tabTerrain.classList.toggle('active',    tab === 'terrain');
    tabAdmin.classList.toggle('active',      tab === 'admin');
    tabHistorique.classList.toggle('active', tab === 'historique');
    secTerrain.classList.toggle('hidden',    tab !== 'terrain');
    secAdmin.classList.toggle('hidden',      tab !== 'admin');
    secHistorique.classList.toggle('hidden', tab !== 'historique');

    if (tab === 'historique') chargerHistorique();
    if (tab === 'terrain')    { afficherVueListe(); chargerListeKits(); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TERRAIN — VUE LISTE
// ═══════════════════════════════════════════════════════════════════════════════

let tousLesEmplacements = []; // cache pour le filtrage local

function afficherVueListe() {
    viewListe.classList.remove('hidden');
    viewDetail.classList.add('hidden');
}

function afficherVueDetail() {
    viewListe.classList.add('hidden');
    viewDetail.classList.remove('hidden');
}

async function chargerListeKits() {
    listeLoading.classList.remove('hidden');
    listeVide.classList.add('hidden');
    listeKits.innerHTML = '';
    searchStatus.textContent = '';

    try {
        const snap = await getDocs(collection(db, "emplacements"));
        tousLesEmplacements = [];

        snap.forEach(d => {
            const data = d.data();
            // On ne liste que les non contrôlés (Non vérifié ou Incomplet)
            if (data.statut_conformite !== "Conforme") {
                tousLesEmplacements.push({ id: d.id, ...data });
            }
        });

        // Tri alphabétique par emplacement
        tousLesEmplacements.sort((a, b) => a.id.localeCompare(b.id));

        renderListeKits(tousLesEmplacements);

    } catch (err) {
        listeLoading.classList.add('hidden');
        searchStatus.textContent = '⚠️ Erreur de chargement : ' + err.message;
    }
}

function renderListeKits(liste) {
    listeLoading.classList.add('hidden');
    listeKits.innerHTML = '';

    const searchVal = (inputEmp?.value || '').trim().toUpperCase();

    const filtered = searchVal
        ? liste.filter(emp =>
            emp.id.includes(searchVal) ||
            (emp.id_kit_stocke || '').toUpperCase().includes(searchVal)
          )
        : liste;

    if (!filtered.length) {
        listeVide.classList.remove('hidden');
        listeVide.textContent = searchVal
            ? `Aucun résultat pour « ${searchVal} ».`
            : 'Tous les emplacements sont conformes. 🎉';
        return;
    }

    listeVide.classList.add('hidden');

    filtered.forEach(emp => {
        const idParts  = emp.id_kit_stocke ? emp.id_kit_stocke.split('_') : [];
        const engin    = idParts.length >= 1 ? idParts[0] : '—';
        const codeKit  = idParts.length >= 2 ? idParts.slice(1).join('_') : (emp.id_kit_stocke || '—');
        const statut   = emp.statut_conformite || 'Non vérifié';
        const isKo     = statut === 'Incomplet';

        const card = document.createElement('div');
        card.className = 'kit-liste-item' + (isKo ? ' kit-liste-ko' : '');
        card.innerHTML = `
            <div class="kit-liste-left">
                <span class="kit-liste-emp">${emp.id}</span>
                <div class="kit-liste-meta">
                    <span class="kit-liste-engin-badge">${engin}</span>
                    <span class="kit-liste-code">${codeKit}</span>
                </div>
            </div>
            <div class="kit-liste-right">
                ${isKo
                    ? '<span class="kit-liste-statut ko">⚠️ Incomplet</span>'
                    : '<span class="kit-liste-statut pending">À contrôler</span>'
                }
                <span class="kit-liste-arrow">›</span>
            </div>
        `;
        card.addEventListener('click', () => ouvrirDetailKit(emp.id, emp.id_kit_stocke));
        listeKits.appendChild(card);
    });
}

// Filtrage dynamique sur la barre de recherche
inputEmp?.addEventListener('input', () => renderListeKits(tousLesEmplacements));

// Bouton "Vérifier" — recherche directe par emplacement
btnVerifier?.addEventListener('click', () => {
    const empId = inputEmp.value.trim().toUpperCase();
    if (!empId) { chargerListeKits(); return; }
    const found = tousLesEmplacements.find(e => e.id === empId);
    if (found) {
        ouvrirDetailKit(found.id, found.id_kit_stocke);
    } else {
        // Peut-être conforme (non dans la liste) — on tente Firebase
        ouvrirDetailKitDepuisFirebase(empId);
    }
});

inputEmp?.addEventListener('keydown', e => { if (e.key === 'Enter') btnVerifier.click(); });

// ─── Ouverture vue détail depuis la liste (données déjà disponibles) ──────────
async function ouvrirDetailKit(empId, kitId) {
    currentEmpId = empId;
    currentKitId = kitId;

    afficherVueDetail();
    detailLoadingCard.classList.remove('hidden');
    detailKitCard.classList.add('hidden');

    try {
        const kitSnap = await getDoc(doc(db, "nomenclature_kits", kitId));
        if (!kitSnap.exists()) throw new Error(`Fiche du kit « ${kitId} » introuvable.`);
        afficherDetailKit(kitId, kitSnap.data(), empId);
    } catch (err) {
        detailLoadingCard.classList.add('hidden');
        showToast('⚠️ ' + err.message, 'error');
        afficherVueListe();
    }
}

// ─── Ouverture depuis recherche directe (emplacement potentiellement conforme) ─
async function ouvrirDetailKitDepuisFirebase(empId) {
    afficherVueDetail();
    detailLoadingCard.classList.remove('hidden');
    detailKitCard.classList.add('hidden');

    try {
        const empSnap = await getDoc(doc(db, "emplacements", empId));
        if (!empSnap.exists() || !empSnap.data().id_kit_stocke) {
            throw new Error(`Emplacement « ${empId} » vide ou inconnu.`);
        }

        const empData = empSnap.data();

        // Emplacement déjà conforme → on informe et on propose
        if (empData.statut_conformite === "Conforme") {
            detailLoadingCard.classList.add('hidden');
            afficherVueListe();
            const date = empData.derniere_verification
                ? new Date(empData.derniere_verification).toLocaleString('fr-FR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })
                : "date inconnue";
            const reforcer = await showConfirmToast(
                `✅ ${empId} déjà conforme (${date}). Re-contrôler quand même ?`
            );
            if (!reforcer) return;
            // L'utilisateur veut forcer → on rouvre en détail
            currentEmpId = empId;
            currentKitId = empData.id_kit_stocke;
            afficherVueDetail();
            detailLoadingCard.classList.remove('hidden');
            detailKitCard.classList.add('hidden');
            const kitSnap = await getDoc(doc(db, "nomenclature_kits", currentKitId));
            if (!kitSnap.exists()) throw new Error(`Fiche du kit « ${currentKitId} » introuvable.`);
            afficherDetailKit(currentKitId, kitSnap.data(), empId);
            return;
        }

        currentEmpId = empId;
        currentKitId = empData.id_kit_stocke;
        const kitSnap = await getDoc(doc(db, "nomenclature_kits", currentKitId));
        if (!kitSnap.exists()) throw new Error(`Fiche du kit « ${currentKitId} » introuvable.`);
        afficherDetailKit(currentKitId, kitSnap.data(), empId);

    } catch (err) {
        detailLoadingCard.classList.add('hidden');
        afficherVueListe();
        showToast('⚠️ ' + err.message, 'error');
    }
}

// ─── Bouton retour ────────────────────────────────────────────────────────────
btnRetour?.addEventListener('click', () => {
    afficherVueListe();
    chargerListeKits(); // rafraîchit la liste (au cas où une validation vient d'être faite)
});

// ─── Affichage du détail du kit ───────────────────────────────────────────────
function afficherDetailKit(idKit, data, empId) {
    detailLoadingCard.classList.add('hidden');

    // En-tête
    detailEmpBadge.textContent = empId;
    detailKitBadge.textContent = idKit;
    detailNom.textContent      = data.nom_du_kit;
    detailEmp.textContent      = empId;
    if (detailEngin) {
        detailEngin.textContent = data.engin
            ? `🚂 Engin : ${data.engin}  ·  Code : ${data.code_kit}`
            : '';
    }

    // Liste des composants
    compList.innerHTML = '';
    (data.composants || []).forEach(comp => {
        const item = document.createElement('div');
        item.className = 'comp-item';
        item.dataset.required = comp.quantite_requise;
        item.innerHTML = `
            <div class="comp-left">
                <div class="comp-status-icon">
                    <svg class="icon-ok" width="12" height="9" viewBox="0 0 12 9" fill="none">
                        <path d="M1 4L4.5 7.5L11 1" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <svg class="icon-ko" width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1L9 9M9 1L1 9" stroke="white" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                <span class="comp-name">${comp.nom}</span>
            </div>
            <span class="comp-qty-required">${comp.quantite_requise}</span>
            <input
                type="number"
                class="qty-input"
                min="0"
                placeholder="—"
                aria-label="Quantité comptée"
            >
        `;
        const input = item.querySelector('.qty-input');
        input.addEventListener('input', () => evaluerItem(item, input, comp.quantite_requise));
        compList.appendChild(item);
    });

    detailKitCard.classList.remove('hidden');
}

function evaluerItem(item, input, required) {
    const val = input.value.trim();
    if (val === '') {
        item.classList.remove('checked', 'non-conforme');
        return;
    }
    const counted = parseInt(val, 10);
    if (counted === required) {
        item.classList.add('checked');
        item.classList.remove('non-conforme');
    } else {
        item.classList.add('non-conforme');
        item.classList.remove('checked');
    }
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────

$('btn-conforme').addEventListener('click',  () => valider("Conforme"));
$('btn-incomplet').addEventListener('click', () => valider("Incomplet"));

async function valider(statut) {
    if (!currentEmpId) return;

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
            if (!await showConfirmToast(`${nonRenseignes.length} article(s) non renseignés. Valider quand même ?`)) return;
        }
    }

    const details = items.map(item => {
        const input    = item.querySelector('.qty-input');
        const required = parseInt(item.dataset.required, 10);
        const counted  = input.value !== '' ? parseInt(input.value, 10) : null;
        const name     = item.querySelector('.comp-name').textContent;
        return { nom: name, quantite_requise: required, quantite_comptee: counted };
    });

    try {
        await updateDoc(doc(db, "emplacements", currentEmpId), {
            statut_conformite:     statut,
            derniere_verification: new Date().toISOString(),
            verificateur_email:    auth.currentUser?.email || 'inconnu',
            detail_verification:   details
        });

        showToast(`✅ Statut « ${statut} » enregistré.`, 'success');
        setTimeout(() => {
            currentEmpId = '';
            currentKitId = '';
            inputEmp.value = '';
            afficherVueListe();
            chargerListeKits(); // rafraîchit : le kit disparaît si conforme
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
    histoList.innerHTML    = '';
    histoLoading.classList.remove('hidden');
    histoEmpty.classList.add('hidden');

    try {
        const snap = await getDocs(collection(db, "emplacements"));
        histoData = [];

        snap.forEach(d => {
            const data = d.data();
            if (data.derniere_verification) {
                histoData.push({ id: d.id, ...data });
            }
        });

        histoData.sort((a, b) =>
            new Date(b.derniere_verification) - new Date(a.derniere_verification)
        );

        renderHistorique(histoData);

    } catch (err) {
        histoLoading.classList.add('hidden');
        histoEmpty.textContent = '⚠️ Erreur de chargement : ' + err.message;
        histoEmpty.classList.remove('hidden');
    }
}

function renderHistorique(liste) {
    histoLoading.classList.add('hidden');
    histoList.innerHTML = '';

    const filterVal  = histoFilter?.value  || 'tous';
    const searchVal  = (histoSearch?.value || '').trim().toUpperCase();

    const filtered = liste.filter(emp => {
        const matchSearch = !searchVal ||
            emp.id.includes(searchVal) ||
            (emp.id_kit_stocke || '').toUpperCase().includes(searchVal);
        const matchFilter = filterVal === 'tous' || emp.statut_conformite === filterVal;
        return matchSearch && matchFilter;
    });

    if (!filtered.length) {
        histoEmpty.classList.remove('hidden');
        histoEmpty.textContent = 'Aucun résultat trouvé.';
        return;
    }

    histoEmpty.classList.add('hidden');

    filtered.forEach(emp => {
        const date = emp.derniere_verification
            ? new Date(emp.derniere_verification).toLocaleString('fr-FR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            : '—';

        const statut   = emp.statut_conformite || 'Non vérifié';
        const isOk     = statut === 'Conforme';
        const isKo     = statut === 'Incomplet';

        const detail   = emp.detail_verification || [];
        const manquants = detail.filter(c =>
            c.quantite_comptee !== null &&
            c.quantite_comptee !== c.quantite_requise
        );

        const verificateur = emp.verificateur_email || '—';

        const idParts  = emp.id_kit_stocke ? emp.id_kit_stocke.split('_') : [];
        const enginTag = idParts.length >= 2
            ? `<span class="histo-engin">${idParts[0]}</span>`
            : '';

        const row = document.createElement('div');
        row.className = `histo-item ${isOk ? 'histo-ok' : isKo ? 'histo-ko' : ''}`;
        row.innerHTML = `
            <div class="histo-main">
                <div class="histo-left">
                    <span class="histo-badge ${isOk ? 'badge-ok' : isKo ? 'badge-ko' : 'badge-neutral'}">
                        ${isOk ? '✅' : isKo ? '⚠️' : '—'} ${statut}
                    </span>
                    <div class="histo-ids">
                        <span class="histo-emp">${emp.id}</span>
                        <div class="histo-kit-row">
                            ${enginTag}
                            <span class="histo-kit">${emp.id_kit_stocke || '—'}</span>
                        </div>
                    </div>
                </div>
                <div class="histo-meta">
                    <span class="histo-date">🕒 ${date}</span>
                    <span class="histo-agent">👤 ${verificateur}</span>
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

dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
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
    adminStatus.className = `admin-status ${type}`;
}

async function traiterFichier(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        setStatus('Format invalide. Utilisez .xlsx ou .csv uniquement.', 'error');
        return;
    }

    progressArea.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressLabel.textContent = 'Lecture du fichier…';
    setStatus('Analyse du fichier en cours…', 'info');

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onerror = () => setStatus('Impossible de lire le fichier.', 'error');

    reader.onload = async e => {
        try {
            const wb     = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const sheet  = wb.Sheets[wb.SheetNames[0]];
            const lignes = XLSX.utils.sheet_to_json(sheet);

            if (!lignes.length) throw new Error("Aucune donnée exploitable dans le fichier.");

            setStatus('Lecture des kits existants sur Firebase…', 'info');
            const snap = await getDocs(collection(db, "nomenclature_kits"));
            const kitsExistants = new Set(snap.docs.map(d => d.id));

            const kitsIndex = {};
            lignes.forEach(l => {
                const row = {};
                Object.keys(l).forEach(k => { row[k.trim()] = l[k]; });

                const engin      = String(row['Engin']            || row['engin']           || '').trim();
                const codeKit    = String(row['Code kit']         || row['code_kit']        || row['Code_kit'] || '').trim();
                const nomKit     = String(row['designations kit'] || row['designation_kit'] || row['nom_kit']  || 'Kit sans nom').trim();
                const emplacement= String(row['emplacement']      || row['Emplacement']     || '').trim();
                const nomComp    = String(row['designation article'] || row['designations article'] || row['composant'] || '').trim();
                const quantite   = Number(row['quantite'] || row['Quantite'] || row['quantité'] || 1);

                if (!engin || !codeKit) return;

                const id = `${engin}_${codeKit}`;

                if (!kitsIndex[id]) {
                    kitsIndex[id] = {
                        engin,
                        code_kit:              codeKit,
                        nom_du_kit:            nomKit,
                        emplacement_theorique: emplacement || 'Non assigné',
                        composants: []
                    };
                }
                if (nomComp) {
                    kitsIndex[id].composants.push({
                        nom:              nomComp,
                        quantite_requise: quantite || 1
                    });
                }
            });

            const nouveauxIds = Object.keys(kitsIndex).filter(id => !kitsExistants.has(id));
            const ignores     = Object.keys(kitsIndex).length - nouveauxIds.length;
            const total       = nouveauxIds.length;

            if (!total) {
                progressArea.classList.add('hidden');
                setStatus(`Rien à importer : les ${ignores} kit(s) du fichier existent déjà.`, 'info');
                return;
            }

            let ecrits = 0;
            for (const idKit of nouveauxIds) {
                const data = kitsIndex[idKit];
                await setDoc(doc(db, "nomenclature_kits", idKit), data);

                if (data.emplacement_theorique !== 'Non assigné') {
                    await setDoc(
                        doc(db, "emplacements", data.emplacement_theorique),
                        {
                            id_kit_stocke:        idKit,
                            statut_conformite:    "Non vérifié",
                            derniere_mise_a_jour: new Date().toISOString()
                        },
                        { merge: true }
                    );
                }

                ecrits++;
                const pct = Math.round((ecrits / total) * 100);
                progressBar.style.width = pct + '%';
                progressLabel.textContent = `${ecrits} / ${total} kits traités…`;
                setStatus(`Import en cours… ${pct}%`, 'info');
            }

            progressBar.style.width = '100%';
            setStatus(
                `✅ Import terminé. ${ecrits} kit(s) ajouté(s)${ignores ? `, ${ignores} ignoré(s) car déjà présent(s)` : ''}.`,
                'success'
            );

        } catch (err) {
            console.error(err);
            setStatus('❌ Échec de l\'import : ' + err.message, 'error');
        } finally {
            fileInput.value = '';
        }
    };
}

// ─── TOGGLE MOT DE PASSE ──────────────────────────────────────────────────────
document.getElementById('toggle-pwd').addEventListener('click', () => {
    const isPassword = loginPwd.type === 'password';
    loginPwd.type = isPassword ? 'text' : 'password';
    document.getElementById('toggle-pwd').textContent = isPassword ? '🙈' : '👁';
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOASTS
// ═══════════════════════════════════════════════════════════════════════════════

function showConfirmToast(message) {
    return new Promise(resolve => {
        const existing = document.getElementById('custom-toast');
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

        const remove = (val) => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
            resolve(val);
        };

        toast.querySelector('.toast-cancel').addEventListener('click',  () => remove(false));
        toast.querySelector('.toast-confirm').addEventListener('click', () => remove(true));
    });
}

function showToast(message, type = 'info') {
    const existing = document.getElementById('simple-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'simple-toast';
    toast.className = `simple-toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ─── INIT : charger la liste au démarrage (une fois authentifié) ───────────────
onAuthStateChanged(auth, user => {
    if (user) chargerListeKits();
});
