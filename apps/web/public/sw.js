// Service worker de l'application des fidèles (portée /app/).
// - Fichiers de l'interface (/_next/static) : servis depuis le cache, ils ne changent jamais à URL égale.
// - Pages : réseau d'abord ; hors connexion, la dernière version vue ou la page « hors ligne ».
// - Données (/api) : jamais mises en cache ici (elles sont personnelles et changent souvent).
// - Notifications push : affichage et ouverture de l'écran visé.

const VERSION = 'v1'
const SHELL = `cepca-shell-${VERSION}`
const PAGES = `cepca-pages-${VERSION}`
const STATIC = 'cepca-static'
const OFFLINE_URL = '/app/hors-ligne'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll([OFFLINE_URL, '/icons/icon-192.png', '/icons/badge-96.png']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, PAGES, STATIC, 'cepca-sermons'])
      for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, STATIC))
    return
  }
  if (req.mode === 'navigate' && (url.pathname === '/app' || url.pathname.startsWith('/app/'))) {
    event.respondWith(pageNetworkFirst(req))
  }
})

async function cacheFirst(req, name) {
  const cache = await caches.open(name)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) cache.put(req, res.clone())
  return res
}

async function pageNetworkFirst(req) {
  const cache = await caches.open(PAGES)
  try {
    const res = await fetch(req)
    if (res.ok && res.type === 'basic') cache.put(req, res.clone())
    return res
  } catch {
    return (await cache.match(req)) || (await caches.match(OFFLINE_URL)) || Response.error()
  }
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'CEPCA', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'CEPCA', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag,
      data: { url: data.url || '/app/notifications' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/app', self.location.origin).href
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        if (new URL(w.url).pathname.startsWith('/app')) {
          await w.focus()
          return w.navigate(target)
        }
      }
      return self.clients.openWindow(target)
    })(),
  )
})
