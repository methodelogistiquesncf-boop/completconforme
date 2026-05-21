// ─────────────────────────────────────────────────────────────────────────────
// modules/firebase.js — Configuration, initialisation, helper token
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    doc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ─── Config ──────────────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey:            "AIzaSyAkhB59fG7oNtRfhb_0xeuW9PYmaUT9KRk",
    authDomain:        "completconforme.firebaseapp.com",
    projectId:         "completconforme",
    storageBucket:     "completconforme.firebasestorage.app",
    messagingSenderId: "595620033926",
    appId:             "1:595620033926:web:64dcfd0b141040146a2807",
};

// ─── Init ─────────────────────────────────────────────────────────────────────
export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);

let _db;
try {
    _db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    console.log("[Offline] Cache activé (multi-onglets).");
} catch (err) {
    console.warn("[Offline] Persistance indisponible :", err.message);
    _db = getFirestore(app);
}
export const db = _db;

// ─── Constante token ─────────────────────────────────────────────────────────
export const FIRESTORE_SECRET = {
    col:   "config",
    doc:   "secrets",
    field: "github_token",
};

// ─── Helper ───────────────────────────────────────────────────────────────────
/** Lit et retourne le PAT GitHub stocké dans Firestore. */
export async function lireToken() {
    const snap = await getDoc(doc(db, FIRESTORE_SECRET.col, FIRESTORE_SECRET.doc));
    if (!snap.exists()) throw new Error("Aucun token configuré. Enregistrez-en un d'abord.");
    const token = snap.data()[FIRESTORE_SECRET.field];
    if (!token)  throw new Error("Champ token vide dans Firestore.");
    return token;
}
