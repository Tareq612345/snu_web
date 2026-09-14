// ============================================================
// admin-stats.js - الإحصائيات والتقارير
// ============================================================

import { db, auth, SUPER_ADMIN_EMAIL } from './firebase.js';
import {
    collection, getDocs, query, limit
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ============================================================
// داشبورد الإحصائيات (Statistics Dashboard)
// ============================================================
export const openStatisticsDashboard = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '📊 داشبورد الإحصائيات';
    const content = document.getElementById('admin-view-content');

    content.innerHTML = '<div class="text-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-primary-600"></i><p class="mt-4 text-surface-500">جاري تحميل الإحصائيات...</p></div>';

    try {
        const usersSnap = await getDocs(collection(db, "users"));
        let totalUsers = 0, verifiedUsers = 0, onlineUsers = 0, pendingId = 0;
        const collegeStats = {};

        usersSnap.forEach(d => {
            const u = d.data();
            totalUsers++;
            if (u.isVerified) verifiedUsers++;
            if (u.isOnline) onlineUsers++;
            if (u.idCardImage && !u.isVerified) pendingId++;

            const col = u.collegeId || 'غير محدد';
            if (!collegeStats[col]) collegeStats[col] = { total: 0, verified: 0 };
            collegeStats[col].total++;
            if (u.isVerified) collegeStats[col].verified++;
        });

        const gradesSnap = await getDocs(collection(db, "final_grades"));
        const totalGrades = gradesSnap.size;

        let collegeRows = Object.entries(collegeStats).map(([col, stats]) => `
            <div class="flex items-center justify-between p-4 bg-surface-50 dark:bg-surface-700 rounded-xl">
                <span class="font-bold">${col}</span>
                <div class="flex gap-4">
                    <span class="text-primary-600">${stats.total} طالب</span>
                    <span class="text-accent-600">${stats.verified} موثق</span>
                </div>
            </div>
        `).join('');

        content.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-6 rounded-2xl text-center shadow-lg">
                    <div class="text-4xl font-black">${totalUsers}</div>
                    <div class="text-sm opacity-80">إجمالي المستخدمين</div>
                </div>
                <div class="bg-gradient-to-br from-accent-500 to-accent-600 text-white p-6 rounded-2xl text-center shadow-lg">
                    <div class="text-4xl font-black">${verifiedUsers}</div>
                    <div class="text-sm opacity-80">الموثقين</div>
                </div>
                <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-6 rounded-2xl text-center shadow-lg">
                    <div class="text-4xl font-black">${onlineUsers}</div>
                    <div class="text-sm opacity-80">متصلين الآن</div>
                </div>
                <div class="bg-gradient-to-br from-orange-500 to-red-600 text-white p-6 rounded-2xl text-center shadow-lg">
                    <div class="text-4xl font-black">${pendingId}</div>
                    <div class="text-sm opacity-80">بانتظار التوثيق</div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg">
                    <h3 class="font-bold text-lg mb-4 dark:text-white"><i class="fas fa-university ml-2 text-primary-500"></i>إحصائيات الكليات</h3>
                    <div class="space-y-3">${collegeRows}</div>
                </div>
                <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg">
                    <h3 class="font-bold text-lg mb-4 dark:text-white"><i class="fas fa-chart-bar ml-2 text-accent-500"></i>إحصائيات عامة</h3>
                    <div class="space-y-4">
                        <div class="flex justify-between items-center p-4 bg-surface-50 dark:bg-surface-700 rounded-xl">
                            <span>نسبة التوثيق</span>
                            <span class="font-bold text-accent-600">${Math.round((verifiedUsers / totalUsers) * 100)}%</span>
                        </div>
                        <div class="flex justify-between items-center p-4 bg-surface-50 dark:bg-surface-700 rounded-xl">
                            <span>الدرجات المرفوعة</span>
                            <span class="font-bold text-primary-600">${totalGrades}</span>
                        </div>
                        <div class="flex justify-between items-center p-4 bg-surface-50 dark:bg-surface-700 rounded-xl">
                            <span>معدل الطلاب/كلية</span>
                            <span class="font-bold text-primary-600">${Math.round(totalUsers / Object.keys(collegeStats).length)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        console.error('Stats error:', e);
        content.innerHTML = '<p class="text-center text-red-500 py-10">فشل تحميل الإحصائيات</p>';
    }
};
window.openStatisticsDashboard = openStatisticsDashboard;

// ============================================================
// لوحة الإحصائيات المتقدمة (Advanced Statistics Dashboard)
// ============================================================
export const openAdvancedStatsDashboard = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '📊 لوحة الإحصائيات المتقدمة';
    const content = document.getElementById('admin-view-content');
    content.innerHTML = '<div class="text-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-primary-600"></i><p class="mt-4 text-surface-500">جاري تحميل الإحصائيات...</p></div>';

    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const sectionsSnap = await getDocs(collection(db, "study_sections"));
        const scoresSnap = await getDocs(query(collection(db, "user_scores"), limit(500)));

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

        let totalUsers = 0;
        let activeToday = 0;
        let activeWeek = 0;
        let newThisWeek = 0;
        const dailyUsers = {};

        usersSnap.forEach(d => {
            totalUsers++;
            const u = d.data();
            const lastLogin = u.lastLogin?.toDate?.();
            const createdAt = u.createdAt?.toDate?.() || lastLogin;

            if (lastLogin) {
                if (lastLogin >= today) activeToday++;
                if (lastLogin >= weekAgo) activeWeek++;
            }
            if (createdAt && createdAt >= weekAgo) {
                newThisWeek++;
                const day = createdAt.toLocaleDateString('ar-EG', { weekday: 'short' });
                dailyUsers[day] = (dailyUsers[day] || 0) + 1;
            }
        });

        const subjectViews = {};
        scoresSnap.forEach(d => {
            const s = d.data();
            if (s.sectionTitle) {
                subjectViews[s.sectionTitle] = (subjectViews[s.sectionTitle] || 0) + 1;
            }
        });

        const topSubjects = Object.entries(subjectViews).sort((a, b) => b[1] - a[1]).slice(0, 5);

        content.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-6 rounded-2xl shadow-lg">
                    <div class="text-5xl font-black">${totalUsers}</div>
                    <div class="text-sm opacity-80 font-bold mt-2">إجمالي المستخدمين</div>
                </div>
                <div class="bg-gradient-to-br from-accent-500 to-accent-600 text-white p-6 rounded-2xl shadow-lg">
                    <div class="text-5xl font-black">${activeToday}</div>
                    <div class="text-sm opacity-80 font-bold mt-2">نشط اليوم</div>
                </div>
                <div class="bg-gradient-to-br from-orange-500 to-red-500 text-white p-6 rounded-2xl shadow-lg">
                    <div class="text-5xl font-black">${newThisWeek}</div>
                    <div class="text-sm opacity-80 font-bold mt-2">مستخدم جديد هذا الأسبوع</div>
                </div>
                <div class="bg-gradient-to-br from-primary-500 to-pink-600 text-white p-6 rounded-2xl shadow-lg">
                    <div class="text-5xl font-black">${Math.round((activeWeek / totalUsers) * 100)}%</div>
                    <div class="text-sm opacity-80 font-bold mt-2">نسبة النشاط الأسبوعي</div>
                </div>
            </div>
            
            <div class="grid md:grid-cols-2 gap-6">
                <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                    <h3 class="font-black text-lg mb-4 dark:text-white flex items-center gap-2">
                        <i class="fas fa-user-plus text-accent-500"></i> المستخدمين الجدد (آخر 7 أيام)
                    </h3>
                    <div class="space-y-2">
                        ${Object.entries(dailyUsers).map(([day, count]) => `
                            <div class="flex items-center gap-3">
                                <span class="w-16 text-sm font-bold text-surface-500">${day}</span>
                                <div class="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-6 overflow-hidden">
                                    <div class="bg-gradient-to-r from-accent-500 to-accent-500 h-full rounded-full flex items-center justify-end px-2" style="width: ${Math.min(count / Math.max(...Object.values(dailyUsers)) * 100, 100)}%">
                                        <span class="text-white text-xs font-bold">${count}</span>
                                    </div>
                                </div>
                            </div>
                        `).join('') || '<p class="text-surface-400 text-center">لا يوجد بيانات</p>'}
                    </div>
                </div>
                
                <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                    <h3 class="font-black text-lg mb-4 dark:text-white flex items-center gap-2">
                        <i class="fas fa-fire text-orange-500"></i> أكثر المواد نشاطاً
                    </h3>
                    <div class="space-y-3">
                        ${topSubjects.map(([name, count], i) => `
                            <div class="flex items-center gap-3">
                                <span class="w-8 h-8 rounded-full bg-gradient-to-r ${i === 0 ? 'from-yellow-400 to-orange-500' : i === 1 ? 'from-surface-300 to-surface-400' : i === 2 ? 'from-orange-300 to-orange-400' : 'from-surface-200 to-surface-300'} flex items-center justify-center text-white font-black text-sm">${i + 1}</span>
                                <div class="flex-1">
                                    <p class="font-bold dark:text-white text-sm truncate">${name}</p>
                                    <p class="text-xs text-surface-400">${count} تفاعل</p>
                                </div>
                            </div>
                        `).join('') || '<p class="text-surface-400 text-center">لا يوجد بيانات</p>'}
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        console.error('Statistics error:', e);
        content.innerHTML = '<p class="text-center text-red-500 p-10">حدث خطأ في تحميل الإحصائيات</p>';
    }
};
window.openAdvancedStatsDashboard = openAdvancedStatsDashboard;
