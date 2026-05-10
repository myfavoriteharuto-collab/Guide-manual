const CACHE_NAME = 'nojima-v2';
const IMAGE_CACHE = 'nojima-images-v1';

// インストール時：即座に有効化
self.addEventListener('install', () => self.skipWaiting());

// 有効化時：古いキャッシュを削除
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys =>
    Promise.all(
      keys.filter(k => k !== CACHE_NAME && k !== IMAGE_CACHE).map(k => caches.delete(k))
    )
  ).then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // chrome-extension などは無視
  if (!url.protocol.startsWith('http')) return;

  // ① 画像 → キャッシュ優先（画像は変わりにくい）
  if (request.destination === 'image') {
    e.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // ② Supabase API → ネットワーク優先、キャッシュにも保存
  if (url.hostname.endsWith('.supabase.co')) {
    e.respondWith(networkFirstWithCache(request, CACHE_NAME));
    return;
  }

  // ③ ページ・JS・CSS → ネットワーク優先、キャッシュにも保存
  e.respondWith(networkFirstWithCache(request, CACHE_NAME));
});

// ネットワーク優先 → 成功したらキャッシュ更新 → 失敗したらキャッシュから返す
async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    // GETリクエストのみキャッシュに保存
    if (request.method === 'GET' && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached ?? new Response('offline', { status: 503 });
  }
}

// キャッシュ優先 → なければネットワークから取得してキャッシュ
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.status === 200) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}
