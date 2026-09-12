// sw.js - Service Worker (Vite + Offline Support)

// تحديث الإصدار لفرض التغييرات الجديدة فوراً
const CACHE_NAME = 'masar-cache-v11';

// الملفات الثابتة فقط (Vite يغيّر أسماء JS/CSS عند كل build)
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
  './offline.html'
];

// 1. مرحلة التثبيت (Install)
self.addEventListener('install', (event) => {
  self.skipWaiting(); // تفعيل التحديث فوراً
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // تخزين الملفات المحلية فقط
      return Promise.all(
        urlsToCache.map(url => cache.add(url).catch(e => console.warn('Skipped:', url)))
      );
    })
  );
});

// 2. مرحلة التفعيل (Activate) - تنظيف الكاش القديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('🧹 Cleaning old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. مرحلة الجلب (Fetch)
self.addEventListener('fetch', (event) => {
  // تجاهل أي طلب ليس بروتوكول HTTP/HTTPS
  if (!event.request.url.startsWith('http')) return;

  const requestUrl = new URL(event.request.url);

  // أ) إذا كان الطلب لرابط خارجي (مثل Tailwind, Firebase, Fonts) -> اتركه للشبكة ولا تتدخل
  // هذا يحل مشكلة CORS واللون الأحمر في الكونسول
  if (requestUrl.origin !== location.origin) {
    return;
  }

  // ب) الملفات الأساسية للموقع (HTML, JS) -> استراتيجية Network First
  // نحاول جلب النسخة الأحدث من النت، لو فشل نجيب من الكاش
  if (event.request.destination === 'document' || event.request.destination === 'script') {
    event.respondWith(
      fetch(event.request)
        .then((networkRes) => {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          return networkRes;
        })
        .catch(() => {
          return caches.match(event.request).then(cached => {
            return cached || caches.match('./offline.html');
          });
        })
    );
    return;
  }

  // ب2) ملفات الستايل (CSS) -> استراتيجية Stale-While-Revalidate
  // نعرض من الكاش فوراً ونحدّث في الخلفية
  if (event.request.destination === 'style') {
    event.respondWith(
      caches.match(event.request).then((cachedRes) => {
        const fetchPromise = fetch(event.request).then((networkRes) => {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          return networkRes;
        }).catch(() => cachedRes);
        return cachedRes || fetchPromise;
      })
    );
    return;
  }

  // ج) باقي الملفات المحلية (صور، أيقونات) -> استراتيجية Cache First
  event.respondWith(
    caches.match(event.request).then((cachedRes) => {
      return cachedRes || fetch(event.request).then((networkRes) => {
        const resClone = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return networkRes;
      }).catch(() => {
        // إذا فشل كل شيء، أعرض صفحة أوفلاين
        if (event.request.destination === 'document') {
          return caches.match('./offline.html');
        }
      });
    })
  );
});

// ============================================================
// 4. Push Notifications - استقبال الإشعارات
// ============================================================
self.addEventListener('push', (event) => {
  console.log('📬 Push notification received');

  let data = {
    title: '🔔 مسار',
    body: 'لديك إشعار جديد!',
    icon: 'https://cdn-icons-png.flaticon.com/512/3413/3413535.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/3413/3413535.png',
    vibrate: [200, 100, 200],
    data: { url: './' }
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      vibrate: data.vibrate,
      data: data.data,
      tag: data.tag || 'nebras-notification',
      requireInteraction: true,
      actions: [
        { action: 'open', title: '👁️ فتح' },
        { action: 'close', title: '❌ إغلاق' }
      ]
    })
  );
});

// 5. معالجة النقر على الإشعار
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Notification clicked:', event.action);
  event.notification.close();

  if (event.action === 'close') return;

  const urlToOpen = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // إذا التطبيق مفتوح، فوكس عليه
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // إذا مش مفتوح، افتحه
      return clients.openWindow(urlToOpen);
    })
  );
});

// 6. Background Sync - مزامنة في الخلفية
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync triggered:', event.tag);

  if (event.tag === 'sync-messages') {
    event.waitUntil(syncPendingMessages());
  }
});

async function syncPendingMessages() {
  // يمكن استخدامها لإرسال رسائل معلقة عند عودة الاتصال
  console.log('📤 Syncing pending messages...');
}

// 7. Periodic Sync - مزامنة دورية
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-content') {
    event.waitUntil(refreshCache());
  }
});

async function refreshCache() {
  const cache = await caches.open(CACHE_NAME);
  const urls = ['./index.html', './main.js'];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      await cache.put(url, response);
    } catch (e) {
      console.log('Cache refresh failed for:', url);
    }
  }
}