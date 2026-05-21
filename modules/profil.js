// ─────────────────────────────────────────────────────────────────────────────
// modules/profil.js — Affichage du profil, changement de mot de passe
// ─────────────────────────────────────────────────────────────────────────────
import {
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { auth } from "./firebase.js";
import { $ }    from "./utils.js";

// ─── Init & câblage ───────────────────────────────────────────────────────────
export function initProfil() {
    $('pwd-new')?.addEventListener('input', _updateStrengthBar);
    $('btn-change-pwd')?.addEventListener('click', _changerMotDePasse);
}

// ─── Affichage profil ─────────────────────────────────────────────────────────
export function afficherProfil() {
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
        ? new Date(lastLogin).toLocaleString('fr-FR', {
            day:'2-digit', month:'2-digit', year:'numeric',
            hour:'2-digit', minute:'2-digit',
          })
        : '—';

    // Réinitialise le formulaire
    ['pwd-current', 'pwd-new', 'pwd-confirm'].forEach(id => {
        const el = $(id); if (el) el.value = '';
    });
    $('pwd-change-error')?.classList.remove('visible');
    $('pwd-change-success')?.classList.remove('visible');
    $('pwd-strength-wrap')?.classList.remove('visible');
    const fill = $('pwd-strength-fill');
    if (fill)  fill.className = 'pwd-strength-fill';
    const lbl  = $('pwd-strength-label');
    if (lbl)   lbl.textContent = '';
}

// ─── Barre de force du mot de passe ──────────────────────────────────────────
function _updateStrengthBar() {
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
}

// ─── Changement de mot de passe ───────────────────────────────────────────────
async function _changerMotDePasse() {
    const currentPwd = $('pwd-current').value;
    const newPwd     = $('pwd-new').value;
    const confirmPwd = $('pwd-confirm').value;
    const errEl      = $('pwd-change-error');
    const okEl       = $('pwd-change-success');

    errEl.classList.remove('visible');
    okEl.classList.remove('visible');

    if (!currentPwd || !newPwd || !confirmPwd)
        return _showPwdError(errEl, 'Veuillez remplir tous les champs.');
    if (newPwd !== confirmPwd)
        return _showPwdError(errEl, 'Les nouveaux mots de passe ne correspondent pas.');
    if (newPwd.length < 6)
        return _showPwdError(errEl, 'Le nouveau mot de passe doit contenir au moins 6 caractères.');
    if (newPwd === currentPwd)
        return _showPwdError(errEl, "Le nouveau mot de passe doit être différent de l'actuel.");

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
        _showPwdError(errEl, messages[err.code] || `Erreur : ${err.message}`);
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Modifier le mot de passe →';
    }
}

function _showPwdError(el, msg) {
    el.textContent = msg;
    el.classList.add('visible');
}
