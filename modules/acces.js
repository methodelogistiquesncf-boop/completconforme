import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db, auth } from "./firebase.js";

const MODULES = ['terrain', 'reprises', 'historique', 'stats', 'admin'];
let _cache = null;

// Charge et met en cache toute la config d'accès
export async function chargerAcces() {
    const snap = await getDoc(doc(db, "config", "acces_modules"));
    _cache = snap.exists() ? snap.data() : {};
    return _cache;
}

// Vérifie si l'utilisateur courant a accès à un module
export function aAcces(module) {
    if (!_cache) return false;
    const email = auth.currentUser?.email;
    if (!email) return false;
    return !!_cache[email]?.[module];
}

// Sauvegarde toute la config depuis le panneau admin
export async function sauvegarderAcces(config) {
    await setDoc(doc(db, "config", "acces_modules"), config);
    _cache = config;
}

export { MODULES };
