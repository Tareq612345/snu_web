// ============================================================
// main.js - المشغل الرئيسي (النسخة الكاملة: دمج القديم المستقر + ميزة الصيانة)
// ============================================================

import { initializeEvents } from './events.js';
import { setupAuthListener } from './auth.js';
// import { setupChatWidget } from './chat.js';
import { setupGroupChat } from './groupChat.js';
import { setupSupportSystem } from './support.js';
import { setupDMSystem } from './dm.js';
import { db, auth, SUPER_ADMIN_EMAIL } from './firebase.js';
import { doc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// استيراد أدوات الواجهة الجديدة
import { setupMobileMenu, setupThemeToggle, loadAnnouncementBar, showToast } from './ui.js';

// ============================================================
// Lazy Loading للموديولات الكبيرة (يتحملوا عند الحاجة فقط)
// ============================================================
// Admin module - يتحمل عند فتح لوحة التحكم
const loadAdminModule = () => import('./admin.js');
// CMS module - يتحمل عند إدارة المحتوى
const loadCMSModule = () => import('./cms.js');
// Quiz module - يتحمل عند فتح الكويزات
const loadQuizModule = () => import('./quiz.js');

// استيراد الملفات الأساسية (صغيرة)
import './features.js'; // Streaks, Bookmarks, Notes
import './gamification.js'; // XP, Levels, Achievements
import './analytics.js'; // Admin Analytics Dashboard
import './translation.js'; // Language System (AR/EN)
import './social.js'; // Profile, Follow, Block, Feed
import { initializeNotifications, checkNotificationStatus, requestNotificationPermission } from './notifications.js'; // Push Notifications
import './attendance.js'; // Attendance System (QR + GPS)
import './admin-stats.js'; // Statistics Dashboard (separated from admin.js)

// الموديولات الكبيرة تتحمل عند الحاجة فقط (lazy import)
// لا داعي لتحميلها مسبقاً - ده يوفر bandwidth للطلاب العاديين

// ============================================================
// 1. نظام الصيانة (Maintenance Mode) 🚧
// ============================================================
// هذه الدالة تعمل أولاً لمنع تحميل الموقع إذا كان في وضع الصيانة
const checkMaintenanceAndStart = async () => {
    try {
        const settingsSnap = await getDoc(doc(db, "system", "settings"));
        const isMaintenance = settingsSnap.exists() && settingsSnap.data().maintenanceMode;

        // إذا كان وضع الصيانة مفعل
        if (isMaintenance) {
            // التحقق من المستخدم الحالي
            const user = auth.currentUser;
            const isSuperAdmin = user && user.email === SUPER_ADMIN_EMAIL;

            // التحقق من القائمة البيضاء
            const whitelistEmails = settingsSnap.data().whitelistEmails || [];
            const isWhitelisted = user && whitelistEmails.includes(user.email.toLowerCase());

            // إذا لم يكن سوبر أدمن أو في القائمة البيضاء، اعرض شاشة الصيانة
            if (!isSuperAdmin && !isWhitelisted) {
                const maintenanceData = settingsSnap.data();
                const customTitle = maintenanceData.maintenanceTitle || 'المنصة في وضع الصيانة';
                const customMessage = maintenanceData.maintenanceMessage || 'نعمل حالياً على تحسينات هامة لتقديم تجربة أفضل.';
                const whatsappNumber = maintenanceData.whatsappNumber || '01040224684';
                const showWhatsapp = maintenanceData.showWhatsapp !== false;
                const showPhoneText = maintenanceData.showPhoneText !== false;
                const expectedReturn = maintenanceData.expectedReturn || '';
                const layout = maintenanceData.maintenanceLayout || 'default';
                
                let iconStr = '🚧';
                let iconShadow = 'rgba(250,204,21,0.5)';
                let titleColor = '#fbbf24, #f59e0b';
                let titleShadow = 'rgba(251,191,36,0.3)';
                let dotColor = '#fbbf24';

                if (layout === 'update') {
                    iconStr = '🚀';
                    iconShadow = 'rgba(56,189,248,0.5)';
                    titleColor = '#38bdf8, #0284c7';
                    titleShadow = 'rgba(56,189,248,0.3)';
                    dotColor = '#38bdf8';
                } else if (layout === 'coming_soon') {
                    iconStr = '⏳';
                    iconShadow = 'rgba(248,113,113,0.5)';
                    titleColor = '#f87171, #dc2626';
                    titleShadow = 'rgba(248,113,113,0.3)';
                    dotColor = '#f87171';
                }

                document.body.innerHTML = `
                <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;text-align:center;font-family:'Cairo', sans-serif;overflow:hidden;">
                    
                    <!-- الخلفية المتحركة -->
                    <div style="position:absolute;inset:0;overflow:hidden;pointer-events:none;">
                        <div style="position:absolute;top:20%;right:10%;width:300px;height:300px;background:radial-gradient(circle,rgba(99,102,241,0.15) 0%,transparent 70%);border-radius:50%;animation:float 8s ease-in-out infinite;"></div>
                        <div style="position:absolute;bottom:30%;left:15%;width:200px;height:200px;background:radial-gradient(circle,rgba(236,72,153,0.15) 0%,transparent 70%);border-radius:50%;animation:float 6s ease-in-out infinite reverse;"></div>
                    </div>
                    
                    <!-- المحتوى الرئيسي -->
                    <div style="position:relative;z-index:10;max-width:600px;padding:20px;">
                        
                        <!-- أيقونة الصيانة -->
                        <div style="font-size:100px;animation:bounce 2s ease-in-out infinite;margin-bottom:20px;filter:drop-shadow(0 10px 30px ${iconShadow});">${iconStr}</div>
                        
                        <!-- العنوان -->
                        <h1 style="font-size:2.5rem;font-weight:900;margin:0 0 15px 0;background:linear-gradient(to right, ${titleColor});-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-shadow:0 0 30px ${titleShadow};">
                            ${customTitle}
                        </h1>
                        
                        <!-- الرسالة -->
                        <p style="font-size:1.1rem;opacity:0.9;line-height:1.8;margin:0 0 25px 0;padding:0 20px;">
                            ${customMessage}
                        </p>
                        
                        ${expectedReturn ? `
                        <div style="background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:20px;padding:15px 25px;margin-bottom:25px;border:1px solid rgba(255,255,255,0.2);">
                            <span style="font-size:0.85rem;opacity:0.7;">🕐 الوقت المتوقع للعودة:</span>
                            <span style="font-weight:bold;font-size:1rem;margin-right:10px;color:#fbbf24;">${expectedReturn}</span>
                        </div>
                        ` : ''}
                        
                        <!-- النقاط المتحركة -->
                        <div style="margin:30px 0;display:flex;gap:10px;justify-content:center;">
                            <span style="display:inline-block;width:12px;height:12px;background:${dotColor};border-radius:50%;animation:pulse 1.2s infinite;box-shadow:0 0 20px ${iconShadow};"></span>
                            <span style="display:inline-block;width:12px;height:12px;background:${dotColor};border-radius:50%;animation:pulse 1.2s infinite 0.2s;box-shadow:0 0 20px ${iconShadow};"></span>
                            <span style="display:inline-block;width:12px;height:12px;background:${dotColor};border-radius:50%;animation:pulse 1.2s infinite 0.4s;box-shadow:0 0 20px ${iconShadow};"></span>
                        </div>
                        
                        ${showWhatsapp ? `
                        <!-- زر الواتساب -->
                        <a href="https://wa.me/2${whatsappNumber}" target="_blank" style="
                            display:inline-flex;
                            align-items:center;
                            gap:12px;
                            background:linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                            color:white;
                            padding:18px 35px;
                            border-radius:50px;
                            text-decoration:none;
                            font-weight:bold;
                            font-size:1.1rem;
                            box-shadow:0 10px 40px rgba(34,197,94,0.4);
                            transition:all 0.3s ease;
                            margin-top:10px;
                        " onmouseover="this.style.transform='scale(1.05) translateY(-3px)';this.style.boxShadow='0 15px 50px rgba(34,197,94,0.5)';" onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 10px 40px rgba(34,197,94,0.4)';">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            <span>تواصل معنا على الواتساب</span>
                        </a>
                        ` : ''}
                        
                        ${showPhoneText ? `
                        <p style="margin-top:20px;font-size:0.9rem;opacity:0.6;">
                            📱 ${whatsappNumber}
                        </p>
                        ` : ''}
                        
                    </div>
                    
                    <!-- الأنيميشن -->
                    <style>
                        @keyframes float { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-20px) rotate(5deg); } }
                        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
                        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }
                    </style>
                </div>`;
                return; // 🛑 توقف هنا ولا تكمل تشغيل باقي الكود
            }
        }
    } catch (e) {
        console.error("Maintenance Check Error:", e);
        // في حالة الخطأ (مثل انقطاع النت)، نكمل التشغيل العادي
    }

    // إذا وصلنا هنا، يعني إما لا توجد صيانة أو المستخدم هو الأدمن
    initializeApp();
};

// ============================================================
// 2. دالة بدء تشغيل التطبيق (Initialize App)
// ============================================================
function initializeApp() {
    console.log("✅ Maintenance check passed. Initializing app...");

    // 1. تهيئة الواجهة
    setupThemeToggle();
    setupMobileMenu();
    loadAnnouncementBar();

    // 2. تشغيل الأنظمة الأساسية
    setupAuthListener();       // مراقبة تسجيل الدخول
    initializeEvents();        // مراقبة التنقل والروابط

    // 3. تشغيل الخدمات الإضافية
    // setupChatWidget();         // المساعد الذكي AI
    setupGroupChat();          // الشات العام
    setupSupportSystem();      // الدعم الفني
    setupDMSystem();           // الرسائل الخاصة

    // 4. طلب إذن الإشعارات
    setupPushNotifications();

    // 5. طلب إذن الموقع مبكراً
    requestGPSPermission();

    // 6. تفعيل حالة النشاط للـ Bottom Navigation Bar
    setupBottomNavActiveState();
}

// ============================================================
// Bottom Navigation Active State Handler
// ============================================================
function setupBottomNavActiveState() {
    const updateActiveState = () => {
        const hash = window.location.hash.slice(1) || 'home';
        const bottomNavItems = document.querySelectorAll('.bottom-nav-item');

        bottomNavItems.forEach(item => {
            const itemHash = item.getAttribute('href')?.slice(1);

            // Check if this item matches the current route
            const isActive = (itemHash === hash) ||
                (itemHash === 'home' && !hash) ||
                (itemHash === 'sections' && hash.startsWith('section/')) ||
                (itemHash === 'profile' && hash.startsWith('profile/'));

            if (isActive) {
                item.classList.add('active');
                item.classList.remove('text-surface-400', 'dark:text-surface-500');
            } else {
                item.classList.remove('active');
                item.classList.add('text-surface-400', 'dark:text-surface-500');
            }
        });
    };

    // Listen for hash changes
    window.addEventListener('hashchange', updateActiveState);

    // Set initial state
    updateActiveState();
}

// طلب إذن الموقع GPS
async function requestGPSPermission() {
    if (!navigator.geolocation) return;

    try {
        // التحقق من حالة الإذن
        const permission = await navigator.permissions?.query({ name: 'geolocation' });

        if (permission?.state === 'prompt') {
            // طلب الإذن بطريقة ودية
            navigator.geolocation.getCurrentPosition(
                () => console.log('📍 GPS permission granted'),
                () => console.log('📍 GPS permission denied'),
                { enableHighAccuracy: false, timeout: 5000, maximumAge: Infinity }
            );
        }
    } catch (e) {
        // بعض المتصفحات لا تدعم permissions API
        console.log('GPS permission check not supported');
    }
}

// ============================================================
// 3. Push Notifications Setup (Firebase Cloud Messaging)
// ============================================================
async function setupPushNotifications() {
    // التحقق من دعم المتصفح
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        console.log('📵 Push notifications not supported');
        return;
    }

    try {
        // تهيئة الإشعارات باستخدام الـ module الجديد
        await initializeNotifications();

        // إذا كان الإذن ممنوحاً مسبقاً، جدد الـ token
        if (Notification.permission === 'granted') {
            await requestNotificationPermission();
        }
    } catch (e) {
        console.log('Push setup error:', e);
    }
}

// تحويل VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// دالة إرسال إشعار محلي
window.sendLocalNotification = (title, body, options = {}) => {
    if (Notification.permission !== 'granted') {
        console.log('⚠️ Notification permission not granted');
        return;
    }

    navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
            body,
            icon: 'https://cdn-icons-png.flaticon.com/512/3413/3413535.png',
            badge: 'https://cdn-icons-png.flaticon.com/512/3413/3413535.png',
            vibrate: [200, 100, 200],
            tag: options.tag || 'nebras-local',
            data: { url: options.url || './' },
            ...options
        });
    });
};

// إظهار بانر طلب الإذن
window.showNotificationBanner = () => {
    if (Notification.permission !== 'default') return;

    const banner = document.createElement('div');
    banner.className = 'fixed bottom-24 left-4 right-4 md:left-auto md:right-8 md:w-80 bg-gradient-to-r from-primary-600 to-primary-600 text-white p-4 rounded-2xl shadow-2xl z-[9999] animate-slide-up';
    banner.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="text-3xl">🔔</div>
            <div class="flex-1">
                <p class="font-bold text-sm mb-1">فعّل الإشعارات</p>
                <p class="text-xs opacity-80">ليصلك كل جديد من المحاضرات والتحديثات</p>
            </div>
        </div>
        <div class="flex gap-2 mt-3">
            <button onclick="window.requestNotificationPermission().then(() => this.closest('div').remove())" class="flex-1 bg-white text-primary-600 py-2 rounded-lg text-sm font-bold hover:bg-primary-50 transition">
                ✅ تفعيل
            </button>
            <button onclick="this.closest('div').parentElement.remove()" class="px-4 py-2 text-white/70 hover:text-white text-sm transition">
                لاحقاً
            </button>
        </div>
    `;
    document.body.appendChild(banner);

    // إخفاء بعد 15 ثانية
    setTimeout(() => banner.remove(), 15000);
};

// ============================================================
// نافذة إجبارية لتفعيل الإشعارات (Forced Notification Permission)
// ============================================================
window.showForcedNotificationModal = () => {
    // لا تظهر للأونر
    if (auth?.currentUser?.email === window.SUPER_ADMIN_EMAIL) return;

    // لا تظهر إذا كانت الإشعارات مفعلة أو مرفوضة
    if (Notification.permission !== 'default') return;

    // لا تظهر إذا كان المستخدم رفضها سابقاً (تخزين محلي)
    if (localStorage.getItem('notificationDismissed') === 'true') return;

    const modal = document.createElement('div');
    modal.id = 'forced-notification-modal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-slide-up">
            <div class="bg-gradient-to-r from-primary-600 to-primary-600 p-6 text-white text-center">
                <div class="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-bell text-4xl"></i>
                </div>
                <h2 class="text-2xl font-black">تفعيل الإشعارات مطلوب!</h2>
            </div>
            <div class="p-6">
                <div class="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-2xl p-4 mb-4">
                    <p class="text-amber-800 dark:text-amber-300 font-bold text-sm flex items-center gap-2">
                        <i class="fas fa-exclamation-triangle"></i>
                        انتبه!
                    </p>
                    <p class="text-amber-700 dark:text-amber-400 text-sm mt-2">
                        لن تتمكن من استقبال <strong>درجاتك</strong> والإعلانات الهامة بدون تفعيل الإشعارات
                    </p>
                </div>
                
                <ul class="space-y-3 text-surface-600 dark:text-surface-300 text-sm mb-6">
                    <li class="flex items-center gap-3">
                        <i class="fas fa-check-circle text-accent-500"></i>
                        استقبال درجات الامتحانات فور ظهورها
                    </li>
                    <li class="flex items-center gap-3">
                        <i class="fas fa-check-circle text-accent-500"></i>
                        التذكير بمواعيد الامتحانات
                    </li>
                    <li class="flex items-center gap-3">
                        <i class="fas fa-check-circle text-accent-500"></i>
                        إشعارات الإعلانات الهامة
                    </li>
                </ul>
                
                <button id="enable-notif-btn" class="w-full bg-gradient-to-r from-primary-600 to-primary-600 text-white py-4 rounded-xl font-black text-lg hover:shadow-xl transition flex items-center justify-center gap-2">
                    <i class="fas fa-bell"></i>
                    تفعيل الإشعارات الآن
                </button>
                
                <button id="skip-notif-btn" class="w-full mt-3 text-surface-400 hover:text-surface-600 text-sm py-2 transition">
                    تخطي (لن تستقبل الدرجات)
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('enable-notif-btn').onclick = async () => {
        const btn = document.getElementById('enable-notif-btn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التفعيل...';
        btn.disabled = true;

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                window.showToast?.('✅ تم تفعيل الإشعارات بنجاح!', 'success');
                await window.subscribeUserToPush?.();
            } else {
                window.showToast?.('❌ تم رفض الإشعارات', 'warning');
                localStorage.setItem('notificationDismissed', 'true');
            }
            modal.remove();
        } catch (e) {
            console.error(e);
            modal.remove();
        }
    };

    document.getElementById('skip-notif-btn').onclick = () => {
        if (confirm('⚠️ تأكيد: لن تستقبل درجاتك بدون تفعيل الإشعارات. هل تريد المتابعة؟')) {
            localStorage.setItem('notificationDismissed', 'true');
            modal.remove();
        }
    };
};

// تشغيل النافذة الإجبارية بعد تسجيل الدخول
setTimeout(() => {
    if (auth?.currentUser && Notification.permission === 'default') {
        window.showForcedNotificationModal?.();
    }
}, 3000);

// ============================================================
// 4. نقطة البداية (Entry Point)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // نبدأ بفحص الصيانة بدلاً من تشغيل التطبيق مباشرة
    checkMaintenanceAndStart();
});