// ═══════════════════════════════════════════════════════════════════════════════
// COMPLET CONFORME — Service Worker
// ═══════════════════════════════════════════════════════════════════════════════

const CACHE_NAME = 'completconforme-v1.8'; // ← bump pour invalider l'ancien cache

const PRECACHE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icons/favicon-16x16.png',
    './icons/favicon-32x32.png',
    './icons/apple-touch-icon.png',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png',
];

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
        caches.open(CACHE_NAME).then(cache =>
            Promise.allSettled(
                PRECACHE_ASSETS.map(url =>
                    cache.add(url).catch(err =>
                        console.warn('[SW] Précache ignoré :', url, err.message)
                    )
                )
            )
        )
        // plus de skipWaiting ici
    );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => {
                    console.log('[SW] Suppression ancien cache :', k);
                    return caches.delete(k);
                })
            ))
            .then(() => self.clients.claim())
    );
});

// ─── FETCH ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Firebase / Google → jamais intercepté
    if (NETWORK_ONLY_PATTERNS.some(p => url.hostname.includes(p))) return;
    // Non-GET → jamais intercepté
    if (request.method !== 'GET') return;

    // Fonts Google
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(cacheFirst(request)); return;
    }
    // CDN (xlsx, firebase SDK gstatic)
    if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'www.gstatic.com') {
        event.respondWith(cacheFirst(request)); return;
    }
    // Navigation HTML
    if (request.mode === 'navigate') {
        event.respondWith(networkFirstWithFallback(request)); return;
    }
    // Assets locaux
    if (url.origin === self.location.origin) {
        event.respondWith(cacheFirst(request)); return;
    }
});

// ─── STRATÉGIES ──────────────────────────────────────────────────────────────

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
        return response;
    } catch {
        return new Response('Ressource indisponible hors-ligne.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

async function networkFirstWithFallback(request) {
    try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
        return response;
    } catch {
        return (
            await caches.match(request) ||
            await caches.match('./index.html') ||
            await caches.match('./') ||
            new Response(
                `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
                 <title>Hors-ligne</title></head>
                 <body style="font-family:sans-serif;padding:2rem;background:#F2EDE7">
                 <h2 style="color:#C0354A">⚠️ Hors-ligne</h2>
                 <p>Reconnectez-vous pour accéder à Complet Conforme.</p>
                 </body></html>`,
                { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            )
        );
    }
}

// ─── MESSAGES ────────────────────────────────────────────────────────────────

self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
