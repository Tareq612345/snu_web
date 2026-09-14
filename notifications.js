// ============================================================
// notifications.js - نظام الإشعارات Push Notifications
// ============================================================

import { db, auth } from './firebase.js';
import { doc, updateDoc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging.js";

// الـ vapidKey من Firebase Console
const VAPID_KEY = 'BJ9wbOiP-ezN2vjfM6nk-wW_1XX1AyNQtzZ4TBNHiM_ktspHz8Jk3M9voOHmP_HqutY_na-t9kV4yEf_9o0Tu1I';

let messaging = null;

// ============================================================
// تهيئة نظام الإشعارات
// ============================================================
export const initializeNotifications = async () => {
    // التحقق من دعم المتصفح
    if (!('Notification' in window)) {
        console.log('❌ المتصفح مش بيدعم الإشعارات');
        return false;
    }

    if (!('serviceWorker' in navigator)) {
        console.log('❌ المتصفح مش بيدعم Service Workers');
        return false;
    }

    try {
        // تسجيل الـ Service Worker
        const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        console.log('✅ Service Worker registered:', registration.scope);

        // تهيئة Firebase Messaging
        const { getApp } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js");
        messaging = getMessaging(getApp());

        // الاستماع للإشعارات في الـ foreground
        onMessage(messaging, (payload) => {
            console.log('📩 Foreground message:', payload);
            showInAppNotification(payload);
        });

        return true;
    } catch (err) {
        console.error('❌ Notification init error:', err);
        return false;
    }
};

// ============================================================
// طلب إذن الإشعارات وحفظ الـ token
// ============================================================
export const requestNotificationPermission = async () => {
    const user = auth.currentUser;
    if (!user) return null;

    try {
        const permission = await Notification.requestPermission();

        if (permission !== 'granted') {
            console.log('⚠️ المستخدم رفض الإشعارات');
            return null;
        }

        // الحصول على الـ token
        const token = await getToken(messaging, { vapidKey: VAPID_KEY });

        if (token) {
            console.log('🔔 FCM Token:', token);

            // حفظ الـ token في قاعدة البيانات
            await updateDoc(doc(db, "users", user.uid), {
                fcmToken: token,
                notificationsEnabled: true,
                tokenUpdatedAt: serverTimestamp()
            });

            window.showToast?.('✅ تم تفعيل الإشعارات بنجاح!', 'success');
            return token;
        }

        return null;
    } catch (err) {
        console.error('❌ Token error:', err);
        return null;
    }
};

// ============================================================
// إظهار إشعار داخل التطبيق (Foreground)
// ============================================================
const showInAppNotification = (payload) => {
    const title = payload.notification?.title || 'إشعار جديد';
    const body = payload.notification?.body || '';
    const type = payload.data?.type || 'info';

    // إنشاء عنصر الإشعار
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 z-[10000] animate-slide-in-right';
    notification.innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-2xl shadow-2xl border dark:border-surface-700 p-4 max-w-sm cursor-pointer hover:scale-105 transition" onclick="this.parentElement.remove()">
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center flex-shrink-0">
                    <i class="fas ${getNotificationIcon(type)} text-primary-600"></i>
                </div>
                <div class="flex-1">
                    <p class="font-bold dark:text-white text-sm">${title}</p>
                    <p class="text-xs text-surface-500 dark:text-surface-400 mt-1">${body}</p>
                </div>
                <button onclick="event.stopPropagation(); this.closest('.fixed').remove()" class="text-surface-400 hover:text-surface-600">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(notification);

    // إزالة بعد 5 ثواني
    setTimeout(() => notification.remove(), 5000);

    // تشغيل صوت
    try {
        const notifSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
        notifSound.volume = 0.3;
        notifSound.play();
    } catch (e) { }
};

const getNotificationIcon = (type) => {
    const icons = {
        'post': 'fa-newspaper',
        'id_card': 'fa-id-card',
        'support': 'fa-headset',
        'assignment': 'fa-tasks',
        'quiz': 'fa-question-circle',
        'new_content': 'fa-book',
        'info': 'fa-bell'
    };
    return icons[type] || icons['info'];
};

// ============================================================
// زرار طلب الإشعارات (للعرض في UI)
// ============================================================
window.askNotificationPermission = async () => {
    const btn = document.getElementById('enable-notifications-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    const token = await requestNotificationPermission();

    if (btn) {
        if (token) {
            btn.innerHTML = '<i class="fas fa-check"></i> الإشعارات مفعلة';
            btn.classList.remove('bg-primary-600');
            btn.classList.add('bg-accent-600');
        } else {
            btn.innerHTML = '<i class="fas fa-bell-slash"></i> تم رفض الإذن';
            btn.classList.remove('bg-primary-600');
            btn.classList.add('bg-red-600');
        }
        btn.disabled = true;
    }
};

// ============================================================
// التحقق من حالة الإشعارات
// ============================================================
export const checkNotificationStatus = async () => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
};

// ============================================================
// إرسال إشعار للمستخدمين (يُستخدم من الأدمن)
// ============================================================
export const sendNotificationToUsers = async (title, body, type, targetUsers = 'all') => {
    // هذه الدالة تحفظ الإشعار في Firestore
    // ثم Cloud Function (أو الأدمن) يرسل الإشعارات
    try {
        await setDoc(doc(db, "notifications_queue", Date.now().toString()), {
            title,
            body,
            type,
            targetUsers,
            sentBy: auth.currentUser?.email,
            createdAt: serverTimestamp(),
            status: 'pending'
        });
        return true;
    } catch (e) {
        console.error('Send notification error:', e);
        return false;
    }
};

