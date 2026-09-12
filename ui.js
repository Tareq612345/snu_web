// ============================================================
// ui.js - ملف الواجهة وكل حاجة UI
// ============================================================

import { db, auth } from './firebase.js';
import { doc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ============================================================
// دوال الأمان والفلترة
// ============================================================

// بنستخدمها علشان نمنع XSS attacks
window.sanitizeHTML = (str) => {
    if (!str) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;'
    };
    return String(str).replace(/[&<>"'/]/g, (s) => map[s]);
};

// validate بسيط للنصوص
window.validateInput = (text, options = {}) => {
    const { maxLength = 1000, minLength = 1, allowEmpty = false } = options;

    if (!text && !allowEmpty) return { valid: false, error: window.t?.('text-required') || 'النص مطلوب' };
    if (!text && allowEmpty) return { valid: true, text: '' };

    const trimmed = String(text).trim();

    if (trimmed.length < minLength) return { valid: false, error: `${window.t?.('text-too-short') || 'النص قصير جداً'} (${minLength} ${window.t?.('minimum') || 'على الأقل'})` };
    if (trimmed.length > maxLength) return { valid: false, error: `${window.t?.('text-too-long') || 'النص طويل جداً'} (${trimmed.length}/${maxLength})` };

    return { valid: true, text: trimmed };
};

// بنتأكد إن الملف صورة ومش كبير اوي
window.validateFileType = (file, allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) => {
    if (!file) return { valid: false, error: window.t?.('no-file-selected') || 'لم يتم اختيار ملف' };
    if (!allowedTypes.includes(file.type)) return { valid: false, error: window.t?.('file-type-not-supported') || 'نوع الملف غير مدعوم' };
    if (file.size > 10 * 1024 * 1024) return { valid: false, error: window.t?.('file-too-large') || 'الملف كبير جداً (الحد الأقصى 10MB)' };
    return { valid: true };
};

// ============================================================
// الإشعارات
// ============================================================

// هنخزن الإشعارات في localStorage
let notificationHistory = JSON.parse(localStorage.getItem('notificationHistory') || '[]');

// ============================================================
// صوت الإشعار
// ============================================================
const NOTIFICATION_SOUND = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
NOTIFICATION_SOUND.volume = 0.3;

// التحقق من تفعيل الصوت
const isSoundEnabled = () => localStorage.getItem('notificationSoundEnabled') !== 'false';

// تشغيل صوت الإشعار
const playNotificationSound = () => {
    if (isSoundEnabled()) {
        NOTIFICATION_SOUND.currentTime = 0;
        NOTIFICATION_SOUND.play().catch(() => { }); // Ignore autoplay errors
    }
};

// تبديل حالة الصوت
window.toggleNotificationSound = () => {
    const enabled = !isSoundEnabled();
    localStorage.setItem('notificationSoundEnabled', enabled);
    window.showToast?.(enabled ? (window.t?.('sound-enabled') || '🔔 تم تفعيل صوت الإشعارات') : (window.t?.('sound-disabled') || '🔕 تم إيقاف صوت الإشعارات'), 'info');
    updateSoundToggleUI();
    return enabled;
};

// تحديث UI زر الصوت
const updateSoundToggleUI = () => {
    const btn = document.getElementById('sound-toggle-btn');
    if (btn) {
        const icon = btn.querySelector('i');
        if (icon) icon.className = isSoundEnabled() ? 'fas fa-volume-up' : 'fas fa-volume-mute';
    }
};

// إنشاء زر الجرس
const createNotificationBell = () => {
    if (document.getElementById('notification-bell-container')) return;

    const container = document.createElement('div');
    container.id = 'notification-bell-container';
    container.className = 'fixed top-4 left-16 z-[9997]';
    container.innerHTML = `
        <button id="notification-bell" class="relative w-12 h-12 bg-white dark:bg-gray-800 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition border-2 border-gray-200 dark:border-gray-700 group">
            <i class="fas fa-bell text-gray-600 dark:text-gray-300 text-lg group-hover:animate-wiggle"></i>
            <span id="notification-badge" class="hidden absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">0</span>
        </button>
        
        <!-- Dropdown -->
        <div id="notification-dropdown" class="hidden absolute top-14 left-0 w-80 max-h-96 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border dark:border-gray-700 overflow-hidden animate-fade-in">
            <div class="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <i class="fas fa-bell"></i>
                    <span class="font-bold">${window.t?.('notifications') || 'الإشعارات'}</span>
                </div>
                <div class="flex items-center gap-2">
                    <button id="sound-toggle-btn" onclick="event.stopPropagation(); window.toggleNotificationSound()" class="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded-full transition" title="${window.t?.('toggle-sound') || 'تبديل الصوت'}">
                        <i class="fas ${isSoundEnabled() ? 'fa-volume-up' : 'fa-volume-mute'}"></i>
                    </button>
                    <button onclick="window.clearNotifications()" class="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded-full transition">${window.t?.('clear-all') || 'مسح الكل'}</button>
                </div>
            </div>
            <div id="notification-list" class="max-h-72 overflow-y-auto custom-scrollbar"></div>
        </div>
    `;
    document.body.appendChild(container);

    // Toggle dropdown
    document.getElementById('notification-bell').onclick = () => {
        const dropdown = document.getElementById('notification-dropdown');
        dropdown.classList.toggle('hidden');
        updateNotificationBadge();
        renderNotifications();
    };

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            document.getElementById('notification-dropdown')?.classList.add('hidden');
        }
    });
};

// تحديث البادج
const updateNotificationBadge = () => {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;

    const unread = notificationHistory.filter(n => !n.read).length;
    if (unread > 0) {
        badge.textContent = unread > 9 ? '9+' : unread;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
};

// عرض الإشعارات في الـ dropdown
const renderNotifications = () => {
    const list = document.getElementById('notification-list');
    if (!list) return;

    if (notificationHistory.length === 0) {
        list.innerHTML = `
            <div class="p-8 text-center text-gray-400">
                <i class="fas fa-bell-slash text-3xl mb-2 opacity-50"></i>
                <p class="text-sm">${window.t?.('no-notifications') || 'لا توجد إشعارات'}</p>
            </div>
        `;
        return;
    }

    list.innerHTML = notificationHistory.slice(0, 20).map(n => {
        const icons = { success: 'fa-check-circle text-green-500', error: 'fa-times-circle text-red-500', warning: 'fa-exclamation-triangle text-yellow-500', info: 'fa-info-circle text-blue-500' };
        const time = new Date(n.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="p-3 border-b dark:border-gray-700 flex items-start gap-3 ${n.read ? 'opacity-60' : 'bg-blue-50 dark:bg-blue-900/20'}" onclick="this.classList.add('opacity-60')">
                <i class="fas ${icons[n.type] || icons.info} mt-1"></i>
                <div class="flex-1 min-w-0">
                    <p class="text-sm dark:text-white truncate">${n.message}</p>
                    <p class="text-[10px] text-gray-400 mt-1">${time}</p>
                </div>
            </div>
        `;
    }).join('');

    // Mark as read
    notificationHistory.forEach(n => n.read = true);
    localStorage.setItem('notificationHistory', JSON.stringify(notificationHistory));
};

// مسح جميع الإشعارات
window.clearNotifications = () => {
    notificationHistory = [];
    localStorage.setItem('notificationHistory', JSON.stringify([]));
    renderNotifications();
    updateNotificationBadge();
};

// إظهار Toast محسّن - تصميم عصري
export const showToast = (message, type = 'success') => {
    // حذف أي toast قديم
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();

    // حفظ في التاريخ
    notificationHistory.unshift({
        message,
        type,
        timestamp: Date.now(),
        read: false
    });
    notificationHistory = notificationHistory.slice(0, 50);
    localStorage.setItem('notificationHistory', JSON.stringify(notificationHistory));
    updateNotificationBadge();

    // Sound removed from toast — only plays for real-time notifications

    const toast = document.createElement('div');

    // ألوان عصرية مع gradient
    const themes = {
        success: {
            bg: 'from-emerald-500 to-blue-600',
            icon: 'fa-check-circle',
            glow: 'shadow-emerald-500/30'
        },
        error: {
            bg: 'from-red-500 to-rose-600',
            icon: 'fa-times-circle',
            glow: 'shadow-red-500/30'
        },
        warning: {
            bg: 'from-amber-500 to-orange-500',
            icon: 'fa-exclamation-triangle',
            glow: 'shadow-amber-500/30'
        },
        info: {
            bg: 'from-blue-500 to-blue-600',
            icon: 'fa-info-circle',
            glow: 'shadow-blue-500/30'
        }
    };

    const theme = themes[type] || themes.success;

    toast.className = `fixed bottom-6 right-6 z-[10000] max-w-sm animate-slide-up`;
    toast.innerHTML = `
        <div class="bg-gradient-to-r ${theme.bg} text-white px-5 py-4 rounded-2xl shadow-2xl ${theme.glow} backdrop-blur-sm flex items-center gap-4 border border-white/20">
            <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <i class="fas ${theme.icon} text-xl"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-bold text-sm leading-relaxed">${message}</p>
            </div>
            <button onclick="this.closest('.fixed').remove()" class="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition flex-shrink-0">
                <i class="fas fa-times text-sm opacity-70"></i>
            </button>
        </div>
        <div class="absolute bottom-0 left-0 right-0 h-1 bg-white/30 rounded-b-2xl overflow-hidden mx-5">
            <div class="h-full bg-white/50 animate-toast-progress"></div>
        </div>
    `;

    document.body.appendChild(toast);

    // إخفاء تلقائي بعد 5 ثواني
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'slideDown 0.4s ease-out forwards';
            setTimeout(() => toast.remove(), 400);
        }
    }, 5000);
};

// إنشاء زر الجرس عند تحميل الصفحة
setTimeout(() => createNotificationBell(), 1000);

// تصدير للاستخدام العام
window.showToast = showToast;

// ============================================================
// 2. القائمة الجانبية (Sidebar)
// ============================================================
export const setupMobileMenu = () => {
    const btn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const closeBtn = document.getElementById('close-sidebar-btn');

    const openSidebar = () => {
        const isRTL = document.documentElement.dir === 'rtl';
        // في RTL: translate-x-full يخفي، translate-x-0 يظهر
        // في LTR: -translate-x-full يخفي، translate-x-0 يظهر
        sidebar.classList.remove(isRTL ? 'translate-x-full' : '-translate-x-full');
        sidebar.classList.add('translate-x-0');
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // منع التمرير
        // إخفاء زر الإشعارات
        const notifBell = document.getElementById('notification-bell-container');
        if (notifBell) notifBell.style.display = 'none';
    };

    const closeSidebar = () => {
        const isRTL = document.documentElement.dir === 'rtl';
        sidebar.classList.add(isRTL ? 'translate-x-full' : '-translate-x-full');
        sidebar.classList.remove('translate-x-0');
        overlay.classList.add('hidden');
        document.body.style.overflow = ''; // إعادة التمرير
        // إظهار زر الإشعارات
        const notifBell = document.getElementById('notification-bell-container');
        if (notifBell) notifBell.style.display = 'block';
    };

    if (btn && sidebar && overlay) {
        // إلغاء أي مستمع قديم
        btn.replaceWith(btn.cloneNode(true));
        const newBtn = document.getElementById('mobile-menu-btn');

        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isRTL = document.documentElement.dir === 'rtl';
            const isClosed = sidebar.classList.contains(isRTL ? 'translate-x-full' : '-translate-x-full');
            isClosed ? openSidebar() : closeSidebar();
        });

        overlay.addEventListener('click', closeSidebar);

        if (closeBtn) {
            closeBtn.addEventListener('click', closeSidebar);
        }

        // إغلاق عند الضغط على أي رابط
        sidebar.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', closeSidebar);
        });

        // إغلاق عند الضغط على Escape
        document.addEventListener('keydown', (e) => {
            const isRTL = document.documentElement.dir === 'rtl';
            if (e.key === 'Escape' && !sidebar.classList.contains(isRTL ? 'translate-x-full' : '-translate-x-full')) {
                closeSidebar();
            }
        });
    } else {
        console.error("❌ Sidebar elements not found!");
    }
};

// ============================================================
// 3. الوضع الليلي (Dark Mode)
// ============================================================
export const setupThemeToggle = () => {
    const themeBtn = document.getElementById('theme-toggle');
    const html = document.documentElement;

    // Moon و Sun icons
    const moonIcon = '<i class="fas fa-moon text-gray-600"></i>';
    const sunIcon = '<i class="fas fa-sun text-yellow-400"></i>';

    // استرجاع الوضع المحفوظ
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const setTheme = (isDark) => {
        if (isDark) {
            html.classList.add('dark');
            if (themeBtn) themeBtn.innerHTML = sunIcon;
        } else {
            html.classList.remove('dark');
            if (themeBtn) themeBtn.innerHTML = moonIcon;
        }
    };

    // تطبيق الوضع المحفوظ أو وضع النظام
    setTheme(savedTheme === 'dark' || (!savedTheme && systemPrefersDark));

    if (themeBtn) {
        themeBtn.onclick = () => {
            const isDark = !html.classList.contains('dark');
            setTheme(isDark);
            localStorage.setItem('theme', isDark ? 'dark' : 'light');

            // تأثير الانتقال
            themeBtn.classList.add('animate-spin');
            setTimeout(() => themeBtn.classList.remove('animate-spin'), 300);
        };
    }
};

// ============================================================
// 4. شريط الإعلانات (Announcement Bar) - تصميم عصري
// ============================================================

// دالة لتحويل الروابط في النص لروابط قابلة للنقر
const linkifyText = (text) => {
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank" class="underline text-white font-bold hover:text-blue-200 transition">$1</a>');
};

export const loadAnnouncementBar = () => {
    try {
        onSnapshot(doc(db, "system", "announcement"), async (snap) => {
            // حذف أي إعلان سابق
            const existingBar = document.getElementById('announcement-bar-container');
            if (existingBar) existingBar.remove();

            if (!snap.exists()) return;

            const data = snap.data();
            if (!data.isActive || !data.text) return;

            // ✅ التحقق من الاستهداف
            if (!data.targetAll && data.targets && data.targets.length > 0) {
                // جلب بيانات المستخدم
                const user = auth.currentUser;
                if (user) {
                    try {
                        const userDoc = await getDoc(doc(db, "users", user.uid));
                        if (userDoc.exists()) {
                            const userData = userDoc.data();
                            const userCollegeId = userData.collegeId;
                            const userDeptId = userData.departmentId;

                            // التحقق من التطابق
                            const canView = data.targets.some(t => {
                                if (t.collegeId !== userCollegeId) return false;
                                if (t.departmentId === 'all') return true;
                                return t.departmentId === userDeptId;
                            });

                            if (!canView) return; // لا تظهر الإعلان لهذا المستخدم
                        }
                    } catch (e) { console.warn("Error checking announcement target:", e); }
                }
            }

            // الإعلان يظهر دايماً عند كل refresh (بدون حفظ dismiss)

            // إضافة الإعلان للإشعارات
            const announcementNotif = {
                message: `📢 ${data.title || 'إعلان جديد'}: ${data.text.substring(0, 100)}${data.text.length > 100 ? '...' : ''}`,
                type: 'info',
                timestamp: Date.now(),
                read: false,
                isAnnouncement: true,
                link: data.link
            };

            // تحقق من عدم تكرار الإعلان في الإشعارات
            const existingAnnouncement = notificationHistory.find(n => n.isAnnouncement && n.message === announcementNotif.message);
            if (!existingAnnouncement) {
                notificationHistory.unshift(announcementNotif);
                notificationHistory = notificationHistory.slice(0, 50);
                localStorage.setItem('notificationHistory', JSON.stringify(notificationHistory));
                updateNotificationBadge();
            }

            // إنشاء شريط الإعلان الجديد
            const bar = document.createElement('div');
            bar.id = 'announcement-bar-container';
            bar.className = 'fixed top-0 left-0 right-0 z-[9998]';

            // تحديد الألوان والأيقونات حسب النوع
            const themes = {
                info: {
                    bg: 'from-blue-600 via-indigo-600 to-pink-500',
                    icon: 'fa-bullhorn',
                    glow: 'shadow-blue-500/20'
                },
                warning: {
                    bg: 'from-amber-500 via-orange-500 to-red-500',
                    icon: 'fa-exclamation-triangle',
                    glow: 'shadow-amber-500/20'
                },
                success: {
                    bg: 'from-emerald-500 via-green-500 to-blue-500',
                    icon: 'fa-check-circle',
                    glow: 'shadow-emerald-500/20'
                },
                danger: {
                    bg: 'from-red-500 via-rose-500 to-pink-600',
                    icon: 'fa-exclamation-circle',
                    glow: 'shadow-red-500/20'
                }
            };
            const theme = themes[data.type] || themes.info;

            // تحويل الروابط في النص
            const processedText = linkifyText(data.text.replace(/\n/g, '<br>'));

            bar.innerHTML = `
                <div class="bg-gradient-to-r ${theme.bg} text-white shadow-2xl ${theme.glow} backdrop-blur-lg border-b border-white/10 relative overflow-hidden">
                    <!-- خلفية متحركة -->
                    <div class="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" viewBox=\"0 0 60 60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"none\" fill-rule=\"evenodd\"%3E%3Cg fill=\"%23ffffff\" fill-opacity=\"0.05\"%3E%3Cpath d=\"m36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm-30 30v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4z\"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] animate-pulse"></div>
                    
                    <div class="max-w-7xl mx-auto px-4 py-4 relative">
                        <div class="flex items-center gap-4">
                            <!-- أيقونة متحركة -->
                            <div class="flex-shrink-0 w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center animate-bounce-slow shadow-lg">
                                <i class="fas ${data.icon || theme.icon} text-2xl"></i>
                            </div>
                            
                            <!-- المحتوى -->
                            <div class="flex-1 min-w-0">
                                ${data.title ? `<h4 class="font-black text-lg mb-1 drop-shadow-lg">${data.title}</h4>` : ''}
                                <div class="text-sm opacity-95 leading-relaxed announcement-content">
                                    ${processedText}
                                </div>
                                ${data.link ? `
                                    <a href="${data.link}" target="_blank" class="inline-flex items-center gap-2 mt-3 text-sm font-bold bg-white/25 hover:bg-white/40 px-4 py-2 rounded-full transition-all hover:scale-105 shadow-lg backdrop-blur-sm">
                                        <i class="fas fa-external-link-alt"></i>
                                        ${data.linkText || 'اعرف المزيد'}
                                    </a>
                                ` : ''}
                            </div>
                            
                            <!-- زر الإغلاق -->
                            <button id="close-announcement" class="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/30 transition-all text-white/80 hover:text-white hover:rotate-90 shadow-lg backdrop-blur-sm" title="إغلاق">
                                <i class="fas fa-times text-lg"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- خط متدرج في الأسفل -->
                    <div class="h-1 bg-gradient-to-r from-white/40 via-white/20 to-white/40"></div>
                </div>
            `;

            // إضافة للصفحة في الأعلى
            document.body.insertBefore(bar, document.body.firstChild);

            // Animation
            bar.style.animation = 'slideDown 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards';

            // إضافة padding للمحتوى الرئيسي
            const updatePadding = () => {
                const barHeight = bar.offsetHeight;
                document.body.style.paddingTop = barHeight + 'px';
            };
            setTimeout(updatePadding, 100);
            window.addEventListener('resize', updatePadding);

            // معالجة الإغلاق
            document.getElementById('close-announcement').onclick = () => {
                bar.style.animation = 'slideUp 0.4s ease-out forwards';
                setTimeout(() => {
                    bar.remove();
                    document.body.style.paddingTop = '';
                    // لا نحفظ dismiss - الإعلان هيظهر تاني عند الـ refresh
                }, 400);
            };
        });
    } catch (e) {
        console.error("Announcement Error:", e);
    }
};

// ============================================================
// 5. Loading Spinner
// ============================================================
export const showLoading = (containerId, message = null) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const loadingMsg = message || (window.t?.('loading') || 'جاري التحميل...');

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 animate-fade-in">
            <div class="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
            <p class="text-gray-500 dark:text-gray-400 font-bold">${loadingMsg}</p>
        </div>
    `;
};

// ============================================================
// 6. Loading Skeleton
// ============================================================
export const showSkeleton = (containerId, count = 3, type = 'card') => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const skeletons = {
        card: `
            <div class="skeleton skeleton-card mb-4"></div>
        `,
        list: `
            <div class="flex items-center gap-4 mb-4">
                <div class="skeleton skeleton-avatar"></div>
                <div class="flex-1">
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-text w-3/4"></div>
                </div>
            </div>
        `
    };

    container.innerHTML = Array(count).fill(skeletons[type] || skeletons.card).join('');
};

// ============================================================
// 7. Modal System
// ============================================================
export const showModal = (content, options = {}) => {
    const { title = '', onClose = null, size = 'md' } = options;

    // إغلاق أي modal مفتوح
    hideModal();

    const sizes = {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
        full: 'max-w-full mx-4'
    };

    const modal = document.createElement('div');
    modal.id = 'dynamic-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content ${sizes[size] || sizes.md} w-full">
            ${title ? `
                <div class="flex items-center justify-between mb-4 pb-4 border-b dark:border-gray-700">
                    <h2 class="text-xl font-bold dark:text-white">${title}</h2>
                    <button id="modal-close-btn" class="btn-icon btn-secondary">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            ` : ''}
            <div id="modal-body">${content}</div>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // إغلاق عند الضغط على الخلفية أو زر الإغلاق
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.id === 'modal-close-btn' || e.target.closest('#modal-close-btn')) {
            hideModal();
            if (onClose) onClose();
        }
    });

    // إغلاق بـ Escape
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            hideModal();
            if (onClose) onClose();
            document.removeEventListener('keydown', escHandler);
        }
    });

    return modal;
};

export const hideModal = () => {
    const modal = document.getElementById('dynamic-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
};

window.showModal = showModal;
window.hideModal = hideModal;

// ============================================================
// 8. Confirm Dialog
// ============================================================
export const showConfirm = (message, onConfirm, onCancel = null) => {
    const content = `
        <div class="text-center">
            <div class="w-16 h-16 mx-auto mb-4 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center">
                <i class="fas fa-exclamation-triangle text-3xl"></i>
            </div>
            <p class="text-gray-700 dark:text-gray-300 mb-6 font-bold">${message}</p>
            <div class="flex gap-3 justify-center">
                <button id="confirm-yes" class="btn btn-danger">
                    <i class="fas fa-check"></i> ${window.t?.('confirm') || 'تأكيد'}
                </button>
                <button id="confirm-no" class="btn btn-secondary">
                    <i class="fas fa-times"></i> ${window.t?.('cancel') || 'إلغاء'}
                </button>
            </div>
        </div>
    `;

    showModal(content, { size: 'sm' });

    document.getElementById('confirm-yes').onclick = () => {
        hideModal();
        if (onConfirm) onConfirm();
    };

    document.getElementById('confirm-no').onclick = () => {
        hideModal();
        if (onCancel) onCancel();
    };
};

window.showConfirm = showConfirm;

// ============================================================
// 9. Empty State Component
// ============================================================
export const showEmptyState = (containerId, options = {}) => {
    const {
        icon = 'fas fa-inbox',
        title = 'لا توجد بيانات',
        message = '',
        actionText = '',
        actionCallback = null
    } = options;

    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
            <div class="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <i class="${icon} text-3xl text-gray-400"></i>
            </div>
            <h3 class="text-lg font-bold text-gray-600 dark:text-gray-300 mb-2">${title}</h3>
            ${message ? `<p class="text-gray-500 dark:text-gray-400 text-sm mb-4">${message}</p>` : ''}
            ${actionText && actionCallback ? `
                <button onclick="(${actionCallback})()" class="btn btn-primary">
                    ${actionText}
                </button>
            ` : ''}
        </div>
    `;
};

window.showEmptyState = showEmptyState;

// ============================================================
// 10. Offline/Online Status Indicator
// ============================================================
const setupOfflineIndicator = () => {
    const showOfflineBanner = () => {
        // إزالة أي بانر موجود
        document.getElementById('offline-banner')?.remove();

        const banner = document.createElement('div');
        banner.id = 'offline-banner';
        banner.className = 'fixed bottom-20 left-1/2 transform -translate-x-1/2 z-[9999] bg-red-500 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 animate-bounce';
        banner.innerHTML = `
            <i class="fas fa-wifi-slash text-xl"></i>
            <span class="font-bold">${window.t?.('no-internet') || 'لا يوجد اتصال بالإنترنت'}</span>
        `;
        document.body.appendChild(banner);
    };

    const hideOfflineBanner = () => {
        const banner = document.getElementById('offline-banner');
        if (banner) {
            banner.classList.remove('bg-red-500', 'animate-bounce');
            banner.classList.add('bg-green-500');
            banner.innerHTML = `
                <i class="fas fa-wifi text-xl"></i>
                <span class="font-bold">${window.t?.('connection-restored') || 'تم استعادة الاتصال'}</span>
            `;
            setTimeout(() => banner.remove(), 2000);
        }
    };

    // التحقق من الحالة الحالية
    if (!navigator.onLine) {
        showOfflineBanner();
    }

    // الاستماع للتغيرات
    window.addEventListener('online', hideOfflineBanner);
    window.addEventListener('offline', showOfflineBanner);
};

// تشغيل عند تحميل الصفحة
setTimeout(setupOfflineIndicator, 1000);

// ============================================================
// 11. جولة تعريفية للمستخدم الجديد (Onboarding Tour)
// ============================================================
window.startOnboardingTour = () => {
    // التحقق إذا كان المستخدم شاف الجولة قبل كده
    if (localStorage.getItem('onboardingComplete') === 'true') return;

    const steps = [
        { target: '#sidebar-toggle, .hamburger-menu', title: 'القائمة الرئيسية', text: 'اضغط هنا للوصول لكل أقسام المنصة' },
        { target: '#theme-toggle, .theme-toggle', title: 'الوضع الليلي', text: 'بدّل بين الوضع الفاتح والمظلم' },
        { target: '#profile-section, .profile-btn', title: 'الملف الشخصي', text: 'شوف معلوماتك وعدّل بياناتك' },
        { target: '.notification-bell', title: 'الإشعارات', text: 'هنا هتلاقي كل الإشعارات الجديدة' },
        { target: '#study-sections-container', title: 'المحتوى الدراسي', text: 'ابدأ رحلة التعلم من هنا!' }
    ];

    let currentStep = 0;

    const showStep = (index) => {
        // إزالة أي highlight سابق
        document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));

        if (index >= steps.length) {
            localStorage.setItem('onboardingComplete', 'true');
            document.getElementById('onboarding-overlay')?.remove();
            window.showToast?.('🎉 تمت الجولة! استمتع بالمنصة', 'success');
            return;
        }

        const step = steps[index];
        const target = document.querySelector(step.target);

        if (!target) {
            showStep(index + 1);
            return;
        }

        target.classList.add('tour-highlight');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // إنشاء/تحديث الـ overlay
        let overlay = document.getElementById('onboarding-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'onboarding-overlay';
            overlay.className = 'fixed inset-0 bg-black/50 z-[999] pointer-events-none';
            document.body.appendChild(overlay);
        }

        // Tooltip
        let tooltip = document.getElementById('tour-tooltip');
        if (tooltip) tooltip.remove();

        const rect = target.getBoundingClientRect();
        tooltip = document.createElement('div');
        tooltip.id = 'tour-tooltip';
        tooltip.className = 'fixed z-[1000] bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-2xl min-w-[280px] animate-slide-up';
        tooltip.style.top = `${rect.bottom + 10}px`;
        tooltip.style.left = `${Math.max(10, rect.left)}px`;
        tooltip.innerHTML = `
            <h4 class="font-black text-lg text-blue-600 mb-2">${step.title}</h4>
            <p class="text-gray-600 dark:text-gray-300 mb-4">${step.text}</p>
            <div class="flex justify-between items-center">
                <span class="text-xs text-gray-400">${index + 1} من ${steps.length}</span>
                <div class="flex gap-2">
                    <button onclick="localStorage.setItem('onboardingComplete','true'); document.getElementById('onboarding-overlay')?.remove(); this.closest('#tour-tooltip').remove(); document.querySelectorAll('.tour-highlight').forEach(el=>el.classList.remove('tour-highlight'));" 
                            class="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">تخطي</button>
                    <button onclick="window.nextTourStep?.()" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">التالي</button>
                </div>
            </div>
        `;
        document.body.appendChild(tooltip);
    };

    window.nextTourStep = () => {
        currentStep++;
        showStep(currentStep);
    };

    // CSS للـ highlight
    const style = document.createElement('style');
    style.textContent = `
        .tour-highlight {
            position: relative;
            z-index: 1000 !important;
            box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.5), 0 0 30px rgba(99, 102, 241, 0.3) !important;
            border-radius: 8px;
        }
    `;
    document.head.appendChild(style);

    showStep(0);
};

// بدء الجولة للمستخدمين الجدد بعد تسجيل الدخول
setTimeout(() => {
    if (localStorage.getItem('onboardingComplete') !== 'true' && document.body.classList.contains('logged-in')) {
        window.startOnboardingTour?.();
    }
}, 3000);

// ============================================================
// 12. حماية المحتوى (Content Protection)
// ============================================================
window.enableContentProtection = () => {
    // منع النقر بالزر الأيمن
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.protected-content')) {
            e.preventDefault();
            window.showToast?.('⚠️ المحتوى محمي ولا يمكن نسخه', 'warning');
        }
    });

    // منع اختصارات النسخ
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
            const selection = window.getSelection();
            if (selection && selection.toString() && document.getSelection()?.anchorNode?.parentElement?.closest('.protected-content')) {
                e.preventDefault();
                window.showToast?.('⚠️ النسخ غير مسموح لهذا المحتوى', 'warning');
            }
        }
        // منع Print Screen
        if (e.key === 'PrintScreen') {
            e.preventDefault();
        }
    });

    // منع السحب والإفلات
    document.addEventListener('dragstart', (e) => {
        if (e.target.closest('.protected-content')) {
            e.preventDefault();
        }
    });

    // إضافة CSS للحماية
    const style = document.createElement('style');
    style.textContent = `
        .protected-content {
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
            -webkit-touch-callout: none !important;
        }
        .protected-content img {
            pointer-events: none;
        }
    `;
    document.head.appendChild(style);
};

// تفعيل تلقائي
setTimeout(window.enableContentProtection, 500);

// ============================================================
// 13. إعادة تشغيل الجولة
// ============================================================
window.restartOnboardingTour = () => {
    localStorage.removeItem('onboardingComplete');
    window.startOnboardingTour?.();
};

// ============================================================
// 14. تصدير جميع الدوال للاستخدام
// ============================================================
export default {
    showToast,
    setupMobileMenu,
    setupThemeToggle,
    loadAnnouncementBar,
    showLoading,
    showSkeleton,
    showModal,
    hideModal,
    showConfirm,
    showEmptyState,
    setupOfflineIndicator
};
