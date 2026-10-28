/* =====================================================================
   meiUM — service worker: torna o site disponível offline.
   - Na instalação guarda o site inteiro: os ficheiros base e todas as
     páginas das UCs registadas no catálogo (catalog.js).
   - Páginas, CSS e JS: primeiro a rede (para ver sempre a versão mais
     recente); se a rede falhar ou demorar mais de 4 s, a cópia guardada.
   - Fontes, KaTeX e imagens: primeiro a cache (quase nunca mudam).
   Ao acrescentar um tema ao catalog.js, o browser deteta a mudança
   (o catálogo é importado aqui) e volta a guardar o site.
   Para forçar uma atualização completa, muda VERSION.
   ===================================================================== */
const VERSION = 'v1';
const CACHE = 'meium-' + VERSION;

self.window = self;                 /* o catalog.js escreve em window.CATALOG */
importScripts('assets/js/catalog.js');

const PAGES = ['./', 'index.html'];
self.CATALOG.ucs.forEach(uc => {
  PAGES.push(`${uc.id}/index.html`);
  uc.topics.filter(t => t.status === 'ready').forEach(t => PAGES.push(`${uc.id}/${t.file}`));
});

const ASSETS = [
  'manifest.webmanifest',
  'assets/css/style.css', 'assets/css/fonts.css',
  'assets/js/catalog.js', 'assets/js/i18n.js', 'assets/js/app.js', 'assets/js/widgets.js',
  'assets/img/favicon.svg', 'assets/img/icon-192.png', 'assets/img/icon-512.png',
  /* fontes */
  'assets/fonts/archivo-latin-ext-wdth-normal.woff2',
  'assets/fonts/archivo-latin-wdth-normal.woff2',
  'assets/fonts/jetbrains-mono-latin-400-normal.woff2',
  'assets/fonts/jetbrains-mono-latin-600-normal.woff2',
  'assets/fonts/jetbrains-mono-latin-ext-400-normal.woff2',
  'assets/fonts/jetbrains-mono-latin-ext-600-normal.woff2',
  'assets/fonts/source-serif-4-latin-ext-opsz-italic.woff2',
  'assets/fonts/source-serif-4-latin-ext-opsz-normal.woff2',
  'assets/fonts/source-serif-4-latin-opsz-italic.woff2',
  'assets/fonts/source-serif-4-latin-opsz-normal.woff2',
  /* KaTeX */
  'assets/vendor/katex/katex.min.css', 'assets/vendor/katex/katex.min.js', 'assets/vendor/katex/contrib/auto-render.min.js',
  'assets/vendor/katex/fonts/KaTeX_AMS-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2',
  'assets/vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2',
  'assets/vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Main-Bold.woff2',
  'assets/vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2',
  'assets/vendor/katex/fonts/KaTeX_Main-Italic.woff2',
  'assets/vendor/katex/fonts/KaTeX_Main-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  'assets/vendor/katex/fonts/KaTeX_Math-Italic.woff2',
  'assets/vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2',
  'assets/vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2',
  'assets/vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Script-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Size2-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Size3-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Size4-Regular.woff2',
  'assets/vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll([...PAGES, ...ASSETS].map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('meium-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const STATIC = /\.(woff2|png|svg|ico)$|\/vendor\//;

function networkFirst(req) {
  return new Promise(resolve => {
    let done = false;
    const fromCache = () => caches.match(req, { ignoreSearch: true })
      .then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
    const timer = setTimeout(() => fromCache().then(r => { if (r && !done) { done = true; resolve(r); } }), 4000);
    fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      clearTimeout(timer);
      if (!done) { done = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      fromCache().then(r => { if (!done) { done = true; resolve(r || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })); } });
    });
  });
}

function cacheFirst(req) {
  return caches.match(req).then(r => r || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(STATIC.test(new URL(req.url).pathname) ? cacheFirst(req) : networkFirst(req));
});
