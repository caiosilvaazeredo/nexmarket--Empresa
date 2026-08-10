/*
 * Nexmarket Admin — minimal, SAFE service worker (makes the panel installable
 * as a PWA, RF: "tanto web quanto app").
 *
 * Strategy on purpose conservative for a realtime back-office:
 *   • App shell (navigations + local static assets) → network-first with a
 *     cached fallback so it opens offline.
 *   • Everything cross-origin (Firestore, Google APIs, map tiles) is NEVER
 *     intercepted — always hits the network so live data is never stale.
 */
/*
 * IMPORTANTE — suba este número a cada deploy que mude o app shell.
 *
 * O `activate` apaga todo cache com nome diferente do atual, então trocar a
 * versão é o que conserta automaticamente quem ficou com um `index.html`
 * antigo em cache (sintoma clássico: página abre sem CSS, porque o HTML
 * guardado aponta para um bundle que não existe mais).
 */
const CACHE = 'nex-admin-v3';

/*
 * Resposta de último recurso.
 *
 * `respondWith` exige um Response: se a promessa resolver para `undefined`, o
 * navegador aborta a navegação com "Failed to convert value to 'Response'" e
 * a página não abre — nem com a rede funcionando de volta. Era o que
 * acontecia num domínio recém-criado, onde ainda não há nada em cache para
 * servir de reserva.
 */
function offlineResponse() {
  return new Response(
    '<!doctype html><meta charset="utf-8">' +
      '<title>Sem conexão</title>' +
      '<div style="font:16px system-ui;padding:40px;text-align:center">' +
      '<h1 style="font-size:20px">Sem conexão</h1>' +
      '<p>Não foi possível carregar o painel. Verifique a internet e recarregue.</p>' +
      '</div>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

/*
 * O `index.html` NÃO entra no shell pré-cacheado de propósito: ele é o único
 * arquivo sem hash no nome e é justamente quem amarra os bundles do build.
 * Deixá-lo fora evita fixar uma versão velha; a navegação é network-first e
 * grava a resposta boa em `/` para o modo offline.
 */
const SHELL = ['/manifest.webmanifest', '/favicon.svg', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle our own origin; let Firebase / tiles / PSP go straight through.
  if (url.origin !== self.location.origin) return;

  // SPA navigations: network-first, fall back to cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          // Cada elo pode faltar — inclusive todos, num domínio novo. Sem o
          // `offlineResponse()` no fim, a cadeia resolveria para `undefined` e
          // o navegador derrubaria a navegação.
          const cached =
            (await caches.match('/')) || (await caches.match('/index.html'));
          return cached || offlineResponse();
        }),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  //
  // Só é seguro porque os bundles do Vite carregam hash no nome
  // (`index-C1mgQJ6u.css`): conteúdo novo = nome novo = nunca serve versão
  // velha. Uma resposta ruim (404/500 durante um deploy) jamais é guardada,
  // senão o erro ficaria grudado no cache.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        // Mesmo cuidado da navegação: sem cache e sem rede, `cached` é
        // `undefined` e devolvê-lo quebraria o `respondWith`.
        .catch(() => cached || offlineResponse());
      return cached || network;
    }),
  );
});
