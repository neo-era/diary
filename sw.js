/* Service worker cho app Nhật ký thi công.
 *
 * Chiến lược:
 *  - HTML  → MẠNG TRƯỚC. App sửa liên tục nên phải luôn lấy bản mới nhất;
 *            mất mạng mới rơi về cache. (Đừng đổi sang cache-first — sẽ dính
 *            đúng cái bẫy "sửa code mà trình duyệt vẫn chạy bản cũ".)
 *  - Ảnh, manifest, thư viện CDN → CACHE TRƯỚC, âm thầm cập nhật nền.
 *  - api.open-meteo.com → KHÔNG cache, luôn đi mạng (dữ liệu thời tiết sống).
 *
 * Đổi nội dung app xong nhớ tăng VERSION để cache cũ bị dọn.
 */
const VERSION = 'nktc-2026-08-19';
const SHELL = [
  './',
  './index.html',
  './huong-dan.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './apple-touch-icon.png',
];
const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // thêm từng cái một: thiếu 1 file không làm hỏng cả lần cài
    await Promise.all([...SHELL, CDN].map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (!/^https?:$/.test(url.protocol)) return;
  if (url.hostname.endsWith('open-meteo.com')) return;   // thời tiết: luôn đi mạng

  const isHTML = req.mode === 'navigate' || req.destination === 'document';

  if (isHTML) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put(req, res.clone());
        return res;
      } catch (_) {
        return (await caches.match(req)) ||
               (await caches.match('./index.html')) ||
               new Response('<h1>Không có mạng</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req);
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        caches.open(VERSION).then(c => c.put(req, res.clone())).catch(() => {});
      }
      return res;
    }).catch(() => null);
    return hit || (await net) || new Response('', { status: 504 });
  })());
});
