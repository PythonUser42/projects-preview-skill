const CACHE = 'mobile-desktop-preview-v9';
const CORE = ['./', './projects.html', './projects.css', './projects.js', './pwa.js', './preview.html', './preview.css', './preview.js', './manifest.webmanifest', './app-icon.svg', './app-icon-180.png', './app-icon-512.png'];
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => Promise.all(CORE.map(url =>
    fetch(new Request(url, {cache: 'reload'})).then(response => {
      if (!response.ok) throw new Error(`Unable to cache ${url}`);
      return cache.put(url, response);
    })
  ))).then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('mobile-desktop-preview-') && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim())
));
// Network first so installed previews receive fixes. Never cache target app data.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith('/__preview/') || (url.pathname.endsWith('/config.json') || url.pathname.endsWith('/projects.json'))) return;
  event.respondWith(fetch(event.request, {cache: 'no-cache'}).catch(async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(event.request, {ignoreSearch: true}) || Response.error();
  }));
});
