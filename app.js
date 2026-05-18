import { initializeApp }                          from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence,
         doc, setDoc, getDoc, getDocs,
         collection, updateDoc }                   from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }             from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  CONFIGURATION — Remplacez avec vos vraies coordonnées Firebase
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey:            "VOTRE_API_KEY",
    authDomain:        "VOTRE_PROJECT_ID.firebaseapp.com",
    projectId:         "VOTRE_PROJECT_ID",
    storageBucket:     "VOTRE_PROJECT_ID.appspot.com",
    messagingSenderId: "VOTRE_SENDER_ID",
    appId:             "VOTRE_APP_ID"
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

// ─── ADMIN PIN (section admin dans l'app) ────────────────────────────────────
const ADMIN_PIN = "1234";

// ─── ÉTAT GLOBAL ─────────────────────────────────────────────────────────────
let currentEmpId = "";
let currentKitId = "";

// ─── REFS DOM ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// Pages
const loginPage    = $('login-page');
const appEl        = $('app');

// Login form
const loginEmail   = $('login-email');
const loginPwd     = $('login-pwd');
const btnLogin     = $('btn-login');
const loginError   = $('login-error');
const btnLogout    = $('btn-logout');
const headerUser   = $('header-user');

// Tabs
const tabTerrain   = $('tab-terrain');
const tabAdmin     = $('tab-admin');
const secTerrain   = $('sec-terrain');
const secAdmin     = $('sec-admin');

// Terrain
const offlineBanner= $('offline-banner');
const inputEmp     = $('input-emplacement');
const btnVerifier  = $('btn-verifier');
const searchStatus = $('search-status');
const loadingCard  = $('loading-card');
const kitCard      = $('kit-card');
const compList     = $('comp-list');

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

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

// Observateur de session — affiche login ou app selon l'état
onAuthStateChanged(auth, user => {
    if (user) {
        showApp(user);
    } else {
        showLogin();
    }
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

// Connexion
btnLogin.addEventListener('click', async () => {
    const email = loginEmail.value.trim();
    const pwd   = loginPwd.value;

    if (!email || !pwd) {
        showLoginError("Veuillez remplir tous les champs.");
        return;
    }

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

// Permettre la touche Entrée sur les champs de login
[loginEmail, loginPwd].forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') btnLogin.click(); });
});

// Déconnexion
btnLogout.addEventListener('click', () => {
    if (confirm("Se déconnecter ?")) signOut(auth);
});

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.add('visible');
}

// Messages Firebase lisibles en français
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
// OFFLINE DETECTION
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

tabTerrain.addEventListener('click', () => showTab('terrain'));
tabAdmin.addEventListener('click',   () => showTab('admin'));

function showTab(tab) {
    const isTerrain = tab === 'terrain';
    tabTerrain.classList.toggle('active', isTerrain);
    tabAdmin.classList.toggle('active', !isTerrain);
    secTerrain.classList.toggle('hidden', !isTerrain);
    secAdmin.classList.toggle('hidden', isTerrain);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIQUE TERRAIN
// ═══════════════════════════════════════════════════════════════════════════════

btnVerifier.addEventListener('click', chargerEmplacement);
inputEmp.addEventListener('keydown', e => { if (e.key === 'Enter') chargerEmplacement(); });

async function chargerEmplacement() {
    const empId = inputEmp.value.trim().toUpperCase();
    if (!empId) return;

    kitCard.classList.add('hidden');
    searchStatus.textContent = '';
    loadingCard.classList.remove('hidden');
    btnVerifier.disabled = true;

    try {
        const empSnap = await getDoc(doc(db, "emplacements", empId));

        if (!empSnap.exists() || !empSnap.data().id_kit_stocke) {
            throw new Error(`Emplacement « ${empId} » vide ou inconnu.`);
        }

        currentEmpId = empId;
        currentKitId = empSnap.data().id_kit_stocke;

        const kitSnap = await getDoc(doc(db, "nomenclature_kits", currentKitId));
        if (!kitSnap.exists()) {
            throw new Error(`Fiche technique du kit « ${currentKitId} » introuvable.`);
        }

        afficherKit(currentKitId, kitSnap.data(), empId);

    } catch (err) {
        searchStatus.textContent = '⚠️ ' + err.message;
    } finally {
        loadingCard.classList.add('hidden');
        btnVerifier.disabled = false;
    }
}

function afficherKit(idKit, data, empId) {
    $('kit-badge').textContent = idKit;
    $('kit-nom').textContent   = data.nom_du_kit;
    $('kit-emp').textContent   = empId;

    compList.innerHTML = '';
    data.composants.forEach((comp, idx) => {
        const item = document.createElement('div');
        item.className = 'comp-item';
        item.dataset.idx = idx;
        item.innerHTML = `
            <div class="comp-left">
                <div class="comp-checkbox-visual">
                    <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                        <path d="M1 4L4.5 7.5L11 1" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <span class="comp-name">${comp.nom}</span>
            </div>
            <span class="comp-qty">× ${comp.quantite_requise}</span>
        `;
        item.addEventListener('click', () => item.classList.toggle('checked'));
        compList.appendChild(item);
    });

    kitCard.classList.remove('hidden');
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────

$('btn-conforme').addEventListener('click',  () => valider("Conforme"));
$('btn-incomplet').addEventListener('click', () => valider("Incomplet"));

async function valider(statut) {
    if (!currentEmpId) return;

    if (statut === "Conforme") {
        const items     = compList.querySelectorAll('.comp-item');
        const toutCoche = [...items].every(i => i.classList.contains('checked'));
        if (!toutCoche && !confirm("Certains composants ne sont pas cochés. Valider quand même comme conforme ?")) return;
    }

    try {
        await updateDoc(doc(db, "emplacements", currentEmpId), {
            statut_conformite:    statut,
            derniere_verification: new Date().toISOString()
        });

        alert(`✅ Statut « ${statut} » enregistré.`);

        kitCard.classList.add('hidden');
        inputEmp.value = '';
        searchStatus.textContent = '';
        currentEmpId = '';
        currentKitId = '';
        inputEmp.focus();

    } catch (err) {
        alert('Erreur d\'enregistrement : ' + err.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIQUE ADMIN — AUTH PIN
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
// LOGIQUE ADMIN — IMPORT EXCEL
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
                const id = String(l.id_kit || '').trim();
                if (!id) return;
                if (!kitsIndex[id]) {
                    kitsIndex[id] = {
                        nom_du_kit:            String(l.nom_kit || 'Kit sans nom').trim(),
                        emplacement_theorique: String(l.emplacement || '').trim() || 'Non assigné',
                        composants: []
                    };
                }
                const nomComp = String(l.composant || '').trim();
                if (nomComp) {
                    kitsIndex[id].composants.push({
                        nom:              nomComp,
                        quantite_requise: Number(l.quantite) || 1
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
