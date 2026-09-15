import { db, auth, SUPER_ADMIN_EMAIL } from './firebase.js';
import { doc, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { FEATURE_KEYS, OFFICIAL_MODE_DEFAULTS, normalizeFeatureFlags, isFeatureEnabled } from './featureFlags.js';

const LABELS = Object.freeze({
    privateMessages: 'الرسائل الخاصة', generalChat: 'الشات العام', studyChat: 'غرفة الدراسة',
    helpChat: 'غرفة المساعدة', randomChat: 'الغرفة العشوائية', socialFeed: 'المنشورات الاجتماعية',
    follows: 'المتابعة', leaderboard: 'لوحة الشرف', xp: 'نقاط XP', achievements: 'الإنجازات',
    streak: 'Streak', aiAssistant: 'مساعد AI', videoCalls: 'مكالمات الفيديو'
});

let flags = normalizeFeatureFlags(OFFICIAL_MODE_DEFAULTS);
let isOwner = false;
let unsubscribeFlags = null;

const selectors = Object.freeze({
    privateMessages: ['button[onclick*="openDMPanel"]'],
    socialFeed: ['a[href="#feed"]', '#feed-section'],
    leaderboard: ['a[href="#leaderboard"]', '#leaderboard-section'],
    aiAssistant: ['#ai-chat-widget'],
    streak: ['#streak-widget']
});

const setVisible = (element, visible) => {
    if (!element) return;
    if (!visible) {
        if (!element.dataset.officialModeDisplay) element.dataset.officialModeDisplay = element.style.display || '';
        element.style.setProperty('display', 'none', 'important');
        element.setAttribute('aria-hidden', 'true');
    } else {
        element.style.display = element.dataset.officialModeDisplay || '';
        element.style.removeProperty('display');
        element.removeAttribute('aria-hidden');
    }
};

const applyRoomPolicy = () => {
    document.querySelectorAll('.room-tab').forEach(tab => {
        const room = tab.dataset.room;
        const collegeTab = tab.id === 'college-room-tab' || room === 'college' || room?.startsWith('college_');
        setVisible(tab, collegeTab);
    });

    const chatWindow = document.getElementById('group-chat-window');
    if (chatWindow && !chatWindow.classList.contains('hidden') && typeof window.switchToCollegeRoom === 'function') {
        window.switchToCollegeRoom();
    }
};

const applyFeatureVisibility = () => {
    Object.entries(selectors).forEach(([key, list]) => {
        // لوحة الشرف لا تظهر في التنقل حتى عند تفعيلها؛ يصل لها الأونر من الإعدادات الإضافية.
        const enabled = key === 'leaderboard' ? false : isFeatureEnabled(flags, key);
        list.forEach(selector => document.querySelectorAll(selector).forEach(el => setVisible(el, enabled)));
    });
    applyRoomPolicy();
};

const guardDisabledRoutes = () => {
    const route = location.hash.slice(1).split('/')[0];
    const routeFeature = { leaderboard: 'leaderboard', feed: 'socialFeed' }[route];
    if (routeFeature && (!isFeatureEnabled(flags, routeFeature) || (routeFeature === 'leaderboard' && !isOwner))) {
        location.hash = 'home';
    }
};

const closePanel = () => document.getElementById('official-feature-panel')?.remove();

const openOwnerPanel = () => {
    if (!isOwner) return;
    closePanel();
    const overlay = document.createElement('div');
    overlay.id = 'official-feature-panel';
    overlay.className = 'fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4';
    overlay.innerHTML = `
      <div class="bg-white dark:bg-gray-800 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl shadow-2xl p-6">
        <div class="flex justify-between items-center mb-2"><h2 class="text-xl font-black dark:text-white">الميزات الإضافية</h2><button id="close-feature-panel" class="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700">✕</button></div>
        <p class="text-sm text-gray-500 mb-5">الوضع الرسمي هو الافتراضي. هذه الإعدادات متاحة للأونر فقط.</p>
        <div class="space-y-2">${FEATURE_KEYS.map(key => `
          <label class="flex items-center justify-between gap-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
            <span class="font-bold dark:text-white">${LABELS[key] || key}</span>
            <input type="checkbox" data-feature-toggle="${key}" class="w-5 h-5" ${isFeatureEnabled(flags, key) ? 'checked' : ''}>
          </label>`).join('')}</div>
        <button id="open-hidden-leaderboard" class="mt-5 w-full bg-gray-800 text-white py-3 rounded-xl font-bold">فتح لوحة الشرف للأونر</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) closePanel(); });
    overlay.querySelector('#close-feature-panel').addEventListener('click', closePanel);
    overlay.querySelector('#open-hidden-leaderboard').addEventListener('click', () => { closePanel(); location.hash = 'leaderboard'; });
    overlay.querySelectorAll('[data-feature-toggle]').forEach(input => input.addEventListener('change', async () => {
        await setDoc(doc(db, 'system', 'feature_flags'), { [input.dataset.featureToggle]: input.checked }, { merge: true });
    }));
};

const addOwnerSettingsLink = () => {
    if (!isOwner || document.getElementById('owner-extra-features-btn')) return;
    const adminLinks = document.getElementById('admin-sidebar-links');
    if (!adminLinks) return;
    const button = document.createElement('button');
    button.id = 'owner-extra-features-btn';
    button.className = 'w-full flex items-center gap-3 p-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition';
    button.innerHTML = '<i class="fas fa-sliders-h w-6 text-center"></i><span>الميزات الإضافية</span>';
    button.addEventListener('click', openOwnerPanel);
    adminLinks.appendChild(button);
};

const observer = new MutationObserver(() => { applyFeatureVisibility(); addOwnerSettingsLink(); });
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
window.addEventListener('hashchange', guardDisabledRoutes);
document.addEventListener('click', event => {
    const dmButton = event.target.closest?.('button[onclick*="openDMPanel"]');
    if (dmButton && !isFeatureEnabled(flags, 'privateMessages')) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);

auth.onAuthStateChanged(user => {
    isOwner = user?.email === SUPER_ADMIN_EMAIL;
    if (unsubscribeFlags) unsubscribeFlags();
    if (!user) { flags = normalizeFeatureFlags(); applyFeatureVisibility(); return; }
    unsubscribeFlags = onSnapshot(doc(db, 'system', 'feature_flags'), snapshot => {
        flags = normalizeFeatureFlags(snapshot.exists() ? snapshot.data() : OFFICIAL_MODE_DEFAULTS);
        applyFeatureVisibility(); guardDisabledRoutes(); addOwnerSettingsLink();
    });
});

window.openOfficialFeatureSettings = openOwnerPanel;
