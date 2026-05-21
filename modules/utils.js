// ─────────────────────────────────────────────────────────────────────────────
// modules/utils.js — Helpers DOM, utilitaires de date, toasts
// ─────────────────────────────────────────────────────────────────────────────

// ─── DOM ──────────────────────────────────────────────────────────────────────
/** Raccourci getElementById */
export const $ = id => document.getElementById(id);

// ─── Constantes date ─────────────────────────────────────────────────────────
export const JOURS_COURTS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
export const MOIS_LONGS   = [
    'Janvier','Février','Mars','Avril','Mai','Juin',
    'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

// ─── Fonctions date ───────────────────────────────────────────────────────────
export function aujourd_hui() { return toIso(new Date()); }

export function toIso(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function fromIso(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function isoToDisplay(iso) {
    const d = fromIso(iso);
    return `${d.getDate()} ${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Retourne les 7 jours de la semaine (offset en semaines par rapport à aujourd'hui). */
export function getWeekDays(offset = 0) {
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

/** Numéro de semaine ISO. */
export function numSemaine(d) {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
}

/** Début et fin (exclus) de la semaine weeksAgo semaines en arrière. */
export function getWeekBounds(weeksAgo) {
    const now = new Date();
    const dow = now.getDay() || 7;
    const lun = new Date(now);
    lun.setDate(now.getDate() - dow + 1 - weeksAgo * 7);
    lun.setHours(0, 0, 0, 0);
    const fin = new Date(lun);
    fin.setDate(lun.getDate() + 7);
    return { start: lun, end: fin };
}

// ─── Toasts ───────────────────────────────────────────────────────────────────
/**
 * Toast de confirmation (Annuler / Confirmer).
 * Retourne une Promise<boolean>.
 */
export function showConfirmToast(message) {
    return new Promise(resolve => {
        $('custom-toast')?.remove();

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

/**
 * Toast simple (info / success / error).
 * @param {string} message
 * @param {'info'|'success'|'error'} type
 */
export function showToast(message, type = 'info') {
    $('simple-toast')?.remove();

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
