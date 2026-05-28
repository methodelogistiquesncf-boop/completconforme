// ─────────────────────────────────────────────────────────────────────────────
// modules/auth.js — Connexion, déconnexion, état utilisateur
// ─────────────────────────────────────────────────────────────────────────────
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { auth }                    from "./firebase.js";
import { $, showConfirmToast }     from "./utils.js";

// ─── Callbacks injectés par app.js ────────────────────────────────────────────
let _onLogin  = () => {};
let _onLogout = () => {};

export function setAuthCallbacks({ onLogin, onLogout }) {
    _onLogin  = onLogin  || _onLogin;
    _onLogout = onLogout || _onLogout;
}

// ─── Déconnexion automatique par inactivité ───────────────────────────────────
const INACTIVITY_DELAY = 59 * 60 * 1000;
let _inactivityTimer   = null;

function _resetInactivityTimer() {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = setTimeout(async () => {
        await signOut(auth);
        const err = $('login-error');
        if (err) {
            err.textContent = "Session expirée pour inactivité.";
            err.classList.add('visible');
        }
    }, INACTIVITY_DELAY);
}

function _startInactivityWatcher() {
    ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(evt =>
        document.addEventListener(evt, _resetInactivityTimer, { passive: true })
    );
    _resetInactivityTimer();
}

function _stopInactivityWatcher() {
    clearTimeout(_inactivityTimer);
    ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(evt =>
        document.removeEventListener(evt, _resetInactivityTimer)
    );
}

// ─── Surveillance état auth ───────────────────────────────────────────────────
export function initAuth() {
    onAuthStateChanged(auth, user => {
        if (user) {
            _showApp(user);
            _startInactivityWatcher();
            _onLogin(user);
        } else {
            _showLogin();
            _stopInactivityWatcher();
            _onLogout();
        }
    });

    $('btn-login').addEventListener('click', _handleLogin);

    [$('login-email'), $('login-pwd')].forEach(el =>
        el?.addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-login').click(); })
    );

    $('btn-logout').addEventListener('click', async () => {
        if (await showConfirmToast("Se déconnecter ?")) signOut(auth);
    });

    $('toggle-pwd')?.addEventListener('click', () => {
        const pwd = $('login-pwd');
        const isPassword = pwd.type === 'password';
        pwd.type = isPassword ? 'text' : 'password';
        $('toggle-pwd').textContent = isPassword ? '🙈' : '👁';
    });

    $('btn-forgot-pwd')?.addEventListener('click', _handleForgotPassword);
}

// ─── QR Code partage ──────────────────────────────────────────────────────────
let _qrGenerated = false;

window.toggleQR = function () {
    const panel  = document.getElementById('qr-panel');
    const toggle = document.getElementById('qr-toggle');
    const open   = panel.classList.toggle('show');
    toggle.classList.toggle('active', open);

    if (open && !_qrGenerated) {
        new QRCode(document.getElementById('qr-code'), {
            text:         "https://methodelogistiquesncf-boop.github.io/completconforme/",
            width:        100,
            height:       100,
            colorDark:    "#151c2c",
            colorLight:   "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        _qrGenerated = true;
    }
};

// ─── Handlers privés ──────────────────────────────────────────────────────────
async function _handleLogin() {
    const email = $('login-email').value.trim();
    const pwd   = $('login-pwd').value;
    if (!email || !pwd) { _showLoginError("Veuillez remplir tous les champs."); return; }

    const btn = $('btn-login');
    btn.disabled    = true;
    btn.textContent = "Connexion…";
    $('login-error').classList.remove('visible');
    $('forgot-success')?.classList.remove('visible');

    try {
        await signInWithEmailAndPassword(auth, email, pwd);
    } catch (err) {
        _showLoginError(_firebaseAuthMessage(err.code));
    } finally {
        btn.disabled    = false;
        btn.textContent = "Se connecter →";
    }
}

async function _handleForgotPassword() {
    const email = $('login-email').value.trim();

    if (!email) {
        _showLoginError("Entrez votre adresse e-mail ci-dessus.");
        return;
    }

    const btn = $('btn-forgot-pwd');
    btn.disabled    = true;
    btn.textContent = "Envoi…";
    $('login-error').classList.remove('visible');

    try {
        await sendPasswordResetEmail(auth, email);
        const ok = $('forgot-success');
        if (ok) {
            ok.textContent = `✅ E-mail envoyé à ${email}. Vérifiez votre boîte.`;
            ok.classList.add('visible');
        }
    } catch (err) {
        _showLoginError(_firebaseAuthMessage(err.code));
    } finally {
        btn.disabled    = false;
        btn.textContent = "Mot de passe oublié ?";
    }
}

function _showLogin() {
    $('login-page').style.display = 'flex';
    $('app').classList.remove('visible');
    $('login-email').value = '';
    $('login-pwd').value   = '';
    $('login-error').classList.remove('visible');
    $('forgot-success')?.classList.remove('visible');
}

function _showApp(user) {
    $('login-page').style.display = 'none';
    $('app').classList.add('visible');
    const chip = $('header-user');
    if (chip) {
        chip.textContent = user.email.charAt(0).toUpperCase();
        chip.title       = user.email;
    }
}

function _showLoginError(msg) {
    const el = $('login-error');
    el.textContent = msg;
    el.classList.add('visible');
}

function _firebaseAuthMessage(code) {
    const map = {
        'auth/invalid-email':          "Adresse e-mail invalide.",
        'auth/user-not-found':         "Aucun compte trouvé pour cet e-mail.",
        'auth/wrong-password':         "Mot de passe incorrect.",
        'auth/too-many-requests':      "Trop de tentatives. Réessayez plus tard.",
        'auth/network-request-failed': "Erreur réseau. Vérifiez votre connexion.",
        'auth/invalid-credential':     "Identifiants invalides.",
    };
    return map[code] || `Erreur de connexion (${code}).`;
}
