// ═══════════════════════════════════════════════════════════════════════════════
// COMPLET CONFORME — Service Worker
// Stratégie :
//   • Assets statiques (HTML/CSS/JS/fonts) → Cache First
//   • Firebase / API réseau               → Network Only (jamais mis en cache)
//   • Navigation (pages)                  → Network First, fallback cache
// ═══════════════════════════════════════════════════════════════════════════════

const CACHE_NAME    = 'completconforme-v1';
const CACHE_OFFLINE = 'completconforme-offline-v1';

// Assets à précacher à l'installation
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    // XLSX lib (CDN — sera mise en cache dynamiquement à la première visite)
];

// Domaines à ne jamais intercepter (Firebase, auth, API)
const NETWORK_ONLY_PATTERNS = [
    'firestore.googleapis.com',
    'firebase.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firebasestorage.googleapis.com',
    'www.googleapis.com',
    'accounts.google.com',
    'cloudfunctions.net',
];

// ─── INSTALL ─────────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())   // Activation immédiate sans attendre fermeture des onglets
    );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME && key !== CACHE_OFFLINE)
                    .map(key => {
                        console.log('[SW] Suppression ancien cache :', key);
                        return caches.delete(key);
                    })
            )
        ).then(() => self.clients.claim())    // Prend le contrôle de tous les onglets ouverts
    );
});

// ─── FETCH ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Ne jamais intercepter Firebase / Google APIs
    if (NETWORK_ONLY_PATTERNS.some(pattern => url.hostname.includes(pattern))) {
        return; // Laisse le navigateur gérer directement
    }

    // 2. Ne jamais intercepter les requêtes POST/PUT/DELETE (écriture Firestore)
    if (request.method !== 'GET') return;

    // 3. Fonts Google → Cache First (longue durée)
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(cacheFirst(request));
        return;
    }

    // 4. CDN statiques (XLSX, etc.) → Cache First
    if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'www.gstatic.com') {
        event.respondWith(cacheFirst(request));
        return;
    }

    // 5. Navigation (HTML pages) → Network First, fallback vers index.html en cache
    if (request.mode === 'navigate') {
        event.respondWith(networkFirstWithFallback(request));
        return;
    }

    // 6. Assets locaux (CSS, JS, images) → Cache First
    if (url.origin === self.location.origin) {
        event.respondWith(cacheFirst(request));
        return;
    }
});

// ─── STRATÉGIES ──────────────────────────────────────────────────────────────

/**
 * Cache First : cherche dans le cache, sinon réseau puis mise en cache.
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Ressource indisponible hors-ligne.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
}

/**
 * Network First : essaie le réseau, met à jour le cache, fallback vers cache.
 * En cas d'échec réseau total → sert index.html (SPA fallback).
 */
async function networkFirstWithFallback(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request)
                    || await caches.match('/index.html')
                    || await caches.match('/');
        if (cached) return cached;

        return new Response(
            `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
             <title>Hors-ligne</title></head><body style="font-family:sans-serif;padding:2rem">
             <h2>⚠️ Vous êtes hors-ligne</h2>
             <p>Reconnectez-vous à Internet pour accéder à Complet Conforme.</p>
             </body></html>`,
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }
}

// ─── MESSAGES (mise à jour manuelle depuis l'app) ─────────────────────────────

self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
