// ============================================================
// analytics.js - لوحة التحليلات المتقدمة للمدراء
// ============================================================

import { db, auth, SUPER_ADMIN_EMAIL } from './firebase.js';
import {
    collection, getDocs, query, where, orderBy, limit, getCountFromServer
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ============================================================
// 1. فتح لوحة التحليلات
// ============================================================
export const openAnalyticsDashboard = async () => {
    const area = document.getElementById('admin-view-area');
    if (!area) return;

    area.classList.remove('hidden');
    document.getElementById('admin-view-title').textContent = '📊 لوحة التحليلات';

    const content = document.getElementById('admin-view-content');
    content.innerHTML = `
        <div class="space-y-6">
            <!-- Stats Cards -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4" id="stats-cards">
                <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-6 rounded-2xl">
                    <i class="fas fa-users text-3xl mb-2 opacity-80"></i>
                    <p class="text-3xl font-black" id="stat-total-users">...</p>
                    <p class="text-sm opacity-80">إجمالي المستخدمين</p>
                </div>
                <div class="bg-gradient-to-br from-accent-500 to-accent-600 text-white p-6 rounded-2xl">
                    <i class="fas fa-check-circle text-3xl mb-2 opacity-80"></i>
                    <p class="text-3xl font-black" id="stat-verified">...</p>
                    <p class="text-sm opacity-80">حسابات موثقة</p>
                </div>
                <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-6 rounded-2xl">
                    <i class="fas fa-fire text-3xl mb-2 opacity-80"></i>
                    <p class="text-3xl font-black" id="stat-active">...</p>
                    <p class="text-sm opacity-80">نشطين اليوم</p>
                </div>
                <div class="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 rounded-2xl">
                    <i class="fas fa-comments text-3xl mb-2 opacity-80"></i>
                    <p class="text-3xl font-black" id="stat-messages">...</p>
                    <p class="text-sm opacity-80">رسائل اليوم</p>
                </div>
            </div>
            
            <!-- Charts Row -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- College Distribution -->
                <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                    <h3 class="font-bold text-lg dark:text-white mb-4"><i class="fas fa-chart-pie text-primary-500 ml-2"></i>توزيع الكليات</h3>
                    <div id="college-chart" class="space-y-3"></div>
                </div>
                
                <!-- Top Users -->
                <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                    <h3 class="font-bold text-lg dark:text-white mb-4"><i class="fas fa-trophy text-yellow-500 ml-2"></i>أعلى XP</h3>
                    <div id="top-users" class="space-y-2"></div>
                </div>
            </div>
            
            <!-- Activity Timeline -->
            <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                <h3 class="font-bold text-lg dark:text-white mb-4"><i class="fas fa-history text-accent-500 ml-2"></i>آخر النشاطات</h3>
                <div id="activity-timeline" class="space-y-3"></div>
            </div>
        </div>
    `;

    // Load all data
    await Promise.all([
        loadStatCards(),
        loadCollegeDistribution(),
        loadTopUsers(),
        loadRecentActivity()
    ]);
};

// ============================================================
// 2. تحميل بطاقات الإحصائيات
// ============================================================
const loadStatCards = async () => {
    try {
        // Total users
        const usersSnap = await getDocs(collection(db, "users"));
        document.getElementById('stat-total-users').textContent = usersSnap.size;

        // Verified users
        let verified = 0;
        usersSnap.forEach(d => { if (d.data().isVerified) verified++; });
        document.getElementById('stat-verified').textContent = verified;

        // Active today (had lastSeen today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let activeToday = 0;
        usersSnap.forEach(d => {
            const lastSeen = d.data().lastSeen?.toDate?.();
            if (lastSeen && lastSeen >= today) activeToday++;
        });
        document.getElementById('stat-active').textContent = activeToday;

        // Messages today
        const chatSnap = await getDocs(collection(db, "global_chat"));
        let messagesToday = 0;
        chatSnap.forEach(d => {
            const createdAt = d.data().createdAt?.toDate?.();
            if (createdAt && createdAt >= today) messagesToday++;
        });
        document.getElementById('stat-messages').textContent = messagesToday;

    } catch (e) {
        console.error('Error loading stats:', e);
    }
};

// ============================================================
// 3. توزيع الكليات
// ============================================================
const loadCollegeDistribution = async () => {
    const container = document.getElementById('college-chart');

    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const colleges = {};

        usersSnap.forEach(d => {
            const col = d.data().collegeId || 'غير محدد';
            colleges[col] = (colleges[col] || 0) + 1;
        });

        const total = usersSnap.size;
        const colors = ['indigo', 'green', 'blue', 'purple', 'orange', 'pink', 'red', 'yellow'];

        container.innerHTML = Object.entries(colleges)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, count], i) => {
                const percent = ((count / total) * 100).toFixed(1);
                const color = colors[i % colors.length];
                return `
                    <div>
                        <div class="flex justify-between text-sm mb-1">
                            <span class="dark:text-white font-bold">${name}</span>
                            <span class="text-surface-500">${count} (${percent}%)</span>
                        </div>
                        <div class="bg-surface-200 dark:bg-surface-700 rounded-full h-2 overflow-hidden">
                            <div class="bg-${color}-500 h-full rounded-full" style="width: ${percent}%"></div>
                        </div>
                    </div>
                `;
            }).join('');

    } catch (e) {
        container.innerHTML = '<p class="text-red-500">خطأ في التحميل</p>';
    }
};

// ============================================================
// 4. أعلى المستخدمين XP
// ============================================================
const loadTopUsers = async () => {
    const container = document.getElementById('top-users');

    try {
        const q = query(collection(db, "users"), orderBy("xp", "desc"), limit(10));
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = '<p class="text-surface-400 text-center">لا توجد بيانات</p>';
            return;
        }

        container.innerHTML = '';
        let rank = 1;
        snap.forEach(d => {
            const u = d.data();
            const medals = ['🥇', '🥈', '🥉'];
            const medal = rank <= 3 ? medals[rank - 1] : `#${rank}`;

            container.innerHTML += `
                <div class="flex items-center gap-3 p-2 rounded-xl ${rank <= 3 ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}">
                    <span class="text-lg font-bold w-8">${medal}</span>
                    <img src="${u.photoURL || `https://ui-avatars.com/api/?name=${u.displayName}&background=random`}" loading="lazy" class="w-8 h-8 rounded-full object-cover">
                    <span class="flex-1 font-bold text-sm dark:text-white truncate">${u.displayName || 'مستخدم'}</span>
                    <span class="text-primary-600 font-black">${u.xp || 0} XP</span>
                </div>
            `;
            rank++;
        });

    } catch (e) {
        container.innerHTML = '<p class="text-red-500">خطأ في التحميل</p>';
    }
};

// ============================================================
// 5. آخر النشاطات
// ============================================================
const loadRecentActivity = async () => {
    const container = document.getElementById('activity-timeline');

    try {
        const q = query(collection(db, "global_chat"), orderBy("createdAt", "desc"), limit(10));
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = '<p class="text-surface-400 text-center">لا توجد نشاطات</p>';
            return;
        }

        container.innerHTML = '';
        snap.forEach(d => {
            const msg = d.data();
            const time = msg.createdAt?.toDate?.();
            const timeStr = time ? time.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';

            container.innerHTML += `
                <div class="flex items-center gap-3 p-2 border-r-4 border-primary-500 bg-surface-50 dark:bg-surface-700/50 rounded-lg">
                    <img src="${msg.userPhoto || 'https://ui-avatars.com/api/?name=User'}" loading="lazy" class="w-8 h-8 rounded-full">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm dark:text-white"><span class="font-bold">${msg.userName || 'مستخدم'}</span> أرسل رسالة</p>
                        <p class="text-xs text-surface-500 truncate">${msg.text || '📎 مرفق'}</p>
                    </div>
                    <span class="text-xs text-surface-400">${timeStr}</span>
                </div>
            `;
        });

    } catch (e) {
        container.innerHTML = '<p class="text-red-500">خطأ في التحميل</p>';
    }
};

// ============================================================
// 6. 📊 لوحة تحليلات الطالب (Student Analytics)
// ============================================================
export const openStudentAnalytics = async () => {
    const user = auth.currentUser;
    if (!user) return;

    // إنشاء modal
    const modal = document.createElement('div');
    modal.id = 'student-analytics-modal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[500] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div class="bg-gradient-to-r from-primary-600 to-primary-600 p-5 text-white flex justify-between items-center flex-shrink-0">
                <div class="flex items-center gap-3">
                    <i class="fas fa-chart-line text-2xl"></i>
                    <div>
                        <h3 class="font-bold text-lg">إحصائياتي</h3>
                        <p class="text-xs opacity-80">${user.displayName || 'الطالب'}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="window.exportGradesPDF()" class="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm font-bold transition" title="تنزيل كشف الدرجات">
                        <i class="fas fa-file-pdf ml-1"></i> PDF
                    </button>
                    <button onclick="document.getElementById('student-analytics-modal').remove()" class="hover:bg-white/20 p-2 rounded-lg transition">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div id="student-analytics-content" class="flex-1 overflow-y-auto p-5">
                <div class="text-center py-20"><i class="fas fa-spinner fa-spin text-3xl text-primary-500"></i></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    await loadStudentAnalyticsData(user.uid);
};

const loadStudentAnalyticsData = async (userId) => {
    const container = document.getElementById('student-analytics-content');
    if (!container) return;

    try {
        // جلب بيانات الاختبارات
        const scoresSnap = await getDocs(query(collection(db, "user_scores"), where("userId", "==", userId)));
        const quizData = [];
        scoresSnap.forEach(d => quizData.push({ id: d.id, ...d.data() }));
        quizData.sort((a, b) => (a.date?.toDate?.() || 0) - (b.date?.toDate?.() || 0));

        // جلب بيانات المستخدم
        const { doc: docRef, getDoc: getDocFn } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        const userDoc = await getDocFn(docRef(db, "users", userId));
        const userData = userDoc.exists() ? userDoc.data() : {};

        // حسابات
        const totalQuizzes = quizData.length;
        const avgScore = totalQuizzes > 0 ? Math.round(quizData.reduce((sum, q) => sum + (q.score || 0), 0) / totalQuizzes) : 0;
        const bestScore = totalQuizzes > 0 ? Math.max(...quizData.map(q => q.score || 0)) : 0;
        const streak = userData.streak || 0;
        const xp = userData.xp || 0;

        // توزيع المستويات
        const excellent = quizData.filter(q => q.score >= 85).length;
        const good = quizData.filter(q => q.score >= 60 && q.score < 85).length;
        const weak = quizData.filter(q => q.score < 60).length;

        // آخر 10 اختبارات للرسم البياني
        const recent = quizData.slice(-10);

        // التوصيات (Feature F)
        const subjectScores = {};
        quizData.forEach(q => {
            const subj = q.quizTitle || q.sectionTitle || 'عام';
            if (!subjectScores[subj]) subjectScores[subj] = [];
            subjectScores[subj].push(q.score || 0);
        });

        const recommendations = [];
        for (const [subj, scores] of Object.entries(subjectScores)) {
            const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            if (avg < 70) {
                recommendations.push({ subject: subj, avg, attempts: scores.length });
            }
        }
        recommendations.sort((a, b) => a.avg - b.avg);

        // بناء الواجهة
        container.innerHTML = `
            <!-- Stat Cards -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-4 rounded-2xl text-center">
                    <p class="text-3xl font-black">${totalQuizzes}</p>
                    <p class="text-xs opacity-80 mt-1">اختبار</p>
                </div>
                <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-4 rounded-2xl text-center">
                    <p class="text-3xl font-black">${avgScore}%</p>
                    <p class="text-xs opacity-80 mt-1">المتوسط</p>
                </div>
                <div class="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-4 rounded-2xl text-center">
                    <p class="text-3xl font-black">${streak}🔥</p>
                    <p class="text-xs opacity-80 mt-1">الستريك</p>
                </div>
                <div class="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white p-4 rounded-2xl text-center">
                    <p class="text-3xl font-black">${xp}</p>
                    <p class="text-xs opacity-80 mt-1">XP</p>
                </div>
            </div>

            <!-- Charts Row -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <!-- Bar Chart: Recent Quizzes -->
                <div class="bg-surface-50 dark:bg-surface-700/50 p-4 rounded-2xl">
                    <h4 class="font-bold text-sm dark:text-white mb-3"><i class="fas fa-chart-bar text-primary-500 ml-1"></i>آخر الاختبارات</h4>
                    ${recent.length === 0 ? '<p class="text-center text-surface-400 text-sm py-8">لا توجد اختبارات بعد</p>' : `
                    <div class="flex items-end gap-1 h-40">
                        ${recent.map(q => {
            const color = q.score >= 85 ? 'bg-accent-500' : q.score >= 60 ? 'bg-yellow-500' : 'bg-red-500';
            return `
                                <div class="flex-1 flex flex-col items-center gap-1">
                                    <span class="text-[9px] font-bold dark:text-surface-300">${q.score}%</span>
                                    <div class="${color} rounded-t-lg w-full transition-all duration-500" style="height: ${Math.max(q.score, 5)}%"></div>
                                </div>
                            `;
        }).join('')}
                    </div>
                    `}
                </div>

                <!-- Grade Distribution -->
                <div class="bg-surface-50 dark:bg-surface-700/50 p-4 rounded-2xl">
                    <h4 class="font-bold text-sm dark:text-white mb-3"><i class="fas fa-chart-pie text-primary-500 ml-1"></i>توزيع المستويات</h4>
                    ${totalQuizzes === 0 ? '<p class="text-center text-surface-400 text-sm py-8">لا توجد بيانات</p>' : `
                    <div class="space-y-3">
                        <div>
                            <div class="flex justify-between text-xs mb-1">
                                <span class="font-bold text-accent-600">🌟 ممتاز (85%+)</span>
                                <span class="text-surface-500">${excellent} (${Math.round(excellent / totalQuizzes * 100)}%)</span>
                            </div>
                            <div class="bg-surface-200 dark:bg-surface-600 rounded-full h-3 overflow-hidden">
                                <div class="bg-accent-500 h-full rounded-full transition-all" style="width: ${(excellent / totalQuizzes * 100)}%"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between text-xs mb-1">
                                <span class="font-bold text-yellow-600">⭐ جيد (60-84%)</span>
                                <span class="text-surface-500">${good} (${Math.round(good / totalQuizzes * 100)}%)</span>
                            </div>
                            <div class="bg-surface-200 dark:bg-surface-600 rounded-full h-3 overflow-hidden">
                                <div class="bg-yellow-500 h-full rounded-full transition-all" style="width: ${(good / totalQuizzes * 100)}%"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between text-xs mb-1">
                                <span class="font-bold text-red-600">📌 يحتاج تحسين (&lt;60%)</span>
                                <span class="text-surface-500">${weak} (${Math.round(weak / totalQuizzes * 100)}%)</span>
                            </div>
                            <div class="bg-surface-200 dark:bg-surface-600 rounded-full h-3 overflow-hidden">
                                <div class="bg-red-500 h-full rounded-full transition-all" style="width: ${(weak / totalQuizzes * 100)}%"></div>
                            </div>
                        </div>
                    </div>
                    <p class="text-center text-xs text-surface-400 mt-3">أفضل درجة: <span class="font-bold text-accent-600">${bestScore}%</span></p>
                    `}
                </div>
            </div>

            <!-- 🎯 Recommendations (Feature F) -->
            ${recommendations.length > 0 ? `
            <div class="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 p-5 rounded-2xl border-2 border-orange-200 dark:border-orange-800 mb-4">
                <h4 class="font-bold dark:text-white mb-3 flex items-center gap-2">
                    <i class="fas fa-lightbulb text-orange-500"></i> توصيات لتحسين أدائك
                </h4>
                <div class="space-y-2">
                    ${recommendations.slice(0, 5).map(r => `
                        <div class="flex items-center gap-3 bg-white dark:bg-surface-800 p-3 rounded-xl shadow-sm">
                            <div class="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                                <span class="font-black text-red-600 text-sm">${r.avg}%</span>
                            </div>
                            <div class="flex-1">
                                <p class="font-bold text-sm dark:text-white">${r.subject}</p>
                                <p class="text-xs text-surface-500">متوسطك ${r.avg}% من ${r.attempts} محاولة — ننصحك بمراجعة هذه المادة</p>
                            </div>
                            <i class="fas fa-arrow-left text-orange-500"></i>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : totalQuizzes > 0 ? `
            <div class="bg-accent-50 dark:bg-accent-900/20 p-4 rounded-2xl text-center border border-accent-200 dark:border-accent-800">
                <i class="fas fa-check-circle text-accent-500 text-2xl mb-2"></i>
                <p class="font-bold text-accent-700 dark:text-accent-400">أداؤك ممتاز! 🎉 كل المواد فوق 70%</p>
            </div>
            ` : ''}
        `;

        // حفظ البيانات للـ PDF export
        window._studentAnalyticsData = { quizData, userData, avgScore, totalQuizzes, streak, xp, recommendations };

    } catch (e) {
        console.error('Student analytics error:', e);
        container.innerHTML = '<p class="text-center text-red-500 py-10">حدث خطأ في تحميل البيانات</p>';
    }
};

// ============================================================
// 7. 📋 تنزيل كشف الدرجات PDF (Feature G)
// ============================================================
window.exportGradesPDF = async () => {
    const data = window._studentAnalyticsData;
    if (!data || data.totalQuizzes === 0) {
        window.showToast?.('لا توجد درجات لتصديرها', 'error');
        return;
    }

    window.showToast?.('جاري إنشاء الملف...', 'info');

    try {
        await window.loadPDFLibs?.();
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        // Header
        pdf.setFillColor(13, 148, 136); // primary-600
        pdf.rect(0, 0, 210, 40, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(20);
        pdf.text('Masar Platform - Grade Report', 105, 18, { align: 'center' });
        pdf.setFontSize(10);
        pdf.text(`Student: ${data.userData.displayName || 'N/A'} | Date: ${new Date().toLocaleDateString('en-US')}`, 105, 30, { align: 'center' });

        // Summary
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(14);
        pdf.text('Summary', 15, 52);

        pdf.setFontSize(10);
        pdf.text(`Total Quizzes: ${data.totalQuizzes}`, 15, 62);
        pdf.text(`Average Score: ${data.avgScore}%`, 15, 69);
        pdf.text(`Streak: ${data.streak} days`, 15, 76);
        pdf.text(`XP: ${data.xp}`, 15, 83);

        // Grades Table
        pdf.setFontSize(14);
        pdf.text('Quiz Scores', 15, 98);

        let y = 108;
        // Table header
        pdf.setFillColor(240, 240, 240);
        pdf.rect(15, y - 5, 180, 8, 'F');
        pdf.setFontSize(9);
        pdf.setFont(undefined, 'bold');
        pdf.text('#', 18, y);
        pdf.text('Quiz Title', 28, y);
        pdf.text('Score', 140, y);
        pdf.text('Date', 165, y);
        pdf.setFont(undefined, 'normal');
        y += 8;

        data.quizData.slice(-20).forEach((q, i) => {
            if (y > 270) { pdf.addPage(); y = 20; }
            const dateStr = q.date?.toDate?.()?.toLocaleDateString('en-US') || 'N/A';

            // Alternating row color
            if (i % 2 === 0) {
                pdf.setFillColor(248, 248, 248);
                pdf.rect(15, y - 4, 180, 7, 'F');
            }

            // Score color
            if (q.score >= 85) pdf.setTextColor(22, 163, 74);
            else if (q.score >= 60) pdf.setTextColor(202, 138, 4);
            else pdf.setTextColor(220, 38, 38);

            pdf.text(`${i + 1}`, 18, y);
            pdf.setTextColor(0, 0, 0);
            pdf.text(`${(q.quizTitle || 'Quiz').substring(0, 40)}`, 28, y);

            if (q.score >= 85) pdf.setTextColor(22, 163, 74);
            else if (q.score >= 60) pdf.setTextColor(202, 138, 4);
            else pdf.setTextColor(220, 38, 38);
            pdf.text(`${q.score}%`, 140, y);

            pdf.setTextColor(100, 100, 100);
            pdf.text(dateStr, 165, y);
            pdf.setTextColor(0, 0, 0);

            y += 7;
        });

        // Footer
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text('Generated by Masar Platform', 105, 290, { align: 'center' });

        pdf.save(`grades_${data.userData.displayName || 'student'}_${new Date().toISOString().split('T')[0]}.pdf`);
        window.showToast?.('✅ تم تنزيل كشف الدرجات', 'success');

    } catch (e) {
        console.error('PDF export error:', e);
        window.showToast?.('فشل في إنشاء الملف', 'error');
    }
};

// ============================================================
// 8. تصدير
// ============================================================
window.openAnalyticsDashboard = openAnalyticsDashboard;
window.openStudentAnalytics = openStudentAnalytics;

export default { openAnalyticsDashboard, openStudentAnalytics };
