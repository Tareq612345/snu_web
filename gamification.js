// ============================================================
// gamification.js - النقط والمستويات والبيجات
// ============================================================

import { db, auth } from './firebase.js';
import {
    doc, getDoc, updateDoc, setDoc, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ============================================================
// الليڤلات والنقط المطلوبة
// ============================================================
const LEVELS = [
    { level: 1, name: 'مبتدئ', minXP: 0, badge: '🌱', color: 'gray' },
    { level: 2, name: 'متعلم', minXP: 100, badge: '📚', color: 'green' },
    { level: 3, name: 'نشيط', minXP: 300, badge: '⭐', color: 'blue' },
    { level: 4, name: 'متميز', minXP: 600, badge: '🌟', color: 'purple' },
    { level: 5, name: 'خبير', minXP: 1000, badge: '💎', color: 'indigo' },
    { level: 6, name: 'محترف', minXP: 1500, badge: '🏆', color: 'yellow' },
    { level: 7, name: 'أسطورة', minXP: 2500, badge: '👑', color: 'red' },
    { level: 8, name: 'ملك مسار', minXP: 5000, badge: '🔥', color: 'orange' }
];

// ============================================================
// البيجات والإنجازات
// ============================================================
const ACHIEVEMENTS = [
    // الإنجازات الأساسية
    { id: 'first_login', name: 'أول خطوة', desc: 'سجل دخولك لأول مرة', badge: '🎉', xp: 10 },
    { id: 'streak_3', name: 'مثابر', desc: 'حافظ على streak لـ 3 أيام', badge: '🔥', xp: 30 },
    { id: 'streak_7', name: 'ملتزم', desc: 'حافظ على streak لـ 7 أيام', badge: '💪', xp: 70 },
    { id: 'streak_30', name: 'بطل الشهر', desc: 'حافظ على streak لـ 30 يوم', badge: '🏅', xp: 300 },
    { id: 'quiz_first', name: 'أول اختبار', desc: 'أكمل أول اختبار', badge: '📝', xp: 15 },
    { id: 'quiz_10', name: 'مختبر', desc: 'أكمل 10 اختبارات', badge: '📊', xp: 50 },
    { id: 'quiz_perfect', name: 'درجة كاملة', desc: 'احصل على 100% في اختبار', badge: '💯', xp: 100 },
    { id: 'dm_first', name: 'اجتماعي', desc: 'أرسل أول رسالة خاصة', badge: '💬', xp: 10 },
    { id: 'verified', name: 'موثق', desc: 'وثق حسابك', badge: '✅', xp: 50 },
    { id: 'bookmark_10', name: 'منظم', desc: 'أضف 10 مفضلات', badge: '📌', xp: 20 },
    { id: 'notes_5', name: 'مدوّن', desc: 'أنشئ 5 ملاحظات', badge: '📒', xp: 25 },

    // إنجازات وقت المذاكرة
    { id: 'study_1h', name: 'مذاكر', desc: 'ذاكر لمدة ساعة', badge: '⏰', xp: 15 },
    { id: 'study_5h', name: 'مجتهد', desc: 'ذاكر لمدة 5 ساعات', badge: '📚', xp: 50 },
    { id: 'study_10h', name: 'متفوق', desc: 'ذاكر لمدة 10 ساعات', badge: '🎓', xp: 100 },
    { id: 'study_50h', name: 'عبقري', desc: 'ذاكر لمدة 50 ساعة', badge: '🧠', xp: 500 },

    // إنجازات المشاركة
    { id: 'chat_10', name: 'متحدث', desc: 'أرسل 10 رسائل في الشات', badge: '🗣️', xp: 20 },
    { id: 'chat_100', name: 'نشط', desc: 'أرسل 100 رسالة في الشات', badge: '💬', xp: 80 },
    { id: 'comment_5', name: 'معلق', desc: 'أضف 5 تعليقات على الدروس', badge: '💭', xp: 25 },

    // إنجازات الاستكشاف
    { id: 'explore_5', name: 'مستكشف', desc: 'شاهد 5 دروس مختلفة', badge: '🔍', xp: 20 },
    { id: 'explore_20', name: 'رحالة', desc: 'شاهد 20 درس مختلف', badge: '🗺️', xp: 80 },

    // إنجازات الهدف اليومي
    { id: 'daily_goal_1', name: 'منجز', desc: 'حقق هدفك اليومي مرة', badge: '🎯', xp: 20 },
    { id: 'daily_goal_7', name: 'ملتزم بالأهداف', desc: 'حقق هدفك اليومي 7 مرات', badge: '🏆', xp: 100 },
    { id: 'daily_goal_30', name: 'سيد الانضباط', desc: 'حقق هدفك اليومي 30 مرة', badge: '👑', xp: 500 },

    // 🆕 إنجازات اجتماعية جديدة
    { id: 'followers_10', name: 'مشهور', desc: 'احصل على 10 متابعين', badge: '⭐', xp: 50 },
    { id: 'followers_50', name: 'نجم', desc: 'احصل على 50 متابع', badge: '🌟', xp: 150 },
    { id: 'followers_100', name: 'مؤثر', desc: 'احصل على 100 متابع', badge: '🌠', xp: 300 },
    { id: 'following_20', name: 'متواصل', desc: 'تابع 20 طالب', badge: '👥', xp: 30 },

    // 🆕 إنجازات الترتيب
    { id: 'leaderboard_top10', name: 'في القمة', desc: 'كن من أول 10 في الترتيب', badge: '🥇', xp: 200 },
    { id: 'leaderboard_top3', name: 'بطل المنصة', desc: 'كن من أول 3 في الترتيب', badge: '🏆', xp: 500 },

    // 🆕 إنجازات الدرجات
    { id: 'grade_excellent', name: 'ممتاز', desc: 'احصل على درجة ممتاز', badge: '🌟', xp: 100 },
    { id: 'grade_all_pass', name: 'ناجح في الكل', desc: 'نجح في جميع المواد', badge: '✨', xp: 200 },
    { id: 'grade_improve', name: 'متطور', desc: 'تحسنت درجتك عن الفصل السابق', badge: '📈', xp: 75 },

    // 🆕 إنجازات الحضور
    { id: 'attendance_full', name: 'منتظم', desc: 'حضور كامل في الشهر', badge: '📅', xp: 100 },
    { id: 'attendance_streak_7', name: 'متواجد', desc: 'سجل حضور 7 أيام متتالية', badge: '✓', xp: 50 },

    // 🆕 إنجازات خاصة
    { id: 'early_bird', name: 'طائر مبكر', desc: 'سجل دخول قبل 7 صباحاً', badge: '🐦', xp: 25 },
    { id: 'night_owl', name: 'بومة الليل', desc: 'ذاكر بعد منتصف الليل', badge: '🦉', xp: 25 },
    { id: 'helper', name: 'مساعد', desc: 'ساعد 5 طلاب في الشات', badge: '🤝', xp: 75 },
    { id: 'report_bug', name: 'مكتشف', desc: 'أبلغ عن خطأ في المنصة', badge: '🐛', xp: 50 }
];

// ============================================================
// 3. دوال المستويات
// ============================================================
export const getLevelInfo = (xp) => {
    let currentLevel = LEVELS[0];
    for (const level of LEVELS) {
        if (xp >= level.minXP) currentLevel = level;
        else break;
    }

    const nextLevel = LEVELS.find(l => l.minXP > xp) || currentLevel;
    const progress = nextLevel.minXP > currentLevel.minXP
        ? ((xp - currentLevel.minXP) / (nextLevel.minXP - currentLevel.minXP)) * 100
        : 100;

    return {
        ...currentLevel,
        xp,
        nextLevel,
        progress: Math.min(progress, 100),
        xpToNext: nextLevel.minXP - xp
    };
};

// ============================================================
// 4. إضافة XP
// ============================================================
export const addXP = async (amount, reason = '') => {
    const user = auth.currentUser;
    if (!user || amount <= 0) return;

    try {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        const oldXP = userDoc.exists() ? (userDoc.data().totalXp || 0) : 0;
        const oldLevel = getLevelInfo(oldXP);

        // استخدام totalXp بدلاً من xp للتوحيد
        await updateDoc(userRef, {
            totalXp: increment(amount),
            lastXPGain: serverTimestamp()
        });

        const newXP = oldXP + amount;
        const newLevel = getLevelInfo(newXP);

        // إشعار بالنقاط
        window.showToast?.(`+${amount} XP ${reason}`, 'success');

        // إشعار بترقية المستوى
        if (newLevel.level > oldLevel.level) {
            setTimeout(() => {
                showLevelUpModal(newLevel);
            }, 500);
        }

        return newXP;

    } catch (e) {
        console.error('Error adding XP:', e);
    }
};

// ============================================================
// 5. عرض ترقية المستوى
// ============================================================
const showLevelUpModal = (level) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[500] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-gradient-to-br from-primary-500 to-primary-700 text-white p-8 rounded-3xl text-center max-w-sm w-full shadow-2xl animate-slide-up">
            <div class="text-6xl mb-4 animate-bounce">${level.badge}</div>
            <h2 class="text-3xl font-black mb-2">مبروك! 🎉</h2>
            <p class="text-xl mb-4">وصلت للمستوى ${level.level}</p>
            <div class="bg-white/20 rounded-2xl p-4 mb-6">
                <p class="text-2xl font-bold">${level.name}</p>
            </div>
            <button onclick="this.closest('div.fixed').remove()" class="bg-white text-primary-600 font-bold px-8 py-3 rounded-xl hover:scale-105 transition">
                رائع! 🚀
            </button>
        </div>
    `;
    document.body.appendChild(modal);
};

// ============================================================
// 6. منح إنجاز
// ============================================================
export const grantAchievement = async (achievementId) => {
    const user = auth.currentUser;
    if (!user) return;

    const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!achievement) return;

    try {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        const achievements = userDoc.exists() ? (userDoc.data().achievements || []) : [];

        if (achievements.includes(achievementId)) return;

        await updateDoc(userRef, {
            achievements: [...achievements, achievementId],
            xp: increment(achievement.xp)
        });

        showAchievementToast(achievement);

    } catch (e) {
        console.error('Error granting achievement:', e);
    }
};

const showAchievementToast = (achievement) => {
    const toast = document.createElement('div');
    toast.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-6 py-4 rounded-2xl shadow-2xl z-[500] animate-slide-up flex items-center gap-4';
    toast.innerHTML = `
        <div class="text-4xl">${achievement.badge}</div>
        <div>
            <p class="text-xs font-bold opacity-80">🏆 إنجاز جديد!</p>
            <p class="font-black text-lg">${achievement.name}</p>
            <p class="text-xs opacity-80">+${achievement.xp} XP</p>
        </div>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
};

// ============================================================
// 7. ويدجت المستوى
// ============================================================
export const renderLevelWidget = async (containerId) => {
    const user = auth.currentUser;
    if (!user) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const xp = userDoc.exists() ? (userDoc.data().xp || 0) : 0;
        const level = getLevelInfo(xp);

        container.innerHTML = `
            <div class="bg-gradient-to-br from-primary-500/10 to-primary-600/10 p-4 rounded-2xl border border-primary-200 dark:border-primary-800">
                <div class="flex items-center gap-3 mb-3">
                    <div class="text-4xl">${level.badge}</div>
                    <div>
                        <p class="font-black text-lg dark:text-white">المستوى ${level.level}</p>
                        <p class="text-sm text-primary-600 dark:text-primary-400 font-bold">${level.name}</p>
                    </div>
                    <div class="mr-auto text-right">
                        <p class="text-2xl font-black text-primary-600">${xp}</p>
                        <p class="text-[10px] text-surface-500">XP</p>
                    </div>
                </div>
                <div class="bg-surface-200 dark:bg-surface-700 rounded-full h-3 overflow-hidden">
                    <div class="bg-gradient-to-r from-primary-500 to-primary-600 h-full rounded-full transition-all duration-500" style="width: ${level.progress}%"></div>
                </div>
                <p class="text-[10px] text-surface-500 mt-1 text-center">${level.xpToNext > 0 ? `${level.xpToNext} XP للمستوى التالي` : 'أعلى مستوى! 🔥'}</p>
            </div>
        `;

    } catch (e) {
        console.error('Error rendering level widget:', e);
    }
};

// ============================================================
// 8. صفحة الإنجازات
// ============================================================
export const renderAchievementsPage = async (containerId) => {
    const user = auth.currentUser;
    if (!user) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userAchievements = userDoc.exists() ? (userDoc.data().achievements || []) : [];

        container.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                ${ACHIEVEMENTS.map(a => {
            const unlocked = userAchievements.includes(a.id);
            return `
                        <div class="p-4 rounded-2xl text-center transition hover:scale-105 ${unlocked
                    ? 'bg-gradient-to-br from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30 border-2 border-yellow-400'
                    : 'bg-surface-100 dark:bg-surface-800 opacity-60'}">
                            <div class="text-4xl mb-2 ${unlocked ? '' : 'grayscale'}">${a.badge}</div>
                            <p class="font-bold text-sm dark:text-white">${a.name}</p>
                            <p class="text-[10px] text-surface-500 mt-1">${a.desc}</p>
                            <p class="text-xs font-bold mt-2 ${unlocked ? 'text-accent-600' : 'text-surface-400'}">${unlocked ? '✅ مفتوح' : `🔒 ${a.xp} XP`}</p>
                        </div>
                    `;
        }).join('')}
            </div>
        `;

    } catch (e) {
        console.error('Error rendering achievements:', e);
    }
};

// ============================================================
// 9. التحقق التلقائي من الإنجازات (Auto Badge Checker)
// ============================================================
export const checkAndGrantBadges = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) return;

        const userData = userDoc.data();
        const achievements = userData.achievements || [];

        // 1. أول دخول
        if (!achievements.includes('first_login')) {
            await grantAchievement('first_login');
        }

        // 2. Streak checks
        const streak = userData.currentStreak || 0;
        if (streak >= 3 && !achievements.includes('streak_3')) {
            await grantAchievement('streak_3');
        }
        if (streak >= 7 && !achievements.includes('streak_7')) {
            await grantAchievement('streak_7');
        }
        if (streak >= 30 && !achievements.includes('streak_30')) {
            await grantAchievement('streak_30');
        }

        // 3. التوثيق
        if (userData.isVerified && !achievements.includes('verified')) {
            await grantAchievement('verified');
        }

    } catch (e) {
        console.error('Error checking badges:', e);
    }
};

// التحقق من إنجازات الكويز بعد إكمال كويز
export const checkQuizBadges = async (score, totalQuizzes) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const achievements = userDoc.exists() ? (userDoc.data().achievements || []) : [];

        // أول كويز
        if (totalQuizzes >= 1 && !achievements.includes('quiz_first')) {
            await grantAchievement('quiz_first');
        }

        // 10 كويزات
        if (totalQuizzes >= 10 && !achievements.includes('quiz_10')) {
            await grantAchievement('quiz_10');
        }

        // درجة كاملة
        if (score === 100 && !achievements.includes('quiz_perfect')) {
            await grantAchievement('quiz_perfect');
        }

    } catch (e) {
        console.error('Error checking quiz badges:', e);
    }
};

// تشغيل التحقق تلقائياً عند تحميل الصفحة
window.addEventListener('load', () => {
    setTimeout(() => {
        if (auth.currentUser) {
            checkAndGrantBadges();
            startStudyTimeTracker(); // تشغيل تتبع الوقت
        }
    }, 3000); // انتظار 3 ثواني بعد تحميل الصفحة
});

// ============================================================
// 11. نظام تتبع وقت المذاكرة (Study Time Tracker)
// ============================================================
let studyTrackingInterval = null;
let lastActivityTime = Date.now();
const XP_PER_HOUR = 10; // 10 XP لكل ساعة مذاكرة
const CHECK_INTERVAL = 60000; // كل دقيقة
const IDLE_TIMEOUT = 300000; // 5 دقائق بدون نشاط = idle

// تتبع نشاط المستخدم
const trackActivity = () => {
    lastActivityTime = Date.now();
};

// بداية التتبع
const startStudyTimeTracker = async () => {
    if (studyTrackingInterval) return; // منع التكرار

    // تتبع النشاط
    ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'].forEach(event => {
        document.addEventListener(event, trackActivity, { passive: true });
    });

    // كل دقيقة، تحقق وزيّد الوقت
    studyTrackingInterval = setInterval(async () => {
        const user = auth.currentUser;
        if (!user) return;

        // لو مر أكتر من 5 دقايق بدون نشاط، مبنحسبش
        if (Date.now() - lastActivityTime > IDLE_TIMEOUT) {
            return;
        }

        try {
            const userRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userRef);
            const data = userDoc.exists() ? userDoc.data() : {};
            const oldMinutes = data.studyMinutes || 0;
            const newMinutes = oldMinutes + 1;

            // تحديث الدقائق
            await updateDoc(userRef, {
                studyMinutes: newMinutes,
                lastStudyTime: serverTimestamp()
            });

            // كل ساعة كاملة (60 دقيقة) = مكافأة XP
            if (newMinutes > 0 && newMinutes % 60 === 0) {
                const hoursCompleted = Math.floor(newMinutes / 60);
                await addXP(XP_PER_HOUR, `⏰ ساعة مذاكرة #${hoursCompleted}`);

                // تحقق من إنجازات وقت المذاكرة
                checkStudyTimeAchievements(hoursCompleted);
            }

            // تحقق من تحقيق الهدف اليومي
            checkDailyGoal(newMinutes);

        } catch (e) {
            console.error('Study tracking error:', e);
        }
    }, CHECK_INTERVAL);

    console.log('📚 Study time tracker started');
};

// إيقاف التتبع
const stopStudyTimeTracker = () => {
    if (studyTrackingInterval) {
        clearInterval(studyTrackingInterval);
        studyTrackingInterval = null;
    }
};

// ============================================================
// 12. نظام الأهداف اليومية (Daily Goals)
// ============================================================
const DEFAULT_DAILY_GOAL = 30; // 30 دقيقة افتراضي

// تحقق من تحقيق الهدف اليومي
const checkDailyGoal = async (todayMinutes) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        const data = userDoc.exists() ? userDoc.data() : {};

        const dailyGoal = data.dailyGoal || DEFAULT_DAILY_GOAL;
        const today = new Date().toDateString();
        const lastGoalDate = data.lastGoalCompletedDate;

        // لو حقق الهدف اليوم خلاص
        if (lastGoalDate === today) return;

        // تحقق هل وصل للهدف
        if (todayMinutes >= dailyGoal) {
            const goalsCompleted = (data.goalsCompleted || 0) + 1;

            await updateDoc(userRef, {
                lastGoalCompletedDate: today,
                goalsCompleted: goalsCompleted
            });

            // مكافأة XP
            const bonusXP = 15;
            await addXP(bonusXP, '🎯 حققت هدفك اليومي!');

            // إنجازات الأهداف
            if (goalsCompleted === 1) await grantAchievement('daily_goal_1');
            if (goalsCompleted === 7) await grantAchievement('daily_goal_7');
            if (goalsCompleted === 30) await grantAchievement('daily_goal_30');

            // إشعار
            showDailyGoalCompleteToast();
        }
    } catch (e) {
        console.error('Daily goal check error:', e);
    }
};

// تحقق من إنجازات وقت المذاكرة
const checkStudyTimeAchievements = async (totalHours) => {
    if (totalHours >= 1) await grantAchievement('study_1h');
    if (totalHours >= 5) await grantAchievement('study_5h');
    if (totalHours >= 10) await grantAchievement('study_10h');
    if (totalHours >= 50) await grantAchievement('study_50h');
};

// نافذة تحقيق الهدف اليومي
const showDailyGoalCompleteToast = () => {
    const toast = document.createElement('div');
    toast.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[9999] animate-bounce-in';
    toast.innerHTML = `
        <div class="bg-gradient-to-r from-accent-500 to-accent-600 text-white px-8 py-6 rounded-3xl shadow-2xl text-center">
            <div class="text-6xl mb-3">🎯</div>
            <h3 class="text-2xl font-black mb-2">مبروك!</h3>
            <p class="text-lg opacity-90">حققت هدفك اليومي! 🎉</p>
            <p class="text-sm opacity-75 mt-2">+15 XP</p>
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
};

// عرض ويدجت الهدف اليومي
window.renderDailyGoalWidget = async (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const user = auth.currentUser;
    if (!user) return;

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const data = userDoc.exists() ? userDoc.data() : {};

        const dailyGoal = data.dailyGoal || DEFAULT_DAILY_GOAL;
        const todayMinutes = data.studyMinutes % (24 * 60) || 0; // دقائق اليوم
        const today = new Date().toDateString();
        const isCompleted = data.lastGoalCompletedDate === today;
        const progress = Math.min((todayMinutes / dailyGoal) * 100, 100);

        container.innerHTML = `
            <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-4 rounded-2xl shadow-lg">
                <div class="flex justify-between items-center mb-3">
                    <h4 class="font-bold flex items-center gap-2"><i class="fas fa-bullseye"></i> هدف اليوم</h4>
                    <button onclick="window.openGoalSettingsModal()" class="text-white/70 hover:text-white transition text-sm">
                        <i class="fas fa-cog"></i>
                    </button>
                </div>
                <div class="bg-white/20 rounded-full h-4 mb-2 overflow-hidden">
                    <div class="bg-white h-full rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                </div>
                <div class="flex justify-between text-sm">
                    <span>${todayMinutes} دقيقة</span>
                    <span>${isCompleted ? '✅ تم!' : `الهدف: ${dailyGoal} دقيقة`}</span>
                </div>
            </div>
        `;
    } catch (e) {
        console.error('Daily goal widget error:', e);
    }
};

// نافذة تعديل الهدف اليومي
window.openGoalSettingsModal = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const currentGoal = userDoc.exists() ? (userDoc.data().dailyGoal || DEFAULT_DAILY_GOAL) : DEFAULT_DAILY_GOAL;

    const modal = document.createElement('div');
    modal.id = 'goal-settings-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-3xl p-6 w-[90%] max-w-sm shadow-2xl">
            <h3 class="text-xl font-black mb-4 dark:text-white text-center">🎯 حدد هدفك اليومي</h3>
            <p class="text-surface-500 dark:text-surface-400 text-sm text-center mb-4">كم دقيقة تريد أن تذاكر يومياً؟</p>
            <div class="flex items-center justify-center gap-4 mb-6">
                <button onclick="window.adjustGoal(-15)" class="w-12 h-12 bg-surface-100 dark:bg-surface-700 rounded-xl text-2xl font-bold hover:bg-surface-200">−</button>
                <input type="number" id="goal-input" value="${currentGoal}" min="15" max="180" step="15" class="w-24 text-center text-3xl font-black bg-transparent border-b-4 border-primary-500 dark:text-white outline-none">
                <button onclick="window.adjustGoal(15)" class="w-12 h-12 bg-surface-100 dark:bg-surface-700 rounded-xl text-2xl font-bold hover:bg-surface-200">+</button>
            </div>
            <p class="text-center text-surface-400 text-xs mb-4">دقيقة</p>
            <div class="flex gap-3">
                <button onclick="document.getElementById('goal-settings-modal').remove()" class="flex-1 py-3 rounded-xl bg-surface-100 dark:bg-surface-700 font-bold dark:text-white">إلغاء</button>
                <button onclick="window.saveGoalSettings()" class="flex-1 py-3 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700">حفظ</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};

window.adjustGoal = (delta) => {
    const input = document.getElementById('goal-input');
    const newVal = Math.max(15, Math.min(180, parseInt(input.value) + delta));
    input.value = newVal;
};

window.saveGoalSettings = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const goal = parseInt(document.getElementById('goal-input').value);
    await updateDoc(doc(db, "users", user.uid), { dailyGoal: goal });
    document.getElementById('goal-settings-modal').remove();
    window.showToast?.('✅ تم حفظ الهدف اليومي', 'success');
    window.renderDailyGoalWidget?.('daily-goal-widget');
};

// ============================================================
// 14. ويدجت المهام اليومية (Daily Tasks Widget)
// ============================================================
window.renderDailyTasksWidget = async (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const user = auth.currentUser;
    if (!user) {
        container.innerHTML = '<p class="text-surface-400 text-center text-sm">سجل دخولك لعرض المهام</p>';
        return;
    }

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const data = userDoc.exists() ? userDoc.data() : {};
        const today = new Date().toDateString();
        const completedTasks = data.completedDailyTasks?.[today] || [];

        // المهام اليومية مع الـ XP
        const dailyTasks = [
            { id: 'login', name: 'تسجيل الدخول اليوم', xp: 5, icon: 'fa-door-open', completed: true },
            { id: 'study_15min', name: 'ذاكر 15 دقيقة', xp: 10, icon: 'fa-clock', completed: (data.studyMinutes || 0) >= 15 },
            { id: 'quiz_1', name: 'أكمل كويز واحد', xp: 15, icon: 'fa-question-circle', completed: completedTasks.includes('quiz_1') },
            { id: 'note_1', name: 'أضف ملاحظة', xp: 5, icon: 'fa-sticky-note', completed: completedTasks.includes('note_1') },
            { id: 'streak', name: 'حافظ على الـ Streak', xp: 10, icon: 'fa-fire', completed: (data.currentStreak || 0) > 0 }
        ];

        const totalXP = dailyTasks.filter(t => t.completed).reduce((sum, t) => sum + t.xp, 0);
        const maxXP = dailyTasks.reduce((sum, t) => sum + t.xp, 0);

        container.innerHTML = `
            <div class="bg-white dark:bg-surface-800 rounded-2xl shadow-lg border dark:border-surface-700 overflow-hidden">
                <div class="bg-gradient-to-r from-yellow-500 to-orange-500 p-4 text-white">
                    <div class="flex justify-between items-center">
                        <h3 class="font-bold flex items-center gap-2"><i class="fas fa-tasks"></i> مهام اليوم</h3>
                        <div class="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">
                            ⭐ ${totalXP}/${maxXP} XP
                        </div>
                    </div>
                </div>
                <div class="p-4 space-y-3">
                    ${dailyTasks.map(task => `
                        <div class="flex items-center gap-3 p-3 rounded-xl ${task.completed ? 'bg-accent-50 dark:bg-accent-900/20' : 'bg-surface-50 dark:bg-surface-700'} transition">
                            <div class="w-10 h-10 rounded-xl flex items-center justify-center ${task.completed ? 'bg-accent-500 text-white' : 'bg-surface-200 dark:bg-surface-600 text-surface-500'}">
                                <i class="fas ${task.completed ? 'fa-check' : task.icon}"></i>
                            </div>
                            <div class="flex-1">
                                <p class="font-bold text-sm dark:text-white ${task.completed ? 'line-through opacity-60' : ''}">${task.name}</p>
                                <p class="text-xs ${task.completed ? 'text-accent-500' : 'text-yellow-600'}">+${task.xp} XP</p>
                            </div>
                            ${task.completed ? '<span class="text-accent-500 text-lg">✓</span>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } catch (e) {
        console.error('Daily tasks error:', e);
        container.innerHTML = '<p class="text-red-500 text-center text-sm">خطأ في تحميل المهام</p>';
    }
};

// فتح panel المهام اليومية
window.openDailyTasksPanel = async () => {
    const modal = document.createElement('div');
    modal.id = 'daily-tasks-modal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden">
            <div class="sticky top-0 bg-white dark:bg-surface-800 p-4 border-b dark:border-surface-700 flex justify-between items-center">
                <h3 class="font-black text-xl dark:text-white flex items-center gap-2">
                    <i class="fas fa-tasks text-yellow-500"></i> المهام والتحديات
                </h3>
                <button onclick="document.getElementById('daily-tasks-modal').remove()" class="w-10 h-10 rounded-xl bg-surface-100 dark:bg-surface-700 hover:bg-red-100 hover:text-red-500 transition flex items-center justify-center">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="p-4 flex gap-2 border-b dark:border-surface-700">
                <button onclick="window.showTasksTab('daily')" id="tab-daily" class="flex-1 py-2 rounded-xl font-bold text-sm bg-yellow-500 text-white">اليومية</button>
                <button onclick="window.showTasksTab('weekly')" id="tab-weekly" class="flex-1 py-2 rounded-xl font-bold text-sm bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300">الأسبوعية</button>
            </div>
            <div id="daily-tasks-content" class="overflow-y-auto max-h-[60vh]"></div>
            <div id="weekly-tasks-content" class="overflow-y-auto max-h-[60vh] hidden"></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    await window.renderDailyTasksWidget('daily-tasks-content');
    await window.renderWeeklyTasks('weekly-tasks-content');
};

// تبديل التابات
window.showTasksTab = (tab) => {
    const dailyContent = document.getElementById('daily-tasks-content');
    const weeklyContent = document.getElementById('weekly-tasks-content');
    const dailyTab = document.getElementById('tab-daily');
    const weeklyTab = document.getElementById('tab-weekly');

    if (tab === 'daily') {
        dailyContent.classList.remove('hidden');
        weeklyContent.classList.add('hidden');
        dailyTab.className = 'flex-1 py-2 rounded-xl font-bold text-sm bg-yellow-500 text-white';
        weeklyTab.className = 'flex-1 py-2 rounded-xl font-bold text-sm bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300';
    } else {
        dailyContent.classList.add('hidden');
        weeklyContent.classList.remove('hidden');
        weeklyTab.className = 'flex-1 py-2 rounded-xl font-bold text-sm bg-primary-500 text-white';
        dailyTab.className = 'flex-1 py-2 rounded-xl font-bold text-sm bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300';
    }
};

// ============================================================
// التحديات الأسبوعية
// ============================================================
window.renderWeeklyTasks = async (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const user = auth.currentUser;
    if (!user) {
        container.innerHTML = '<p class="text-center text-surface-400 p-4">سجل دخولك أولاً</p>';
        return;
    }

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const data = userDoc.exists() ? userDoc.data() : {};

        // حساب بداية الأسبوع
        const now = new Date();
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay())).toDateString();
        const weeklyProgress = data.weeklyProgress?.[weekStart] || {};

        // التحديات الأسبوعية
        const weeklyTasks = [
            { id: 'streak_7', name: 'حافظ على Streak 7 أيام', xp: 100, icon: 'fa-fire', target: 7, current: data.currentStreak || 0 },
            { id: 'quiz_5', name: 'أكمل 5 كويزات', xp: 75, icon: 'fa-question-circle', target: 5, current: weeklyProgress.quizzes || 0 },
            { id: 'study_2h', name: 'ذاكر ساعتين', xp: 50, icon: 'fa-clock', target: 120, current: weeklyProgress.studyMinutes || 0 },
            { id: 'chat_20', name: 'أرسل 20 رسالة في الشات', xp: 40, icon: 'fa-comments', target: 20, current: weeklyProgress.messages || 0 },
            { id: 'perfect_quiz', name: 'احصل على 100% في كويز', xp: 150, icon: 'fa-trophy', target: 1, current: weeklyProgress.perfectQuizzes || 0 }
        ];

        const completedXP = weeklyTasks.filter(t => t.current >= t.target).reduce((sum, t) => sum + t.xp, 0);
        const totalXP = weeklyTasks.reduce((sum, t) => sum + t.xp, 0);

        container.innerHTML = `
            <div class="p-4">
                <div class="bg-gradient-to-r from-primary-500 to-primary-600 rounded-2xl p-4 text-white mb-4">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="text-sm opacity-80">تحديات هذا الأسبوع</p>
                            <p class="text-2xl font-black">⭐ ${completedXP}/${totalXP} XP</p>
                        </div>
                        <div class="text-4xl">🏆</div>
                    </div>
                </div>
                <div class="space-y-3">
                    ${weeklyTasks.map(task => {
            const progress = Math.min((task.current / task.target) * 100, 100);
            const completed = task.current >= task.target;
            return `
                            <div class="p-4 rounded-xl ${completed ? 'bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-800' : 'bg-surface-50 dark:bg-surface-700'}">
                                <div class="flex items-center gap-3 mb-2">
                                    <div class="w-10 h-10 rounded-xl flex items-center justify-center ${completed ? 'bg-accent-500 text-white' : 'bg-primary-100 dark:bg-primary-900/50 text-primary-600'}">
                                        <i class="fas ${completed ? 'fa-check' : task.icon}"></i>
                                    </div>
                                    <div class="flex-1">
                                        <p class="font-bold text-sm dark:text-white ${completed ? 'line-through opacity-60' : ''}">${task.name}</p>
                                        <p class="text-xs ${completed ? 'text-accent-500' : 'text-primary-600'}">+${task.xp} XP</p>
                                    </div>
                                    <span class="text-sm font-bold ${completed ? 'text-accent-500' : 'text-surface-500'}">${task.current}/${task.target}</span>
                                </div>
                                <div class="h-2 bg-surface-200 dark:bg-surface-600 rounded-full overflow-hidden">
                                    <div class="h-full ${completed ? 'bg-accent-500' : 'bg-primary-500'} rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    } catch (e) {
        console.error('Weekly tasks error:', e);
        container.innerHTML = '<p class="text-red-500 text-center text-sm p-4">خطأ في تحميل التحديات</p>';
    }
};

// ============================================================
// شهادات PDF
// ============================================================
window.generateCertificate = async (type, courseTitle = '') => {
    const user = auth.currentUser;
    if (!user) return window.showToast?.('سجل دخولك أولاً');

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};
        const userName = userData.displayName || user.displayName || 'طالب';
        const college = userData.collegeName || 'غير محدد';

        // إنشاء عنصر HTML للشهادة
        const certDiv = document.createElement('div');
        certDiv.id = 'certificate-temp';
        certDiv.style.cssText = 'position: fixed; left: -9999px; width: 842px; height: 595px; background: white;';

        const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
        const certId = `CERT-${Date.now().toString(36).toUpperCase()}`;

        let certTitle = 'شهادة إتمام';
        let certDesc = `أتم بنجاح متطلبات ${type === 'quiz' ? 'الاختبار' : 'الدورة'}`;

        certDiv.innerHTML = `
            <div style="width: 100%; height: 100%; padding: 40px; box-sizing: border-box; font-family: 'Cairo', sans-serif; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); position: relative; overflow: hidden;">
                <!-- Border decoration -->
                <div style="position: absolute; inset: 15px; border: 3px solid #2563eb; border-radius: 10px;"></div>
                <div style="position: absolute; inset: 20px; border: 1px solid #2dd4bf; border-radius: 8px;"></div>
                
                <!-- Header -->
                <div style="text-align: center; margin-bottom: 30px; position: relative; z-index: 1;">
                    <div style="font-size: 24px; margin-bottom: 10px;">🎓</div>
                    <h1 style="font-size: 32px; color: #2563eb; margin: 0; font-weight: 900;">${certTitle}</h1>
                    <p style="color: #14b8a6; font-size: 14px; margin: 5px 0;">منصة مسار الجامعية</p>
                </div>
                
                <!-- Content -->
                <div style="text-align: center; margin: 40px 0; position: relative; z-index: 1;">
                    <p style="font-size: 18px; color: #374151; margin-bottom: 20px;">تشهد منصة مسار الجامعية بأن</p>
                    <h2 style="font-size: 36px; color: #1f2937; margin: 10px 0; font-weight: 900; border-bottom: 3px solid #2563eb; display: inline-block; padding: 0 20px 10px;">${userName}</h2>
                    <p style="font-size: 16px; color: #6b7280; margin-top: 20px;">${certDesc}</p>
                    ${courseTitle ? `<p style="font-size: 24px; color: #2563eb; font-weight: bold; margin-top: 10px;">${courseTitle}</p>` : ''}
                </div>
                
                <!-- Footer -->
                <div style="position: absolute; bottom: 40px; left: 50px; right: 50px; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div style="text-align: center;">
                        <p style="font-size: 12px; color: #9ca3af;">التاريخ</p>
                        <p style="font-size: 14px; color: #374151; font-weight: bold;">${today}</p>
                    </div>
                    <div style="text-align: center;">
                        <p style="font-size: 12px; color: #9ca3af;">رقم الشهادة</p>
                        <p style="font-size: 14px; color: #374151; font-weight: bold;">${certId}</p>
                    </div>
                    <div style="text-align: center;">
                        <p style="font-size: 12px; color: #9ca3af;">الكلية</p>
                        <p style="font-size: 14px; color: #374151; font-weight: bold;">${college}</p>
                    </div>
                </div>
                
                <!-- Watermark -->
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 120px; opacity: 0.03; color: #2563eb;">🎓</div>
            </div>
        `;

        document.body.appendChild(certDiv);

        // تحويل لـ PDF
        const canvas = await html2canvas(certDiv, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [842, 595] });
        pdf.addImage(imgData, 'PNG', 0, 0, 842, 595);
        pdf.save(`شهادة_${userName}_${certId}.pdf`);

        certDiv.remove();
        window.showToast?.('✅ تم تحميل الشهادة بنجاح!', 'success');

    } catch (e) {
        console.error('Certificate Error:', e);
        alert('حدث خطأ في إنشاء الشهادة');
    }
};

// ============================================================
// 15. تصدير
// ============================================================
window.addXP = addXP;
window.grantAchievement = grantAchievement;
window.getLevelInfo = getLevelInfo;
window.renderLevelWidget = renderLevelWidget;
window.renderAchievementsPage = renderAchievementsPage;
window.checkAndGrantBadges = checkAndGrantBadges;
window.checkQuizBadges = checkQuizBadges;
window.startStudyTimeTracker = startStudyTimeTracker;
window.stopStudyTimeTracker = stopStudyTimeTracker;
window.checkDailyGoal = checkDailyGoal;

export default { addXP, grantAchievement, getLevelInfo, checkAndGrantBadges, checkQuizBadges, startStudyTimeTracker, LEVELS, ACHIEVEMENTS };

