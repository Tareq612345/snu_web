// ============================================================
// events.js - إدارة التنقل، الروابط، والأحداث (النسخة الكاملة)
// ============================================================

import { checkAdminStatus, loadUserProfile } from './auth.js';
import { loadStudySections, openCmsView, renderSubsectionsForUser, openAdminSubsectionEditor, updateGlobalProgress, loadAssignmentsForUser, checkLiveSession } from './cms.js';
import { loadQuizQuestionsForUser, openQuizAdminView, openLeaderboardView } from './quiz.js';
import { viewUserScoresView, openAdminManagementView, openUsersLogView, openAssignmentsAdminView, openLiveSessionControl, openIdReviewDashboard } from './admin.js';
import { openAdminSupportDashboard } from './support.js';

// قائمة بمعرفات الأقسام الرئيسية في الصفحة (لإخفائها عند التنقل)
const ALL_SECTIONS_IDS = [
    'home-screen',
    'study-sections-container',
    'subsection-viewer',
    'quiz-section',
    'leaderboard-section',
    'scores-section',
    'assignments-section',
    'profile-section',
    'admin-view-area',
    'admin-settings-section',
    'feed-section'
];

// ============================================================
// خريطة التوجيه (Routes Map)
// تربط كل "هاش" بالدالة التي يجب تنفيذها
// ============================================================
const VIEWS = {
    // --- مسارات الطالب ---
    'home': () => {
        const el = document.getElementById('home-screen');
        el.classList.remove('hidden');
        el.classList.add('animate-fade-in');
        updateGlobalProgress();
        checkLiveSession();
    },
    'sections': () => {
        loadStudySections();
    },
    'quiz': () => {
        loadQuizQuestionsForUser();
    },
    'assignments': () => {
        loadAssignmentsForUser();
    },
    'leaderboard': () => {
        openLeaderboardView();
    },
    'scores': () => {
        viewUserScoresView(); // عرض درجات الطالب لنفسه
    },
    'profile': async () => {
        const { auth } = await import('./firebase.js');
        if (auth.currentUser) loadUserProfile(auth.currentUser.uid);
    },
    'chat': () => {
        // الشات يفتح في نافذة عائمة، نوجه للرئيسية ونفتح الشات
        const chatBtn = document.getElementById('group-chat-toggle');
        if (chatBtn) chatBtn.click();
        window.location.hash = 'home';
    },
    'feed': () => {
        const el = document.getElementById('feed-section');
        el?.classList.remove('hidden');
        el?.classList.add('animate-fade-in');
        window.renderAdminFeed?.('feed-posts-container');
    },

    // --- مسارات الأدمن ---
    'admin/cms': () => openCmsView(),
    'admin/quiz': () => openQuizAdminView(),
    'admin/users': () => openUsersLogView(),
    'admin/assign': () => openAssignmentsAdminView(),
    'admin/assignments': () => openAssignmentsAdminView(),
    'admin/settings': () => openAdminManagementView(),
    'admin/live': () => openLiveSessionControl(),
    'admin/support': () => openAdminSupportDashboard(),
    'admin/id-review': () => openIdReviewDashboard() // ✅ صفحة مراجعة الهويات الجديدة
};

// ============================================================
// دالة تهيئة الأحداث (Main Initializer)
// ============================================================
export const initializeEvents = () => {
    // الاستماع لتغيير الرابط (Hash Change)
    window.addEventListener('hashchange', checkRoute);

    // تشغيل التوجيه لأول مرة عند فتح الموقع
    checkRoute();
};

// ============================================================
// دالة فحص الرابط وتوجيه المستخدم (Router)
// ============================================================
export const checkRoute = async () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    // ✅ إصلاح الموبايل: إغلاق القائمة عند الانتقال لصفحة جديدة
    if (window.innerWidth < 768 && sidebar && overlay) {
        if (!sidebar.classList.contains('translate-x-full')) {
            sidebar.classList.add('translate-x-full'); // إخفاء القائمة
            overlay.classList.add('hidden'); // إخفاء الخلفية السوداء
        }
    }

    // جلب الهاش الحالي (أو الافتراضي home)
    const hash = window.location.hash.slice(1) || 'home';

    // 1. إخفاء جميع الأقسام أولاً لتجهيز الصفحة للمحتوى الجديد
    ALL_SECTIONS_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('hidden');
            el.classList.remove('animate-fade-in');
        }
    });

    // 2. تحديث حالة الروابط النشطة (Active State) في القائمة
    document.querySelectorAll('.nav-item').forEach(el => {
        const linkHash = el.getAttribute('href')?.slice(1);
        // مقارنة مرنة للروابط لتحديد الزر النشط
        if (linkHash === hash || (hash.startsWith(linkHash) && linkHash !== 'home')) {
            el.classList.add('bg-primary-50', 'dark:bg-surface-700', 'text-primary-600', 'dark:text-primary-400');
            el.classList.remove('text-surface-700', 'dark:text-surface-200');
        } else {
            el.classList.remove('bg-primary-50', 'dark:bg-surface-700', 'text-primary-600', 'dark:text-primary-400');
            el.classList.add('text-surface-700', 'dark:text-surface-200');
        }
    });

    // 3. معالجة المسارات الديناميكية (التي تحتوي على معلمات /)

    // أ) عرض محتوى مادة معينة (مثال: #section/cs101)
    if (hash.startsWith('section/')) {
        const sectionId = hash.split('/')[1];
        if (sectionId) {
            renderSubsectionsForUser(sectionId);
            return;
        }
    }

    // ب) مسار تعديل المحتوى للأدمن (مثال: #admin/cms/cs101)
    if (hash.startsWith('admin/cms/')) {
        const sectionId = hash.split('/').pop();
        if (sectionId) {
            openAdminSubsectionEditor(sectionId);
            return;
        }
    }

    // ج) عرض بروفايل مستخدم آخر (مثال: #profile/user123)
    if (hash.startsWith('profile/')) {
        const userId = hash.split('/')[1];
        if (userId) {
            loadUserProfile(userId);
            return;
        }
    }

    // د) المسارات الثابتة (من قائمة VIEWS)
    if (VIEWS[hash]) {
        VIEWS[hash]();
    } else {
        // إذا كان الرابط غير معروف، ارجع للرئيسية
        if (!window.location.hash) {
            window.location.hash = 'home';
        } else {
            // إذا كان الرابط خاطئاً، نوجه للرئيسية
            VIEWS['home']();
        }
    }
};