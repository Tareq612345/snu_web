// Firebase Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyDHy2Uq4RDsDkQKhYKRPijCUeWGfA_34YM",
    authDomain: "web54-f36f4.firebaseapp.com",
    projectId: "web54-f36f4",
    storageBucket: "web54-f36f4.firebasestorage.app",
    messagingSenderId: "771323059906",
    appId: "1:771323059906:web:fae9e7c24364589778655b",
    measurementId: "G-070FYEB76P"
});

const messaging = firebase.messaging();

// استقبال الإشعارات في الخلفية
messaging.onBackgroundMessage((payload) => {
    console.log('📩 Background message received:', payload);

    const notificationTitle = payload.notification?.title || 'منصة مسار';
    const notificationOptions = {
        body: payload.notification?.body || 'لديك إشعار جديد',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        vibrate: [200, 100, 200],
        tag: payload.data?.type || 'general',
        data: payload.data,
        actions: [
            { action: 'open', title: 'فتح' },
            { action: 'close', title: 'إغلاق' }
        ]
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// عند الضغط على الإشعار
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'close') return;

    // فتح التطبيق أو التوجيه للصفحة المناسبة
    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // لو التطبيق مفتوح، نفتح الصفحة فيه
            for (const client of windowClients) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    client.navigate(urlToOpen);
                    return;
                }
            }
            // لو مش مفتوح، نفتح نافذة جديدة
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

console.log('🔔 Firebase Messaging SW loaded');
