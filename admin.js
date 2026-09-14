// ============================================================
// admin.js - النظام المتقدم لإدارة المنصة (كامل وشامل)
// ============================================================

import { db, auth, SUPER_ADMIN_EMAIL, storage } from './firebase.js';
import { UNIVERSITY_STRUCTURE } from './structure.js';
import {
    collection, getDocs, query, orderBy, doc, setDoc, deleteDoc,
    addDoc, getDoc, updateDoc, writeBatch, where, serverTimestamp, limit, arrayRemove
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { sendNotification } from './cms.js';
import { openAdminSupportDashboard } from './support.js';

// --- متغيرات عامة للاستخدام الداخلي ---
let allSectionsCache = [];
let currentSelectedScopes = new Set();
let editingAdminEmail = null;

// ============================================================
// سجل نشاط الأدمن (Admin Activity Log)
// ============================================================
const logAdminAction = async (action, targetUid = '', targetName = '', details = '') => {
    try {
        await addDoc(collection(db, "admin_logs"), {
            action,
            adminEmail: auth.currentUser?.email || 'unknown',
            adminUid: auth.currentUser?.uid || '',
            targetUid,
            targetName,
            details,
            timestamp: serverTimestamp()
        });
    } catch (e) { console.log('Log error:', e); }
};
window._logAdminAction = logAdminAction;


// ============================================================
// 📊 لوحة المعلومات الرئيسية (Admin Dashboard Overview)
// ============================================================
window.openAdminDashboardOverview = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const content = document.getElementById('admin-view-content');
    const title = document.getElementById('admin-view-title');
    if (title) title.textContent = '📊 لوحة المعلومات';

    content.innerHTML = `<div class="flex items-center justify-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-primary-500"></i></div>`;

    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const sevenMinAgo = new Date(now - 7 * 60 * 1000);

        // Fetch data in parallel
        const [usersSnap, scoresSnap, logsSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(query(collection(db, "user_scores"), where("date", ">=", todayStart))),
            getDocs(query(collection(db, "admin_logs"), orderBy("timestamp", "desc"), limit(15)))
        ]);

        let totalUsers = 0, onlineNow = 0, newToday = 0, verifiedCount = 0;
        const dailyActivity = {};

        // Calculate stats
        usersSnap.forEach(d => {
            totalUsers++;
            const u = d.data();
            const lastSeen = u.lastSeen?.toDate?.();
            if (lastSeen && lastSeen >= sevenMinAgo) onlineNow++;
            const created = u.createdAt?.toDate?.() || u.lastLogin?.toDate?.();
            if (created && created >= todayStart) newToday++;
            if (u.isVerified) verifiedCount++;

            // Daily activity for last 7 days
            if (lastSeen) {
                const dayKey = lastSeen.toISOString().split('T')[0];
                dailyActivity[dayKey] = (dailyActivity[dayKey] || 0) + 1;
            }
        });

        const quizzesToday = scoresSnap.size;

        // Build 7-day chart data
        const days = [];
        const dayLabels = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            days.push({
                label: dayLabels[d.getDay()],
                count: dailyActivity[key] || 0,
                date: key
            });
        }
        const maxActivity = Math.max(...days.map(d => d.count), 1);

        // Build admin logs feed
        const logEntries = logsSnap.docs.map(d => {
            const l = d.data();
            const time = l.timestamp?.toDate?.();
            const actionIcons = {
                'verify_student': '✅', 'reject_id_card': '❌', 'ban_user': '🚫', 'unban_user': '🔓',
                'ban_from_platform': '⛔', 'unban_from_platform': '🔓', 'delete_user': '🗑️',
                'edit_name': '✏️', 'update_admin': '👤', 'delete_admin': '🗑️',
                'toggle_maintenance': '🔧', 'send_targeted_notification': '📢', 'broadcast_notification': '📡',
                'grade_student': '📝', 'upload_grades': '📊', 'give_bonus': '🎁', 'global_bonus': '🎉',
                'reset_leaderboard': '🔄', 'wipe_all_data': '💣', 'force_logout': '🔐',
                'ban_chat': '🔇', 'unban_chat': '🔊', 'delete_assignment': '📋', 'add_exam': '📚',
                'delete_exam': '🗑️', 'resolve_report': '✅', 'batch_verify': '✅✅',
                'clear_inactive_sessions': '🧹', 'admin_unblock': '🔓', 'edit_student_data': '✏️',
                'auto_expire_admin': '⏰'
            };
            const icon = actionIcons[l.action] || '📋';
            const timeStr = time ? time.toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '';
            return `<div class="flex items-start gap-3 p-3 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-all group">
                <span class="text-xl flex-shrink-0">${icon}</span>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">${l.details || l.action}</p>
                    <p class="text-xs text-surface-400 mt-0.5">${l.adminEmail || '—'} · ${timeStr}</p>
                </div>
            </div>`;
        }).join('');

        content.innerHTML = `
            <div class="space-y-6">
                <!-- Stat Cards -->
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="bg-gradient-to-br from-primary-500 to-primary-700 text-white p-5 rounded-2xl shadow-lg relative overflow-hidden">
                        <div class="absolute -top-4 -left-4 w-20 h-20 bg-white/10 rounded-full"></div>
                        <i class="fas fa-users text-3xl opacity-80 mb-2"></i>
                        <div class="text-3xl font-black">${totalUsers.toLocaleString('ar-EG')}</div>
                        <div class="text-sm opacity-80">إجمالي المستخدمين</div>
                        <div class="text-xs mt-1 opacity-60"><i class="fas fa-check-circle"></i> ${verifiedCount} موثق</div>
                    </div>
                    <div class="bg-gradient-to-br from-accent-500 to-accent-700 text-white p-5 rounded-2xl shadow-lg relative overflow-hidden">
                        <div class="absolute -top-4 -left-4 w-20 h-20 bg-white/10 rounded-full"></div>
                        <i class="fas fa-circle text-3xl opacity-80 mb-2 animate-pulse"></i>
                        <div class="text-3xl font-black">${onlineNow.toLocaleString('ar-EG')}</div>
                        <div class="text-sm opacity-80">متصل الآن</div>
                        <div class="text-xs mt-1 opacity-60">${Math.round(onlineNow / Math.max(totalUsers, 1) * 100)}% من الإجمالي</div>
                    </div>
                    <div class="bg-gradient-to-br from-amber-500 to-orange-600 text-white p-5 rounded-2xl shadow-lg relative overflow-hidden">
                        <div class="absolute -top-4 -left-4 w-20 h-20 bg-white/10 rounded-full"></div>
                        <i class="fas fa-user-plus text-3xl opacity-80 mb-2"></i>
                        <div class="text-3xl font-black">${newToday.toLocaleString('ar-EG')}</div>
                        <div class="text-sm opacity-80">تسجيل جديد اليوم</div>
                    </div>
                    <div class="bg-gradient-to-br from-primary-500 to-violet-700 text-white p-5 rounded-2xl shadow-lg relative overflow-hidden">
                        <div class="absolute -top-4 -left-4 w-20 h-20 bg-white/10 rounded-full"></div>
                        <i class="fas fa-pen-fancy text-3xl opacity-80 mb-2"></i>
                        <div class="text-3xl font-black">${quizzesToday.toLocaleString('ar-EG')}</div>
                        <div class="text-sm opacity-80">كويز اليوم</div>
                    </div>
                </div>

                <!-- Activity Chart + Admin Logs -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <!-- Weekly Activity Chart -->
                    <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                        <h3 class="font-bold text-lg mb-4 text-surface-800 dark:text-white"><i class="fas fa-chart-bar text-primary-500 ml-2"></i>نشاط آخر 7 أيام</h3>
                        <div class="flex items-end gap-2 h-40">
                            ${days.map(d => {
            const pct = Math.max((d.count / maxActivity) * 100, 4);
            const isToday = d.date === now.toISOString().split('T')[0];
            return `<div class="flex-1 flex flex-col items-center gap-1">
                                    <span class="text-xs font-bold text-surface-600 dark:text-surface-300">${d.count}</span>
                                    <div class="w-full rounded-t-lg transition-all duration-500 ${isToday ? 'bg-gradient-to-t from-primary-600 to-primary-500' : 'bg-gradient-to-t from-primary-400 to-primary-300 dark:from-primary-600 dark:to-primary-500'}" style="height: ${pct}%"></div>
                                    <span class="text-[10px] text-surface-400 ${isToday ? 'font-bold text-primary-600 dark:text-primary-400' : ''}">${d.label}</span>
                                </div>`;
        }).join('')}
                        </div>
                    </div>

                    <!-- Admin Activity Log -->
                    <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                        <h3 class="font-bold text-lg mb-4 text-surface-800 dark:text-white"><i class="fas fa-clipboard-list text-amber-500 ml-2"></i>آخر نشاط الأدمن</h3>
                        <div class="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                            ${logEntries || '<p class="text-surface-400 text-center py-6">لا يوجد سجل بعد</p>'}
                        </div>
                    </div>
                </div>

                <!-- Quick Actions -->
                <div class="bg-white dark:bg-surface-800 p-4 rounded-2xl shadow border dark:border-surface-700">
                    <h3 class="font-bold mb-3 text-surface-700 dark:text-surface-300"><i class="fas fa-bolt text-yellow-500 ml-1"></i>إجراءات سريعة</h3>
                    <div class="flex flex-wrap gap-2">
                        <button onclick="window.openUsersLogView?.()" class="px-4 py-2 bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 rounded-xl text-sm font-bold hover:bg-primary-200 transition"><i class="fas fa-users ml-1"></i>الطلاب</button>
                        <button onclick="window.openStatisticsDashboard?.()" class="px-4 py-2 bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 rounded-xl text-sm font-bold hover:bg-primary-200 transition"><i class="fas fa-chart-pie ml-1"></i>الإحصائيات</button>
                        <button onclick="window.openReportsDashboard?.()" class="px-4 py-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-xl text-sm font-bold hover:bg-red-200 transition"><i class="fas fa-flag ml-1"></i>البلاغات</button>
                        <button onclick="window.openAdminActivityLog?.()" class="px-4 py-2 bg-surface-100 text-surface-700 dark:bg-surface-700 dark:text-surface-300 rounded-xl text-sm font-bold hover:bg-surface-200 transition"><i class="fas fa-clipboard-list ml-1"></i>السجل الكامل</button>
                    </div>
                </div>
            </div>
        `;

    } catch (e) {
        console.error('Dashboard overview error:', e);
        content.innerHTML = '<p class="text-center text-red-500 p-10">حدث خطأ في تحميل لوحة المعلومات</p>';
    }
};


// ============================================================
export const canManageSection = (sectionId) => {
    const user = auth.currentUser;
    if (!user) return false;
    // المالك له صلاحية مطلقة
    if (user.email === SUPER_ADMIN_EMAIL) return true;

    const perms = window.currentUserPermissions || {};
    // إذا كانت المصفوفة فارغة أو غير موجودة، فهو مشرف عام أو لم يتم تحديد مواد
    if (!perms.allowedSections || perms.allowedSections.length === 0) return true;
    // التحقق من وجود المادة في قائمة المواد المسموحة له
    if (perms.allowedSections.includes(sectionId)) return true;

    return false;
};

// ============================================================
// 1. إدارة الواجبات (Assignments Management)
// ============================================================
export const openAssignmentsAdminView = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');

    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'leaderboard-section', 'assignments-section', 'profile-section', 'admin-settings-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '📝 إدارة الواجبات والتكليفات';
    const content = document.getElementById('admin-view-content');

    const sectionsSnap = await getDocs(collection(db, "study_sections"));
    let sectionsOptions = '<option value="">-- اختر المادة المرتبطة (للرصد) --</option>';
    sectionsSnap.forEach(doc => {
        sectionsOptions += `<option value="${doc.id}">${doc.data().title}</option>`;
    });

    const colOptions = UNIVERSITY_STRUCTURE.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    content.innerHTML = `
        <div class="mb-10 p-8 bg-white dark:bg-surface-800 rounded-3xl shadow-xl border-t-8 border-primary-600 animate-fade-in">
            <h3 class="font-black text-2xl mb-6 dark:text-white flex items-center gap-2">
                <i class="fas fa-plus-circle text-primary-600"></i> نشر واجب جديد
            </h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                    <label class="block text-xs font-bold mb-2 dark:text-surface-300 uppercase tracking-wide">عنوان التكليف:</label>
                    <input type="text" id="assign-title" placeholder="مثال: حل مسائل الشيت الأول" class="w-full p-4 border rounded-2xl dark:bg-surface-700 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 font-bold">
                </div>
                <div>
                    <label class="block text-xs font-bold mb-2 dark:text-surface-300 uppercase tracking-wide">آخر موعد للتسليم:</label>
                    <input type="date" id="assign-date" class="w-full p-4 border rounded-2xl dark:bg-surface-700 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 font-sans">
                </div>
            </div>

            <div class="mb-6">
                <label class="block text-xs font-bold mb-2 dark:text-surface-300 uppercase tracking-wide">المادة الدراسية (لربط الدرجات):</label>
                <select id="assign-section" class="w-full p-4 border rounded-2xl dark:bg-surface-700 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 font-bold">
                    ${sectionsOptions}
                    <option value="general">نشاط عام (بدون مادة محددة)</option>
                </select>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                    <label class="block text-xs font-bold mb-2 dark:text-surface-300 uppercase tracking-wide">الكلية المستهدفة:</label>
                    <select id="assign-col" class="w-full p-4 border rounded-2xl dark:bg-surface-700 dark:text-white outline-none font-bold">
                        <option value="">-- اختر الكلية --</option>
                        ${colOptions}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-bold mb-2 dark:text-surface-300 uppercase tracking-wide">القسم / التخصص:</label>
                    <select id="assign-dept" class="w-full p-4 border rounded-2xl dark:bg-surface-700 dark:text-white outline-none font-bold">
                        <option value="all">عام لكل الكلية</option>
                    </select>
                </div>
            </div>

            <div class="mb-8">
                <label class="block text-xs font-bold mb-2 dark:text-surface-300 uppercase tracking-wide">تعليمات الواجب:</label>
                <textarea id="assign-desc" placeholder="اكتب وصفاً دقيقاً للمطلوب من الطالب..." class="w-full p-4 border rounded-2xl dark:bg-surface-700 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 h-32"></textarea>
            </div>
            
            <button id="create-assign-btn" class="w-full bg-primary-600 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-primary-700 transition transform hover:-translate-y-1 flex items-center justify-center gap-2 text-lg">
                <i class="fas fa-paper-plane"></i> نشر الواجب الآن
            </button>
        </div>
        
        <h3 class="font-black text-2xl mb-4 dark:text-white px-2">سجل الواجبات المنشورة</h3>
        <div id="admin-assignments-list" class="space-y-4 pb-20"></div>
        
        <div id="submissions-viewer" class="hidden fixed inset-0 bg-black/80 z-[250] flex items-center justify-center p-4 backdrop-blur-md">
            <div class="bg-white dark:bg-surface-800 w-full max-w-6xl h-[90vh] rounded-3xl flex flex-col relative shadow-2xl overflow-hidden border border-surface-700">
                <div class="p-6 border-b dark:border-surface-700 flex justify-between items-center bg-surface-50 dark:bg-surface-900">
                    <div>
                        <h2 class="text-2xl font-black dark:text-white">تصحيح الواجبات</h2>
                        <p class="text-sm text-surface-500">قم بمراجعة الملفات ورصد الدرجات</p>
                    </div>
                    <button onclick="document.getElementById('submissions-viewer').classList.add('hidden')" class="bg-red-50 text-red-600 w-12 h-12 rounded-full hover:bg-red-600 hover:text-white transition flex items-center justify-center font-bold text-xl"><i class="fas fa-times"></i></button>
                </div>
                <div id="submissions-list-content" class="flex-1 overflow-y-auto p-8 custom-scrollbar bg-surface-100 dark:bg-surface-800/50"></div>
            </div>
        </div>
    `;

    const colSelect = document.getElementById('assign-col');
    const deptSelect = document.getElementById('assign-dept');

    colSelect.onchange = () => {
        const selectedCol = UNIVERSITY_STRUCTURE.find(c => c.id === colSelect.value);
        deptSelect.innerHTML = '<option value="all">عام لكل الكلية</option>';
        if (selectedCol && selectedCol.departments) {
            selectedCol.departments.forEach(dept => {
                deptSelect.innerHTML += `<option value="${dept.id}">${dept.name}</option>`;
            });
        }
    };

    document.getElementById('create-assign-btn').onclick = async () => {
        const title = document.getElementById('assign-title').value;
        const deadline = document.getElementById('assign-date').value;
        const description = document.getElementById('assign-desc').value;
        const sectionSelect = document.getElementById('assign-section');
        const collegeId = colSelect.value;

        if (!title || !deadline || !collegeId) return alert("⚠️ يرجى إكمال البيانات الأساسية (العنوان، الموعد، الكلية)");

        const btn = document.getElementById('create-assign-btn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري النشر...';
        btn.disabled = true;

        try {
            await addDoc(collection(db, "assignments"), {
                title, description, deadline,
                collegeId, departmentId: deptSelect.value,
                sectionId: sectionSelect.value || 'general',
                sectionTitle: sectionSelect.options[sectionSelect.selectedIndex].text,
                createdAt: new Date()
            });
            alert("✅ تم نشر الواجب للطلاب بنجاح");
            openAssignmentsAdminView();
        } catch (e) {
            console.error(e);
            alert("حدث خطأ أثناء النشر");
            btn.innerHTML = 'نشر الواجب';
            btn.disabled = false;
        }
    };

    loadAdminAssignments();
};

const loadAdminAssignments = async () => {
    const list = document.getElementById('admin-assignments-list');
    list.innerHTML = '<div class="text-center p-10"><i class="fas fa-spinner fa-spin text-3xl text-primary-600"></i></div>';

    const snap = await getDocs(query(collection(db, "assignments"), orderBy("createdAt", "desc"), limit(100)));
    list.innerHTML = '';

    if (snap.empty) {
        list.innerHTML = '<div class="p-12 bg-white dark:bg-surface-800 rounded-3xl text-center text-surface-400 font-bold border-2 border-dashed dark:border-surface-700">لا توجد واجبات نشطة حالياً.</div>';
        return;
    }

    snap.forEach(d => {
        const data = d.data();
        const div = document.createElement('div');
        div.className = "flex flex-col md:flex-row justify-between items-center p-6 bg-white dark:bg-surface-800 rounded-2xl shadow-md border-r-8 border-primary-500 hover:shadow-xl transition group";
        div.innerHTML = `
            <div class="mb-4 md:mb-0 w-full">
                <h4 class="font-black text-xl dark:text-white mb-2">${data.title}</h4>
                <div class="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider">
                    <span class="text-primary-600 bg-primary-50 dark:bg-primary-900/30 px-3 py-1 rounded-lg">${data.sectionTitle}</span>
                    <span class="text-surface-500 bg-surface-100 dark:bg-surface-700 px-3 py-1 rounded-lg"><i class="far fa-clock"></i> ${data.deadline}</span>
                    <span class="text-primary-500 bg-primary-50 dark:bg-primary-900/30 px-3 py-1 rounded-lg">${data.collegeId} / ${data.departmentId}</span>
                </div>
            </div>
            <div class="flex gap-3 w-full md:w-auto">
                <button onclick="window.loadSubmissions('${d.id}')" class="flex-grow bg-primary-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-primary-700 shadow-lg shadow-primary-500/30 transition flex items-center justify-center gap-2">
                    <i class="fas fa-users-viewfinder"></i> التصحيح
                </button>
                <button onclick="window.deleteAssign('${d.id}')" class="bg-red-50 text-red-600 px-4 py-3 rounded-xl font-bold hover:bg-red-600 hover:text-white transition">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        list.appendChild(div);
    });
};

window.deleteAssign = async (id) => {
    if (confirm("⚠️ تحذير: سيتم حذف الواجب وجميع ملفات الطلاب المرتبطة به نهائياً.\nهل أنت متأكد؟")) {
        await deleteDoc(doc(db, "assignments", id));
        await logAdminAction('delete_assignment', '', id, `حذف واجب: ${id}`);
        loadAdminAssignments();
    }
};

window.loadSubmissions = async (assignId) => {
    const modal = document.getElementById('submissions-viewer');
    const content = document.getElementById('submissions-list-content');
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="text-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-primary-600"></i><p class="mt-4 text-surface-500 font-bold">جاري تحميل إجابات الطلاب...</p></div>';

    const snap = await getDocs(collection(db, "assignments", assignId, "submissions"));

    if (snap.empty) {
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center p-20 opacity-50">
                <i class="fas fa-folder-open text-8xl mb-6 text-surface-300"></i>
                <p class="text-2xl font-bold text-surface-500">لم يقم أي طالب برفع الحل حتى الآن.</p>
            </div>`;
        return;
    }

    let html = `<div class="grid grid-cols-1 gap-6">`;
    snap.forEach(subDoc => {
        const sub = subDoc.data();
        const isGraded = sub.grade !== null && sub.grade !== undefined;

        html += `
            <div class="bg-white dark:bg-surface-800 p-6 rounded-3xl shadow-sm border border-surface-100 dark:border-surface-700 flex flex-col lg:flex-row gap-6 transition hover:shadow-lg hover:border-primary-500">
                <div class="flex-1 flex gap-4">
                    <div class="w-16 h-16 bg-primary-100 dark:bg-primary-900/50 rounded-2xl flex items-center justify-center text-primary-600 text-2xl font-black shadow-inner">
                        ${sub.studentName ? sub.studentName.charAt(0) : '?'}
                    </div>
                    <div>
                        <h4 class="font-black text-xl dark:text-white mb-1">${sub.studentName}</h4>
                        <p class="text-xs text-surface-400 font-bold mb-4">تم التسليم: ${sub.submittedAt?.toDate().toLocaleString('ar-EG')}</p>
                        <a href="${sub.fileUrl}" target="_blank" class="inline-flex items-center gap-2 bg-primary-50 text-primary-700 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary-600 hover:text-white transition border border-primary-100">
                            <i class="fas fa-file-download"></i> معاينة الملف المرفق
                        </a>
                    </div>
                </div>
                
                <div class="lg:w-80 bg-surface-50 dark:bg-surface-900 p-5 rounded-2xl border dark:border-surface-700 flex flex-col gap-3">
                    <div class="flex items-center gap-2">
                        <div class="flex-1">
                            <label class="block text-[10px] font-black text-surface-400 mb-1 uppercase">الدرجة (100)</label>
                            <input type="number" id="grade-${sub.userId}" value="${sub.grade || ''}" class="w-full p-3 bg-white dark:bg-surface-800 border rounded-xl text-center font-black text-xl outline-none focus:ring-2 focus:ring-accent-500 text-accent-600">
                        </div>
                    </div>
                    <div>
                        <label class="block text-[10px] font-black text-surface-400 mb-1 uppercase">ملاحظات (Feedback)</label>
                        <textarea id="feedback-${sub.userId}" class="w-full p-3 bg-white dark:bg-surface-800 border rounded-xl text-sm outline-none dark:text-white" rows="2" placeholder="اكتب ملاحظة للطالب...">${sub.feedback || ''}</textarea>
                    </div>
                    <button onclick="window.saveGrade('${assignId}', '${sub.userId}')" class="w-full ${isGraded ? 'bg-accent-600' : 'bg-surface-800'} text-white py-3 rounded-xl font-bold shadow-lg hover:opacity-90 transition flex justify-center items-center gap-2">
                        ${isGraded ? '<i class="fas fa-check-circle"></i> تحديث الدرجة' : '<i class="fas fa-save"></i> حفظ وإرسال'}
                    </button>
                </div>
            </div>
        `;
    });
    html += `</div>`;
    content.innerHTML = html;
};

window.saveGrade = async (assignId, userId) => {
    const gradeVal = document.getElementById(`grade-${userId}`).value;
    const feedbackVal = document.getElementById(`feedback-${userId}`).value;

    if (gradeVal === "") return alert("⚠️ يجب إدخال درجة قبل الحفظ");

    try {
        const assignDoc = await getDoc(doc(db, "assignments", assignId));
        const assignData = assignDoc.exists() ? assignDoc.data() : { title: "واجب", sectionId: "general", sectionTitle: "عام" };

        await updateDoc(doc(db, "assignments", assignId, "submissions", userId), {
            grade: gradeVal,
            feedback: feedbackVal
        });

        const scoreRef = doc(db, "user_scores", `${userId}_assign_${assignId}`);
        await setDoc(scoreRef, {
            userId: userId,
            userName: "Student", // سيتم تحديثه تلقائياً أو يمكن جلبه
            quizTitle: `📝 واجب: ${assignData.title}`,
            quizId: assignId,
            sectionId: assignData.sectionId || 'general',
            sectionTitle: assignData.sectionTitle || 'عام',
            collegeId: assignData.collegeId || 'unknown',
            score: parseInt(gradeVal),
            total: 100,
            type: 'assignment',
            date: new Date()
        }, { merge: true });

        await sendNotification(userId, `🎉 تم تصحيح واجبك (${assignData.title}). درجتك: ${gradeVal}/100`, `scores`);
        await logAdminAction('grade_student', userId, '', `تقييم واجب: ${assignData.title} — الدرجة: ${gradeVal}/100`);

        alert("✅ تم الحفظ وإضافة الدرجة لسجل الطالب بنجاح.");
    } catch (e) {
        console.error(e);
        alert("❌ حدث خطأ أثناء الحفظ. حاول مرة أخرى.");
    }
};

// ============================================================
// 2. إدارة البث المباشر (Live Session Control)
// ============================================================
export const openLiveSessionControl = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'assignments-section', 'profile-section', 'admin-settings-section'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });

    document.getElementById('admin-view-title').textContent = '🎥 إدارة القاعات الافتراضية والبث المباشر';

    const docRef = doc(db, "system", "live_session");
    const snap = await getDoc(docRef);
    const data = snap.exists() ? snap.data() : { isActive: false, link: '' };

    document.getElementById('admin-view-content').innerHTML = `
        <div class="max-w-2xl mx-auto bg-white dark:bg-surface-800 p-10 rounded-[2.5rem] shadow-2xl text-center border-t-8 ${data.isActive ? 'border-red-500' : 'border-surface-300'} animate-fade-in">
            <div class="w-24 h-24 bg-surface-100 dark:bg-surface-700 rounded-full flex items-center justify-center mx-auto mb-8 relative">
                <i class="fas fa-video text-5xl ${data.isActive ? 'text-red-500 animate-pulse' : 'text-surface-400'}"></i>
                ${data.isActive ? '<span class="absolute top-0 right-0 w-6 h-6 bg-red-600 rounded-full border-4 border-white animate-ping"></span>' : ''}
            </div>
            
            <h3 class="text-3xl font-black mb-2 dark:text-white">
                حالة البث: ${data.isActive ? '<span class="text-red-600">مباشر الآن 📡</span>' : '<span class="text-surface-400">متوقف 💤</span>'}
            </h3>
            <p class="text-surface-500 mb-8 font-medium">عند تفعيل البث، سيظهر زر "مباشر الآن" في الشريط العلوي لجميع الطلاب.</p>
            
            <div class="bg-surface-50 dark:bg-surface-900 p-6 rounded-2xl mb-8 text-right">
                <label class="block text-xs font-black text-surface-400 mb-2 uppercase">رابط الاجتماع (Zoom / Google Meet / YouTube):</label>
                <div class="relative">
                    <i class="fas fa-link absolute top-4 left-4 text-surface-400"></i>
                    <input type="text" id="live-link" value="${data.link || ''}" placeholder="https://zoom.us/j/..." class="w-full p-4 pl-10 border rounded-xl bg-white dark:bg-surface-800 dark:text-white font-mono text-sm outline-none focus:ring-2 focus:ring-primary-500 dir-ltr text-left">
                </div>
            </div>
            
            <div class="flex gap-4">
                ${!data.isActive ? `
                    <button id="start-live" class="flex-1 bg-accent-600 text-white py-4 rounded-2xl font-black hover:bg-accent-700 text-lg shadow-lg shadow-accent-500/30 transition transform hover:-translate-y-1 flex items-center justify-center gap-2">
                        <i class="fas fa-play"></i> بدء البث
                    </button>
                ` : `
                    <button id="stop-live" class="flex-1 bg-red-600 text-white py-4 rounded-2xl font-black hover:bg-red-700 text-lg shadow-lg shadow-red-500/30 transition transform hover:-translate-y-1 flex items-center justify-center gap-2">
                        <i class="fas fa-stop"></i> إنهاء البث
                    </button>
                `}
            </div>
        </div>
    `;

    document.getElementById('start-live')?.addEventListener('click', async () => {
        let link = document.getElementById('live-link').value.trim();
        if (!link) return alert("⚠️ يرجى لصق رابط الاجتماع أولاً");
        if (!link.startsWith('http')) link = 'https://' + link;

        await setDoc(docRef, { isActive: true, link });
        alert("🔴 تم تفعيل وضع البث المباشر.");
        openLiveSessionControl();
    });

    document.getElementById('stop-live')?.addEventListener('click', async () => {
        if (confirm("هل تريد إنهاء البث وإخفاء الزر من عند الطلاب؟")) {
            await setDoc(docRef, { isActive: false, link: '' });
            openLiveSessionControl();
        }
    });
};

// ============================================================
// 3. التحكم بالطلاب (Users Management & Logs)
// ============================================================
export const openUsersLogView = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'leaderboard-section', 'assignments-section', 'profile-section', 'admin-settings-section'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });

    document.getElementById('admin-view-title').textContent = '👥 ' + (window.t?.('student-management') || 'إدارة الطلاب والمستخدمين');
    const content = document.getElementById('admin-view-content');

    const user = auth.currentUser;
    const isGlobalOwner = user.email === SUPER_ADMIN_EMAIL;

    // جلب نطاق صلاحيات المشرف الحالي — كل الصلاحيات
    let adminScope = { collegeId: null, departmentId: null };
    let perms = {
        support: isGlobalOwner, idReview: isGlobalOwner, statistics: isGlobalOwner,
        reports: isGlobalOwner, announcements: isGlobalOwner, devices: isGlobalOwner,
        loginLogs: isGlobalOwner, cms: isGlobalOwner, broadcast: isGlobalOwner,
        bannedUsers: isGlobalOwner, deleteUsers: isGlobalOwner, grades: isGlobalOwner,
        quiz: isGlobalOwner, exams: isGlobalOwner, users: isGlobalOwner,
        superAdmin: isGlobalOwner
    };
    let isSuperAdmin = isGlobalOwner;

    if (!isGlobalOwner) {
        const adminSnap = await getDoc(doc(db, "admins", user.email));
        if (adminSnap.exists()) {
            const data = adminSnap.data();
            adminScope = data.scope || { collegeId: null, departmentId: null };
            const p = data.permissions || {};
            perms = {
                support: p.support || false,
                idReview: p.idReview || false,
                statistics: p.statistics || false,
                reports: p.reports || false,
                announcements: p.announcements || false,
                devices: p.devices || false,
                loginLogs: p.loginLogs || false,
                cms: p.cms || false,
                broadcast: p.broadcast || false,
                bannedUsers: p.bannedUsers || false,
                deleteUsers: p.deleteUsers || false,
                grades: p.grades || false,
                quiz: p.quiz || false,
                exams: p.exams || false,
                users: p.users || false,
                superAdmin: p.superAdmin || false
            };
            isSuperAdmin = p.superAdmin || false;
        }
    }

    // متغير مختصر لسهولة القراءة
    const hasSupportAccess = perms.support;

    // تصنيف الأزرار في مجموعات منظمة
    const adminSections = [];

    // === القسم 1: الإدارة الأساسية ===
    const coreButtons = [];
    coreButtons.push(`<button onclick="window.openAdminDashboardOverview()" class="admin-btn group"><div class="admin-btn-icon bg-primary-500/20 text-primary-400"><i class="fas fa-tachometer-alt"></i></div><span>لوحة المعلومات</span></button>`);
    if (hasSupportAccess) coreButtons.push(`<button onclick="window.openSupportAdmin()" class="admin-btn group"><div class="admin-btn-icon bg-primary-500/20 text-primary-400"><i class="fas fa-headset"></i></div><span>${window.t?.('admin-support') || 'الدعم الفني'}</span></button>`);
    if (perms.idReview) coreButtons.push(`<button onclick="window.openIdReviewDashboard()" class="admin-btn group"><div class="admin-btn-icon bg-primary-500/20 text-primary-400"><i class="fas fa-id-card"></i></div><span>${window.t?.('admin-id-review') || 'مراجعة الهويات'}</span></button>`);
    if (perms.cms) coreButtons.push(`<button onclick="window.openContentManagement()" class="admin-btn group"><div class="admin-btn-icon bg-amber-500/20 text-amber-400"><i class="fas fa-folder-open"></i></div><span>${window.t?.('admin-cms') || 'إدارة المحتوى'}</span></button>`);
    if (coreButtons.length) adminSections.push({ title: 'الإدارة الأساسية', icon: 'fa-cog', buttons: coreButtons });

    // === القسم 2: التنبيهات والإعلانات ===
    const alertButtons = [];
    if (perms.broadcast) alertButtons.push(`<button onclick="window.sendUrgentAlert()" class="admin-btn group"><div class="admin-btn-icon bg-red-500/20 text-red-400"><i class="fas fa-bullhorn"></i></div><span>${window.t?.('urgent-alert') || 'تنبيه عام'}</span></button>`);
    if (perms.announcements) alertButtons.push(`<button onclick="window.openAnnouncementControl()" class="admin-btn group"><div class="admin-btn-icon bg-orange-500/20 text-orange-400"><i class="fas fa-scroll"></i></div><span>${window.t?.('announcement-bar') || 'شريط الإعلانات'}</span></button>`);
    if (perms.broadcast) alertButtons.push(`<button onclick="window.openScheduledNotifications()" class="admin-btn group"><div class="admin-btn-icon bg-violet-500/20 text-violet-400"><i class="fas fa-clock"></i></div><span>${window.t?.('scheduled-notifications') || 'إشعارات مجدولة'}</span></button>`);
    if (perms.broadcast) alertButtons.push(`<button onclick="window.openBroadcastNotificationPanel()" class="admin-btn group"><div class="admin-btn-icon bg-primary-500/20 text-primary-400"><i class="fas fa-paper-plane"></i></div><span>إرسال إشعارات</span></button>`);
    if (alertButtons.length) adminSections.push({ title: 'التنبيهات والإعلانات', icon: 'fa-bell', buttons: alertButtons });

    // === القسم 3: البيانات والتحليلات ===
    const dataButtons = [];
    if (perms.grades) dataButtons.push(`<button onclick="window.viewUserScoresView()" class="admin-btn group"><div class="admin-btn-icon bg-primary-500/20 text-primary-400"><i class="fas fa-chart-line"></i></div><span>${window.t?.('grades-log') || 'سجل الدرجات'}</span></button>`);
    if (perms.statistics) dataButtons.push(`<button onclick="window.openStatisticsDashboard()" class="admin-btn group"><div class="admin-btn-icon bg-primary-500/20 text-primary-400"><i class="fas fa-chart-pie"></i></div><span>${window.t?.('statistics') || 'الإحصائيات'}</span></button>`);
    if (perms.quiz) dataButtons.push(`<button onclick="window.openQuizAttemptsManager()" class="admin-btn group"><div class="admin-btn-icon bg-rose-500/20 text-rose-400"><i class="fas fa-redo-alt"></i></div><span>${window.t?.('quiz-attempts') || 'محاولات الكويز'}</span></button>`);
    if (isGlobalOwner) dataButtons.push(`<button onclick="window.openAdvancedExport()" class="admin-btn group"><div class="admin-btn-icon bg-accent-500/20 text-accent-400"><i class="fas fa-file-export"></i></div><span>${window.t?.('advanced-export') || 'تصدير متقدم'}</span></button>`);
    if (dataButtons.length) adminSections.push({ title: 'البيانات والتحليلات', icon: 'fa-chart-bar', buttons: dataButtons });

    // === القسم 4: الأمان والمراقبة ===
    const securityButtons = [];
    if (perms.devices) securityButtons.push(`<button onclick="window.openDeviceSessionsView()" class="admin-btn group"><div class="admin-btn-icon bg-primary-500/20 text-primary-400"><i class="fas fa-mobile-alt"></i></div><span>${window.t?.('connected-devices') || 'الأجهزة المتصلة'}</span></button>`);
    if (perms.loginLogs) securityButtons.push(`<button onclick="window.openLoginLogsView()" class="admin-btn group"><div class="admin-btn-icon bg-surface-400/20 text-surface-400"><i class="fas fa-history"></i></div><span>${window.t?.('login-logs') || 'سجل الدخول'}</span></button>`);
    if (perms.reports) securityButtons.push(`<button onclick="window.openReportsDashboard()" class="admin-btn group"><div class="admin-btn-icon bg-red-500/20 text-red-400"><i class="fas fa-flag"></i></div><span>${window.t?.('reports') || 'البلاغات'}</span></button>`);
    if (perms.bannedUsers) securityButtons.push(`<button onclick="window.openBannedUsersDashboard()" class="admin-btn group"><div class="admin-btn-icon bg-red-600/20 text-red-500"><i class="fas fa-ban"></i></div><span>الأعضاء المحظورين</span></button>`);
    if (isGlobalOwner) securityButtons.push(`<button onclick="window.openAdminActivityLog()" class="admin-btn group"><div class="admin-btn-icon bg-surface-500/20 text-surface-400"><i class="fas fa-clipboard-list"></i></div><span>سجل نشاط الأدمن</span></button>`);
    if (isGlobalOwner) securityButtons.push(`<button onclick="window.openWatermarkExemptions()" class="admin-btn group"><div class="admin-btn-icon bg-primary-500/20 text-primary-400"><i class="fas fa-eye-slash"></i></div><span>إعفاء من العلامة المائية</span></button>`);
    if (securityButtons.length) adminSections.push({ title: 'الأمان والمراقبة', icon: 'fa-shield-alt', buttons: securityButtons });

    const adminGridHTML = adminSections.map(s => `
        <div class="mb-4">
            <h4 class="text-xs font-bold text-surface-400 dark:text-surface-500 uppercase tracking-widest mb-2 flex items-center gap-2 px-1">
                <i class="fas ${s.icon} text-primary-500"></i> ${s.title}
            </h4>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                ${s.buttons.join('')}
            </div>
        </div>
    `).join('');

    content.innerHTML = `
        <style>
            .admin-btn {
                display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
                background: white; border-radius: 1rem; font-weight: 700; font-size: 0.8rem;
                box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid rgba(0,0,0,0.04);
                transition: all 0.2s; cursor: pointer; text-align: right;
            }
            .dark .admin-btn {
                background: rgb(31 41 55); border-color: rgb(55 65 81);
                color: rgb(229 231 235);
            }
            .admin-btn:hover {
                transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.1);
                border-color: rgb(20 184 166);
            }
            .dark .admin-btn:hover { box-shadow: 0 8px 25px rgba(0,0,0,0.3); }
            .admin-btn-icon {
                width: 2.25rem; height: 2.25rem; border-radius: 0.75rem;
                display: flex; align-items: center; justify-content: center;
                font-size: 1rem; flex-shrink: 0; transition: all 0.2s;
            }
            .admin-btn:hover .admin-btn-icon { transform: scale(1.1); }
        </style>
        <div class="mb-8">${adminGridHTML}</div>

        ${isGlobalOwner ? `
        <div class="mb-6 flex gap-2 overflow-x-auto pb-2">
            <button onclick="window.openGradesUploadView()" class="bg-accent-100 text-accent-700 px-4 py-2 rounded-xl font-bold text-xs hover:bg-accent-200 whitespace-nowrap"><i class="fas fa-file-excel"></i> رفع الدرجات</button>
            <button onclick="window.giveGlobalBonus()" class="bg-accent-100 text-accent-700 px-4 py-2 rounded-xl font-bold text-xs hover:bg-accent-200 whitespace-nowrap"><i class="fas fa-gift"></i> ${window.t?.('bonus-all') || 'بونص للجميع'}</button>
            <button onclick="window.copyAllEmails()" class="bg-surface-100 text-surface-700 px-4 py-2 rounded-xl font-bold text-xs hover:bg-surface-200 whitespace-nowrap"><i class="fas fa-copy"></i> ${window.t?.('copy-emails') || 'نسخ الإيميلات'}</button>
            <button onclick="window.resetLeaderboard()" class="bg-red-100 text-red-700 px-4 py-2 rounded-xl font-bold text-xs hover:bg-red-200 whitespace-nowrap"><i class="fas fa-trash-alt"></i> ${window.t?.('reset-results') || 'تصفير النتائج'}</button>
            <button onclick="window.resetAllIdCards(this)" class="bg-orange-500 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-orange-600 whitespace-nowrap shadow-lg"><i class="fas fa-id-card-alt"></i> تصفير الكارنيهات</button>
            <button onclick="window.resetAllProfilePhotos(this)" class="bg-purple-500 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-purple-600 whitespace-nowrap shadow-lg"><i class="fas fa-images"></i> حذف كل صور البروفايل</button>
            <button onclick="window.wipeAllStudentData()" class="bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-red-700 whitespace-nowrap shadow-lg animate-pulse"><i class="fas fa-biohazard"></i> ${window.t?.('wipe-platform') || 'فرمتة المنصة'}</button>
        </div>
        ` : (perms.grades ? `
        <div class="mb-6 flex gap-2 overflow-x-auto pb-2">
            <button onclick="window.openGradesUploadView()" class="bg-accent-100 text-accent-700 px-4 py-2 rounded-xl font-bold text-xs hover:bg-accent-200 whitespace-nowrap"><i class="fas fa-file-excel"></i> رفع الدرجات</button>
        </div>
        ` : '')}

        <!-- فلاتر الطلاب -->
        <div class="mb-6 bg-white dark:bg-surface-800 p-4 rounded-2xl shadow border dark:border-surface-700">
            <div class="flex flex-wrap gap-3 items-center">
                <div class="flex-1 min-w-[200px]">
                    <div class="relative">
                        <i class="fas fa-search absolute top-1/2 -translate-y-1/2 right-3 text-surface-400"></i>
                        <input type="text" id="search-student" placeholder="بحث بالاسم، الإيميل، الرقم الجامعي، الرقم القومي..." class="w-full p-3 pr-10 border rounded-xl dark:bg-surface-700 dark:text-white font-bold text-sm focus:ring-2 focus:ring-primary-500 outline-none" oninput="window.filterStudentsBySearch()">
                    </div>
                </div>
                <div class="flex-1 min-w-[150px]">
                    <select id="filter-college" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-bold text-sm">
                        <option value="">🏫 كل الكليات</option>
                        ${UNIVERSITY_STRUCTURE.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                    </select>
                </div>
                <div class="flex-1 min-w-[150px]">
                    <select id="filter-dept" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-bold text-sm" disabled>
                        <option value="">📚 كل الأقسام</option>
                    </select>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.refreshUsersList()" class="bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-300 px-4 py-3 rounded-xl font-bold text-sm hover:bg-primary-200 transition" title="تحديث">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button onclick="window.copyFilteredEmails()" class="bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 px-4 py-3 rounded-xl font-bold text-sm hover:bg-surface-200 transition" title="نسخ إيميلات">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button onclick="window.exportUsersToExcel()" class="bg-accent-600 text-white px-4 py-3 rounded-xl font-bold text-sm hover:bg-accent-700 transition" title="تصدير Excel">
                        <i class="fas fa-file-excel"></i>
                    </button>
                    <button onclick="window.sendTargetedNotification()" class="bg-primary-600 text-white px-4 py-3 rounded-xl font-bold text-sm hover:bg-primary-700 transition" title="إرسال تنبيه">
                        <i class="fas fa-bell"></i>
                    </button>
                </div>
            </div>
            <div class="mt-3 flex items-center gap-4 text-xs text-surface-500">
                <span id="filter-count" class="font-bold">0 طالب</span>
                <label class="flex items-center gap-2 cursor-pointer hover:text-primary-600">
                    <input type="checkbox" id="filter-online" class="w-4 h-4 accent-accent-500">
                    <span class="font-bold">🟢 Online أولاً</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer hover:text-primary-600">
                    <input type="checkbox" id="filter-verified" class="w-4 h-4 accent-primary-500">
                    <span class="font-bold">✅ موثقين فقط</span>
                </label>
            </div>
        </div>

        <div id="users-table-container" class="overflow-hidden bg-white dark:bg-surface-800 rounded-3xl shadow-lg border dark:border-surface-700">
            <div class="p-20 text-center text-surface-400"><i class="fas fa-circle-notch fa-spin text-4xl mb-4"></i><p>جاري تحميل قاعدة بيانات الطلاب...</p></div>
        </div>

        <div id="bonus-modal" class="hidden fixed inset-0 bg-black/70 z-[300] flex items-center justify-center p-4 backdrop-blur-sm">
            <div class="bg-white dark:bg-surface-800 rounded-[2rem] p-8 w-full max-w-md relative shadow-2xl border-t-8 border-accent-500 animate-slide-up">
                <button onclick="document.getElementById('bonus-modal').classList.add('hidden')" class="absolute top-6 right-6 text-surface-400 hover:text-red-500 text-xl"><i class="fas fa-times"></i></button>
                <h3 class="text-2xl font-black mb-6 dark:text-white flex items-center gap-2"><i class="fas fa-star text-accent-500"></i> مكافأة طالب</h3>
                <input type="hidden" id="bonus-user-id">
                <input type="hidden" id="bonus-user-name">
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold mb-1 dark:text-surface-300">اختر المادة:</label>
                        <select id="bonus-subject-select" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white outline-none font-bold"><option value="">جاري التحميل...</option></select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 dark:text-surface-300">عدد الدرجات:</label>
                        <input type="number" id="bonus-amount" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-bold text-center text-xl outline-none focus:ring-2 focus:ring-accent-500" placeholder="5">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 dark:text-surface-300">السبب (يظهر للطالب):</label>
                        <input type="text" id="bonus-reason" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white outline-none" placeholder="تفاعل ممتاز، إجابة صحيحة...">
                    </div>
                </div>
                <button id="confirm-bonus-btn" class="w-full mt-8 bg-accent-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-accent-700 transition">تأكيد وإضافة</button>
            </div>
        </div>

        <div id="badges-modal" class="hidden fixed inset-0 bg-black/70 z-[300] flex items-center justify-center p-4 backdrop-blur-sm">
            <div class="bg-white dark:bg-surface-800 rounded-[2rem] p-8 w-full max-w-md relative shadow-2xl border-t-8 border-yellow-400 animate-slide-up">
                <button onclick="document.getElementById('badges-modal').classList.add('hidden')" class="absolute top-6 right-6 text-surface-400 hover:text-red-500 text-xl"><i class="fas fa-times"></i></button>
                <h3 class="text-2xl font-black mb-6 dark:text-white flex items-center gap-2"><i class="fas fa-medal text-yellow-500"></i> أوسمة الطالب</h3>
                
                <div id="badges-list-content" class="space-y-2 mb-6 max-h-48 overflow-y-auto custom-scrollbar p-1"></div>
                
                <div class="bg-surface-50 dark:bg-surface-900 p-4 rounded-xl">
                    <p class="text-xs font-bold text-surface-400 mb-2">إضافة وسام جديد:</p>
                    <div class="flex gap-2">
                        <input type="text" id="new-badge-icon" placeholder="Emoji" class="w-16 p-3 border rounded-xl text-center text-2xl dark:bg-surface-700 dark:text-white">
                        <input type="text" id="new-badge-title" placeholder="اسم الوسام (مثال: عبقري)" class="flex-1 p-3 border rounded-xl text-sm dark:bg-surface-700 dark:text-white font-bold">
                    </div>
                    <button id="add-badge-confirm" class="w-full mt-3 bg-primary-600 text-white py-2 rounded-xl font-bold shadow hover:bg-primary-700 transition">إمنح الوسام</button>
                </div>
            </div>
        </div>
    `;

    try {
        let q;
        if (!isGlobalOwner && adminScope.collegeId) {
            q = query(collection(db, "users"), where("collegeId", "==", adminScope.collegeId));
        } else {
            // جلب كل المستخدمين من غير orderBy عشان نجيب الكل
            q = collection(db, "users");
        }

        const usersSnap = await getDocs(q);

        if (usersSnap.empty) {
            document.getElementById('users-table-container').innerHTML = '<div class="p-20 text-center text-surface-400 font-bold">لا يوجد طلاب مسجلين.</div>';
            return;
        }

        // Cache users for filtering
        window.allUsersCache = [];
        usersSnap.forEach(d => {
            window.allUsersCache.push({ id: d.id, uid: d.id, ...d.data() });
        });

        // ترتيب المستخدمين حسب آخر نشاط (client-side)
        window.allUsersCache.sort((a, b) => {
            const aTime = a.lastSeen?.toDate?.() || a.lastLogin?.toDate?.() || new Date(0);
            const bTime = b.lastSeen?.toDate?.() || b.lastLogin?.toDate?.() || new Date(0);
            return bTime - aTime;
        });

        window.filteredUsers = window.allUsersCache;

        // Update count
        const filterCount = document.getElementById('filter-count');
        if (filterCount) filterCount.textContent = `${window.allUsersCache.length} طالب`;

        // Connect filter events
        const colSel = document.getElementById('filter-college');
        const deptSel = document.getElementById('filter-dept');

        if (colSel) {
            colSel.onchange = () => {
                const cid = colSel.value;
                deptSel.innerHTML = '<option value="">📚 كل الأقسام</option>';
                deptSel.disabled = !cid;
                if (cid) {
                    const col = UNIVERSITY_STRUCTURE.find(c => c.id === cid);
                    if (col) col.departments.forEach(d => deptSel.innerHTML += `<option value="${d.id}">${d.name}</option>`);
                }
                window.filterStudents();
            };
        }
        if (deptSel) deptSel.onchange = () => window.filterStudents();
        if (document.getElementById('filter-online')) document.getElementById('filter-online').onchange = () => window.filterStudents();
        if (document.getElementById('filter-verified')) document.getElementById('filter-verified').onchange = () => window.filterStudents();

        // Setup renderUsersTable for filtering - store isGlobalOwner for later use
        window.isGlobalOwnerAdmin = isGlobalOwner;
        window._adminPerms = perms;
        window.renderUsersTable = (users) => window.renderUsersTableImpl ? window.renderUsersTableImpl(users, window.isGlobalOwnerAdmin) : null;

        let rows = '';
        const now = new Date();

        usersSnap.forEach(userDoc => {
            const userData = userDoc.data();

            if (!isGlobalOwner && adminScope.departmentId && adminScope.departmentId !== 'all') {
                if (userData.departmentId !== adminScope.departmentId) return;
            }

            const lastLogin = userData.lastLogin ? userData.lastLogin.toDate() : new Date(0);

            // Online status calculation: check lastSeen (heartbeat) < 7 minutes
            const lastSeenDate = userData.lastSeen ? userData.lastSeen.toDate() : new Date(0);
            const isOnline = ((now - lastSeenDate) / 1000 / 60) < 7;

            // Override Firestore value with calculated value to ensure UI consistency
            userData.isOnline = isOnline;

            const isChatBanned = userData.isChatBanned === true;
            const isPlatformBanned = userData.isBannedFromPlatform === true;
            const isVerified = userData.isVerified === true;
            const badgesDisplay = userData.badges ? userData.badges.map(b => `<span title="${b.title}" class="cursor-help text-lg hover:scale-125 inline-block transition">${b.icon}</span>`).join(' ') : '<span class="text-surface-300 text-xs">-</span>';

            rows += `
                <tr class="group border-b dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition ${isPlatformBanned ? 'bg-red-50 dark:bg-red-900/10' : ''}">
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-4">
                            <div class="relative">
                                <img src="${userData.photoURL || 'https://ui-avatars.com/api/?background=random&name=User'}" loading="lazy" class="w-12 h-12 rounded-full border-2 border-white shadow-sm object-cover cursor-pointer hover:scale-110 transition" onclick="window.location.hash='#profile/${userData.uid}'">
                                ${isOnline ? '<span class="absolute bottom-0 right-0 w-3.5 h-3.5 bg-accent-500 border-2 border-white rounded-full"></span>' : ''}
                            </div>
                            <div>
                                <div class="font-black dark:text-white text-sm flex items-center gap-2">
                                    <a href="#profile/${userData.uid}" class="hover:text-primary-600 transition">${userData.displayName}</a>
                                    ${isVerified ? '<i class="fas fa-check-circle text-primary-500 text-xs" title="موثق"></i>' : ''}
                                    ${isPlatformBanned ? '<span class="text-[9px] bg-red-600 text-white px-1.5 rounded">محظور</span>' : ''}
                                    <button onclick="window.editUserName('${userData.uid}', '${userData.displayName}')" class="text-xs text-surface-400 hover:text-primary-500 transition" title="تعديل الاسم"><i class="fas fa-pen"></i></button>
                                </div>
                                <div class="text-[10px] text-surface-500 font-mono">${isGlobalOwner ? userData.email : ''}</div>
                                ${isOnline ? '<span class="text-[10px] text-accent-500 font-bold"><i class="fas fa-circle text-[6px] mr-1"></i>متصل</span>' : (userData.lastSeen ? `<span class="text-[10px] text-surface-400">${window._adminTimeAgo?.(userData.lastSeen) || ''}</span>` : '')}
                                <div class="text-[10px] text-primary-400 font-bold">${userData.collegeId || '?'} / ${userData.departmentId || '?'}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-4 py-4 text-center">${badgesDisplay}</td>
                    <td class="px-6 py-4">
                        <div class="flex justify-end gap-2 flex-wrap">
                            <button onclick="window.openBadgeManager('${userData.uid}')" class="w-8 h-8 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition flex items-center justify-center" title="إدارة الأوسمة"><i class="fas fa-medal"></i></button>
                            <button onclick="window.openBonusModal('${userData.uid}', '${userData.displayName}')" class="w-8 h-8 bg-accent-100 text-accent-700 rounded-lg hover:bg-accent-200 transition flex items-center justify-center" title="إضافة درجات"><i class="fas fa-plus"></i></button>
                            <button onclick="window.changeStudentCollege('${userData.uid}', '${userData.displayName}')" class="w-8 h-8 bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition flex items-center justify-center" title="نقل الطالب"><i class="fas fa-exchange-alt"></i></button>
                            
                            <button onclick="window.adminMessageUser('${userData.uid}', '${userData.displayName}')" class="w-8 h-8 bg-pink-100 text-pink-600 rounded-lg hover:bg-pink-200 transition flex items-center justify-center" title="مراسلة خاصة"><i class="fas fa-envelope"></i></button>
                            
                            <button onclick="window.toggleChatBan('${userData.uid}', ${isChatBanned})" class="w-8 h-8 rounded-lg transition flex items-center justify-center ${isChatBanned ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-surface-100 text-surface-500 hover:bg-orange-100 hover:text-orange-600'}" title="${isChatBanned ? 'فك حظر الشات' : 'حظر الشات'}">
                                <i class="fas fa-comment-slash"></i>
                            </button>
                            
                            ${(isGlobalOwner || perms.bannedUsers) ? `
                                <button onclick="window.togglePlatformBan('${userData.uid}', ${isPlatformBanned})" class="w-8 h-8 rounded-lg transition flex items-center justify-center ${isPlatformBanned ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-surface-100 text-surface-500 hover:bg-red-100 hover:text-red-600'}" title="${isPlatformBanned ? 'فك الحظر النهائي' : 'طرد نهائي'}">
                                    <i class="fas fa-ban"></i>
                                </button>
                            ` : ''}
                            ${(isGlobalOwner || perms.deleteUsers) ? `
                                <button onclick="window.deleteUserPermanently('${userData.uid}', '${userData.displayName?.replace(/'/g, "\\'") || 'هذا المستخدم'}', '${userData.email || ''}')" class="w-8 h-8 bg-surface-800 text-white rounded-lg hover:bg-black transition flex items-center justify-center shadow-lg" title="حذف نهائي ❌">
                                    <i class="fas fa-times"></i>
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>`;
        });

        const tableContainer = document.getElementById('users-table-container');
        if (tableContainer) {
            tableContainer.innerHTML = `
                <table class="w-full text-sm text-right">
                    <thead class="bg-surface-50 dark:bg-surface-700/50 text-surface-500 dark:text-surface-300 font-bold uppercase text-xs">
                        <tr>
                            <th class="px-6 py-4">بيانات الطالب</th>
                            <th class="px-4 py-4 text-center">الإنجازات</th>
                            <th class="px-6 py-4 text-left">أدوات التحكم</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y dark:divide-surface-700 bg-white dark:bg-surface-800">${rows}</tbody>
                </table>`;
        }
    } catch (e) { console.error("Error loading users:", e); }
};

// زرار تحديث قائمة المستخدمين
window.refreshUsersList = () => {
    openUsersLogView();
    window.showToast?.('تم التحديث', 'info');
};

// ======= نظام بحث وفلترة الطلاب =======

// بحث شامل: عند الكتابة في مربع البحث
window.filterStudentsBySearch = () => {
    window.filterStudents();
};

// فلترة الطلاب حسب جميع المعايير
window.filterStudents = () => {
    if (!window.allUsersCache) return;

    const searchVal = (document.getElementById('search-student')?.value || '').trim().toLowerCase();
    const colFilter = document.getElementById('filter-college')?.value || '';
    const deptFilter = document.getElementById('filter-dept')?.value || '';
    const onlineOnly = document.getElementById('filter-online')?.checked || false;
    const verifiedOnly = document.getElementById('filter-verified')?.checked || false;
    const now = new Date();

    let filtered = window.allUsersCache.filter(u => {
        // بحث بالاسم أو الإيميل أو الرقم الجامعي أو الرقم القومي
        if (searchVal) {
            const name = (u.displayName || u.fullName || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            const studentId = (u.studentId || '').toLowerCase();
            const nationalId = (u.nationalId || '').toLowerCase();
            const fullName = (u.fullName || '').toLowerCase();
            const match = name.includes(searchVal) || email.includes(searchVal) ||
                studentId.includes(searchVal) || nationalId.includes(searchVal) ||
                fullName.includes(searchVal);
            if (!match) return false;
        }
        // فلتر الكلية
        if (colFilter && u.collegeId !== colFilter) return false;
        // فلتر القسم
        if (deptFilter && u.departmentId !== deptFilter) return false;
        // فلتر الموثقين
        if (verifiedOnly && !u.isVerified) return false;
        // فلتر المتصلين
        if (onlineOnly) {
            const lastSeen = u.lastSeen?.toDate?.() || new Date(0);
            const isOnline = ((now - lastSeen) / 1000 / 60) < 7;
            if (!isOnline) return false;
        }
        return true;
    });

    // ترتيب: Online أولاً إذا مفعل
    /* 
       Updated to sort by lastSeen ("heartbeat") rather than lastLogin.
       This ensures users who are actually active right now appear first.
    */
    if (onlineOnly) {
        filtered.sort((a, b) => {
            const aTime = a.lastSeen?.toDate?.() || new Date(0);
            const bTime = b.lastSeen?.toDate?.() || new Date(0);
            return bTime - aTime;
        });
    }

    window.filteredUsers = filtered;

    // تحديث العداد
    const filterCount = document.getElementById('filter-count');
    if (filterCount) filterCount.textContent = `${filtered.length} طالب من ${window.allUsersCache.length}`;

    // إعادة رسم الجدول
    const isGlobalOwner = window.isGlobalOwnerAdmin;
    const tableContainer = document.getElementById('users-table-container');
    if (!tableContainer) return;

    if (filtered.length === 0) {
        tableContainer.innerHTML = `
            <div class="p-16 text-center">
                <i class="fas fa-search text-5xl text-surface-300 mb-4"></i>
                <h3 class="text-lg font-bold text-surface-400">لا توجد نتائج</h3>
                <p class="text-sm text-surface-400 mt-1">جرب البحث باسم آخر أو رقم جامعي أو رقم قومي</p>
            </div>`;
        return;
    }

    const now2 = new Date();
    let rows = '';
    filtered.forEach(userData => {
        const lastSeen = userData.lastSeen?.toDate?.() || new Date(0);
        const isOnline = ((now2 - lastSeen) / 1000 / 60) < 7;
        const isChatBanned = userData.isChatBanned === true;
        const isPlatformBanned = userData.isBannedFromPlatform === true;
        const isVerified = userData.isVerified === true;
        const badgesDisplay = userData.badges ? userData.badges.map(b => `<span title="${b.title}" class="cursor-help text-lg hover:scale-125 inline-block transition">${b.icon}</span>`).join(' ') : '<span class="text-surface-300 text-xs">-</span>';

        // تظليل نتيجة البحث
        const searchHighlight = searchVal ? ` <span class="text-[9px] text-primary-400">` +
            (userData.studentId ? `🎓${userData.studentId}` : '') +
            (userData.nationalId ? ` 🆔${userData.nationalId}` : '') +
            `</span>` : '';

        rows += `
            <tr class="group border-b dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition ${isPlatformBanned ? 'bg-red-50 dark:bg-red-900/10' : ''}">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-4">
                        <div class="relative">
                            <img src="${userData.photoURL || 'https://ui-avatars.com/api/?background=random&name=User'}" loading="lazy" class="w-12 h-12 rounded-full border-2 border-white shadow-sm object-cover cursor-pointer hover:scale-110 transition" onclick="window.location.hash='#profile/${userData.uid}'">
                            ${isOnline ? '<span class="absolute bottom-0 right-0 w-3.5 h-3.5 bg-accent-500 border-2 border-white rounded-full"></span>' : ''}
                        </div>
                        <div>
                            <div class="font-black dark:text-white text-sm flex items-center gap-2">
                                <a href="#profile/${userData.uid}" class="hover:text-primary-600 transition">${userData.displayName}</a>
                                ${isVerified ? '<i class="fas fa-check-circle text-primary-500 text-xs" title="موثق"></i>' : ''}
                                ${isPlatformBanned ? '<span class="text-[9px] bg-red-600 text-white px-1.5 rounded">محظور</span>' : ''}
                                <button onclick="window.editUserName('${userData.uid}', '${userData.displayName}')" class="text-xs text-surface-400 hover:text-primary-500 transition" title="تعديل الاسم"><i class="fas fa-pen"></i></button>
                            </div>
                            <div class="text-[10px] text-surface-500 font-mono">${isGlobalOwner ? userData.email : ''}</div>
                            ${isOnline ? '<span class="text-[10px] text-accent-500 font-bold"><i class="fas fa-circle text-[6px] mr-1"></i>متصل</span>' : (userData.lastSeen ? `<span class="text-[10px] text-surface-400">${window._adminTimeAgo?.(userData.lastSeen) || ''}</span>` : '')}
                            <div class="text-[10px] text-primary-400 font-bold">${userData.collegeId || '?'} / ${userData.departmentId || '?'}${searchHighlight}</div>
                        </div>
                    </div>
                </td>
                <td class="px-4 py-4 text-center">${badgesDisplay}</td>
                <td class="px-6 py-4">
                    <div class="flex justify-end gap-2 flex-wrap">
                        <button onclick="window.openBadgeManager('${userData.uid}')" class="w-8 h-8 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition flex items-center justify-center" title="إدارة الأوسمة"><i class="fas fa-medal"></i></button>
                        <button onclick="window.openBonusModal('${userData.uid}', '${userData.displayName}')" class="w-8 h-8 bg-accent-100 text-accent-700 rounded-lg hover:bg-accent-200 transition flex items-center justify-center" title="إضافة درجات"><i class="fas fa-plus"></i></button>
                        <button onclick="window.changeStudentCollege('${userData.uid}', '${userData.displayName}')" class="w-8 h-8 bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition flex items-center justify-center" title="نقل الطالب"><i class="fas fa-exchange-alt"></i></button>
                        <button onclick="window.adminMessageUser('${userData.uid}', '${userData.displayName}')" class="w-8 h-8 bg-pink-100 text-pink-600 rounded-lg hover:bg-pink-200 transition flex items-center justify-center" title="مراسلة خاصة"><i class="fas fa-envelope"></i></button>
                        <button onclick="window.toggleChatBan('${userData.uid}', ${isChatBanned})" class="w-8 h-8 rounded-lg transition flex items-center justify-center ${isChatBanned ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-surface-100 text-surface-500 hover:bg-orange-100 hover:text-orange-600'}" title="${isChatBanned ? 'فك حظر الشات' : 'حظر الشات'}"><i class="fas fa-comment-slash"></i></button>
                        ${(isGlobalOwner || perms.bannedUsers) ? `
                            <button onclick="window.togglePlatformBan('${userData.uid}', ${isPlatformBanned})" class="w-8 h-8 rounded-lg transition flex items-center justify-center ${isPlatformBanned ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-surface-100 text-surface-500 hover:bg-red-100 hover:text-red-600'}" title="${isPlatformBanned ? 'فك الحظر النهائي' : 'طرد نهائي'}">
                                <i class="fas fa-ban"></i>
                            </button>
                        ` : ''}
                        ${(isGlobalOwner || perms.deleteUsers) ? `
                            <button onclick="window.deleteUserPermanently('${userData.uid}', '${userData.displayName?.replace(/'/g, "\\\\") || 'هذا المستخدم'}', '${userData.email || ''}')" class="w-8 h-8 bg-surface-800 text-white rounded-lg hover:bg-black transition flex items-center justify-center shadow-lg" title="حذف نهائي ❌">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>`;
    });

    tableContainer.innerHTML = `
        <table class="w-full text-sm text-right">
            <thead class="bg-surface-50 dark:bg-surface-700/50 text-surface-500 dark:text-surface-300 font-bold uppercase text-xs">
                <tr>
                    <th class="px-6 py-4">بيانات الطالب</th>
                    <th class="px-4 py-4 text-center">الإنجازات</th>
                    <th class="px-6 py-4 text-left">أدوات التحكم</th>
                </tr>
            </thead>
            <tbody class="divide-y dark:divide-surface-700 bg-white dark:bg-surface-800">${rows}</tbody>
        </table>`;
};
// ============================================================
// ✅ 6. صفحة مراجعة الهويات (الجديدة)
// ============================================================
export const openIdReviewDashboard = async () => {
    const area = document.getElementById('admin-view-area');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'leaderboard-section', 'assignments-section', 'profile-section', 'admin-settings-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });
    area.classList.remove('hidden');

    document.getElementById('admin-view-title').textContent = '🆔 مركز التحقق من الهويات';
    const content = document.getElementById('admin-view-content');

    content.innerHTML = '<div class="text-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-primary-600"></i></div>';

    try {
        const q = query(collection(db, "users"), where("idCardImage", "!=", null));
        const snap = await getDocs(q);

        if (snap.empty) {
            content.innerHTML = `
                <div class="text-center py-20">
                    <div class="w-24 h-24 bg-surface-100 dark:bg-surface-700 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fas fa-id-card text-4xl text-surface-400"></i>
                    </div>
                    <h3 class="text-xl font-bold text-surface-600 dark:text-surface-400 mb-2">لا توجد طلبات</h3>
                    <p class="text-surface-400">لم يقم أي طالب برفع هويته بعد</p>
                </div>`;
            return;
        }

        // تقسيم الطلاب
        const pendingUsers = [];
        const verifiedUsers = [];

        snap.forEach(d => {
            const user = { id: d.id, ...d.data() };
            if (user.isVerified === true) {
                verifiedUsers.push(user);
            } else {
                pendingUsers.push(user);
            }
        });

        // ترتيب حسب تاريخ الرفع (الأحدث أولاً)
        pendingUsers.sort((a, b) => (b.idCardUploadedAt?.toDate() || 0) - (a.idCardUploadedAt?.toDate() || 0));
        verifiedUsers.sort((a, b) => (b.idCardUploadedAt?.toDate() || 0) - (a.idCardUploadedAt?.toDate() || 0));

        let html = `
        <!-- أزرار العمليات الجماعية -->
        <div class="flex flex-wrap gap-3 mb-4 items-center">
            <button onclick="window.refreshIdReview()" class="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-xl font-bold transition flex items-center gap-2 shadow-lg">
                <i class="fas fa-sync-alt"></i> تحديث
            </button>
            ${pendingUsers.length > 0 ? `
            <button onclick="window.toggleSelectAllIds()" id="select-all-btn" class="bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-200 px-5 py-3 rounded-xl font-bold transition flex items-center gap-2 hover:bg-surface-300">
                <i class="far fa-check-square"></i> تحديد الكل
            </button>
            <button onclick="window.batchVerifySelected()" id="batch-approve-btn" class="bg-gradient-to-r from-accent-500 to-accent-600 text-white px-5 py-3 rounded-xl font-bold transition flex items-center gap-2 shadow-lg hover:shadow-accent-500/30 disabled:opacity-50" disabled>
                <i class="fas fa-check-double"></i> <span id="batch-approve-text">قبول المحددين (0)</span>
            </button>
            <button onclick="window.batchVerifyAll()" class="bg-gradient-to-r from-primary-600 to-primary-600 text-white px-5 py-3 rounded-xl font-bold transition flex items-center gap-2 shadow-lg hover:shadow-primary-500/30">
                <i class="fas fa-check-circle"></i> قبول الكل (${pendingUsers.length})
            </button>
            ` : ''}
        </div>
        
        <!-- الإحصائيات -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div class="bg-gradient-to-br from-orange-500 to-red-500 text-white p-5 rounded-2xl shadow-lg">
                <div class="text-4xl font-black" id="stat-pending">${pendingUsers.length}</div>
                <div class="text-sm opacity-80 font-bold">بانتظار التوثيق</div>
            </div>
            <div class="bg-gradient-to-br from-accent-500 to-accent-600 text-white p-5 rounded-2xl shadow-lg">
                <div class="text-4xl font-black" id="stat-verified">${verifiedUsers.length}</div>
                <div class="text-sm opacity-80 font-bold">موثق</div>
            </div>
            <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-5 rounded-2xl shadow-lg">
                <div class="text-4xl font-black">${snap.size}</div>
                <div class="text-sm opacity-80 font-bold">إجمالي الطلبات</div>
            </div>
            <div class="bg-gradient-to-br from-primary-500 to-pink-600 text-white p-5 rounded-2xl shadow-lg">
                <div class="text-4xl font-black">${Math.round((verifiedUsers.length / snap.size) * 100)}%</div>
                <div class="text-sm opacity-80 font-bold">نسبة التوثيق</div>
            </div>
        </div>
        
        <!-- التبويبات -->
        <div class="flex gap-2 mb-6 bg-surface-100 dark:bg-surface-800 p-2 rounded-2xl">
            <button id="tab-pending" onclick="window.showIdTab('pending')" class="flex-1 py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-orange-500 text-white transition">
                <i class="fas fa-clock"></i>
                بانتظار المراجعة (<span id="tab-pending-count">${pendingUsers.length}</span>)
            </button>
            <button id="tab-verified" onclick="window.showIdTab('verified')" class="flex-1 py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-transparent text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700 transition">
                <i class="fas fa-check-circle"></i>
                موثقين (<span id="tab-verified-count">${verifiedUsers.length}</span>)
            </button>
        </div>
        
        <!-- قائمة الطلبات المعلقة -->
        <div id="pending-list" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            ${pendingUsers.length === 0 ? `
                <div class="col-span-full text-center py-16 bg-accent-50 dark:bg-accent-900/20 rounded-2xl">
                    <i class="fas fa-check-double text-5xl text-accent-500 mb-4"></i>
                    <h3 class="text-lg font-bold text-accent-600">لا توجد طلبات معلقة 🎉</h3>
                    <p class="text-sm text-surface-500">جميع الطلبات تمت مراجعتها</p>
                </div>
            ` : pendingUsers.map(u => renderIdCard(u, false)).join('')}
        </div>
        
        <!-- قائمة الموثقين (مخفية) - منظمة حسب الكلية -->
        <div id="verified-list" class="hidden">
            <!-- زر عرض الكل -->
            <div class="mb-4 flex gap-2">
                <button onclick="window.showAllVerified()" class="flex-1 bg-gradient-to-r from-accent-500 to-accent-600 text-white py-3 px-6 rounded-xl font-bold hover:shadow-lg transition flex items-center justify-center gap-2">
                    <i class="fas fa-th-large"></i> عرض الكل (${verifiedUsers.length})
                </button>
                <button onclick="window.showVerifiedByCollege()" class="flex-1 bg-gradient-to-r from-primary-500 to-primary-600 text-white py-3 px-6 rounded-xl font-bold hover:shadow-lg transition flex items-center justify-center gap-2">
                    <i class="fas fa-folder-tree"></i> تصنيف حسب الكلية
                </button>
            </div>
            
            <!-- عرض الكل -->
            <div id="verified-all" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                ${verifiedUsers.map(u => renderIdCard(u, true)).join('')}
            </div>
            
            <!-- عرض حسب الكلية -->
            <div id="verified-by-college" class="hidden space-y-4">
                ${(() => {
                // تجميع حسب الكلية
                const byCollege = {};
                verifiedUsers.forEach(u => {
                    const colId = u.collegeId || 'unknown';
                    if (!byCollege[colId]) byCollege[colId] = [];
                    byCollege[colId].push(u);
                });

                return UNIVERSITY_STRUCTURE.map(college => {
                    const users = byCollege[college.id] || [];
                    if (users.length === 0) return '';

                    return `
                        <div class="bg-white dark:bg-surface-800 rounded-2xl overflow-hidden shadow-lg border-r-4 border-accent-500">
                            <div class="bg-gradient-to-r from-accent-500 to-accent-600 text-white p-4 cursor-pointer flex items-center justify-between hover:brightness-110 transition" onclick="document.getElementById('college-verified-${college.id}').classList.toggle('hidden')">
                                <div class="flex items-center gap-3">
                                    <i class="fas fa-university text-2xl"></i>
                                    <span class="font-black text-lg">🎓 ${college.name}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="bg-white/30 px-3 py-1 rounded-full text-sm font-bold">${users.length} طالب</span>
                                    <i class="fas fa-chevron-down transition"></i>
                                </div>
                            </div>
                            <div id="college-verified-${college.id}" class="hidden p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface-50 dark:bg-surface-700/50">
                                ${users.map(u => renderIdCard(u, true)).join('')}
                            </div>
                        </div>`;
                }).join('') + (byCollege['unknown']?.length ? `
                        <div class="bg-white dark:bg-surface-800 rounded-2xl overflow-hidden shadow-lg border-r-4 border-surface-400">
                            <div class="bg-gradient-to-r from-surface-500 to-surface-600 text-white p-4 cursor-pointer flex items-center justify-between hover:brightness-110 transition" onclick="document.getElementById('college-verified-unknown').classList.toggle('hidden')">
                                <div class="flex items-center gap-3">
                                    <i class="fas fa-question-circle text-2xl"></i>
                                    <span class="font-black text-lg">غير محدد</span>
                                </div>
                                <span class="bg-white/30 px-3 py-1 rounded-full text-sm font-bold">${byCollege['unknown'].length} طالب</span>
                            </div>
                            <div id="college-verified-unknown" class="hidden p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface-50 dark:bg-surface-700/50">
                                ${byCollege['unknown'].map(u => renderIdCard(u, true)).join('')}
                            </div>
                        </div>` : '');
            })()}
            </div>
        </div>
        `;

        content.innerHTML = html;

    } catch (e) {
        console.error(e);
        content.innerHTML = '<p class="text-red-500 text-center p-10">حدث خطأ في جلب الهويات: ' + e.message + '</p>';
    }
};

// دالة مساعدة لعرض كارت الطالب
const renderIdCard = (u, isVerified) => {
    const uploadTime = u.idCardUploadedAt?.toDate?.().toLocaleString('ar-EG') || 'غير معروف';
    const collegeInfo = u.collegeId ? `${u.collegeId}${u.departmentId ? ' / ' + u.departmentId : ''}` : 'غير محدد';

    return `
    <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-xl overflow-hidden border-2 ${isVerified ? 'border-accent-500' : 'border-orange-400'} flex flex-col group hover:shadow-2xl transition-all duration-300 hover:-translate-y-1" id="id-card-${u.id}">
        <!-- صورة الكارنيه -->
        <div class="relative h-52 bg-surface-200 dark:bg-surface-700 cursor-pointer overflow-hidden" onclick="window.open('${u.idCardImage}', '_blank')">
            <img src="${u.idCardImage}" class="w-full h-full object-cover transition duration-500 group-hover:scale-110" loading="lazy">
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition flex items-end justify-center pb-4">
                <span class="text-white font-bold bg-white/20 backdrop-blur px-4 py-2 rounded-full text-sm">
                    <i class="fas fa-expand-alt"></i> اضغط للتكبير
                </span>
            </div>
            <!-- Badge -->
            <div class="absolute top-3 right-3 ${isVerified ? 'bg-accent-500' : 'bg-orange-500'} text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1">
                <i class="fas ${isVerified ? 'fa-check-circle' : 'fa-clock'}"></i>
                ${isVerified ? 'موثق' : 'بانتظار المراجعة'}
            </div>
            ${!isVerified ? `
            <!-- Checkbox للتحديد -->
            <label class="absolute top-3 left-3 cursor-pointer" onclick="event.stopPropagation()">
                <input type="checkbox" class="id-select-checkbox w-6 h-6 accent-accent-500 rounded-lg cursor-pointer shadow-lg" data-uid="${u.id}" onchange="window.updateBatchCount()">
            </label>
            ` : ''}
        </div>
        
        <!-- معلومات الطالب -->
        <div class="p-5 flex-1 flex flex-col">
            <div class="flex items-center gap-3 mb-4">
                <img src="${u.photoURL || 'https://ui-avatars.com/api/?name=' + u.displayName}" loading="lazy" class="w-12 h-12 rounded-full border-2 ${isVerified ? 'border-accent-500' : 'border-orange-400'} shadow">
                <div class="flex-1 min-w-0">
                    <h3 class="font-black dark:text-white text-base flex items-center gap-1 truncate">
                        ${u.displayName}
                        ${isVerified ? '<i class="fas fa-check-circle text-primary-500 text-sm"></i>' : ''}
                    </h3>
                    <p class="text-[11px] text-surface-500 truncate font-mono">${(auth.currentUser?.email === SUPER_ADMIN_EMAIL) ? u.email : (u.collegeId || '')}</p>
                </div>
            </div>
            
            <!-- تفاصيل إضافية -->
            <div class="space-y-2 mb-4 text-xs">
                ${u.nationalId ? `
                <div class="flex items-center justify-between bg-primary-50 dark:bg-primary-900/30 p-2 rounded-lg">
                    <span class="text-primary-600 dark:text-primary-400 font-bold">🆔 الرقم القومي</span>
                    <span class="font-mono font-bold text-surface-800 dark:text-surface-200 tracking-wider">${u.nationalId}</span>
                </div>
                ` : ''}
                ${u.studentId ? `
                <div class="flex items-center justify-between bg-primary-50 dark:bg-primary-900/30 p-2 rounded-lg">
                    <span class="text-primary-600 dark:text-primary-400 font-bold">🎓 رقم الطالب</span>
                    <span class="font-mono font-bold text-surface-800 dark:text-surface-200 tracking-wider">${u.studentId}</span>
                </div>
                ` : ''}
                ${u.fullName ? `
                <div class="flex items-center justify-between bg-accent-50 dark:bg-accent-900/30 p-2 rounded-lg">
                    <span class="text-accent-600 dark:text-accent-400 font-bold">👤 الاسم الرباعي</span>
                    <span class="font-bold text-surface-800 dark:text-surface-200 text-[11px]">${u.fullName}</span>
                </div>
                ` : ''}
                <div class="flex items-center justify-between bg-surface-50 dark:bg-surface-700/50 p-2 rounded-lg">
                    <span class="text-surface-500">الكلية / القسم</span>
                    <span class="font-bold text-surface-700 dark:text-surface-300">${collegeInfo}</span>
                </div>
                <div class="flex items-center justify-between bg-surface-50 dark:bg-surface-700/50 p-2 rounded-lg">
                    <span class="text-surface-500">تاريخ الرفع</span>
                    <span class="font-mono text-surface-700 dark:text-surface-300">${uploadTime}</span>
                </div>
            </div>
            
            <!-- الأزرار -->
            <div class="flex gap-2 mt-auto">
                ${isVerified ? `
                    <button onclick="window.verifyUser('${u.id}', false)" class="flex-1 bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 py-3 rounded-xl font-bold hover:bg-surface-200 dark:hover:bg-surface-600 transition text-sm">
                        <i class="fas fa-times"></i> إلغاء التوثيق
                    </button>
                ` : `
                    <button onclick="window.verifySingleUser('${u.id}')" class="flex-1 bg-gradient-to-r from-accent-500 to-accent-600 text-white py-3 rounded-xl font-bold hover:shadow-lg hover:shadow-accent-500/30 transition text-sm flex items-center justify-center gap-2">
                        <i class="fas fa-check-circle"></i> قبول وتوثيق
                    </button>
                    <button onclick="window.rejectIdCard('${u.id}')" class="bg-red-100 dark:bg-red-900/30 text-red-600 px-4 rounded-xl font-bold hover:bg-red-200 transition" title="رفض">
                        <i class="fas fa-times"></i>
                    </button>
                `}
                <button onclick="window.location.hash='#profile/${u.id}'" class="bg-primary-100 dark:bg-primary-900/30 text-primary-600 px-4 rounded-xl font-bold hover:bg-primary-200 transition" title="عرض البروفايل">
                    <i class="fas fa-user"></i>
                </button>
            </div>
        </div>
    </div>`;
};

// تبديل التبويبات
window.showIdTab = (tab) => {
    const pendingList = document.getElementById('pending-list');
    const verifiedList = document.getElementById('verified-list');
    const tabPending = document.getElementById('tab-pending');
    const tabVerified = document.getElementById('tab-verified');

    if (tab === 'pending') {
        pendingList.classList.remove('hidden');
        verifiedList.classList.add('hidden');
        tabPending.classList.add('bg-orange-500', 'text-white');
        tabPending.classList.remove('bg-transparent', 'text-surface-600', 'dark:text-surface-400');
        tabVerified.classList.remove('bg-accent-500', 'text-white');
        tabVerified.classList.add('bg-transparent', 'text-surface-600', 'dark:text-surface-400');
    } else {
        pendingList.classList.add('hidden');
        verifiedList.classList.remove('hidden');
        tabVerified.classList.add('bg-accent-500', 'text-white');
        tabVerified.classList.remove('bg-transparent', 'text-surface-600', 'dark:text-surface-400');
        tabPending.classList.remove('bg-orange-500', 'text-white');
        tabPending.classList.add('bg-transparent', 'text-surface-600', 'dark:text-surface-400');
    }
};

// عرض كل الموثقين
window.showAllVerified = () => {
    document.getElementById('verified-all')?.classList.remove('hidden');
    document.getElementById('verified-by-college')?.classList.add('hidden');
};

// عرض حسب الكلية
window.showVerifiedByCollege = () => {
    document.getElementById('verified-all')?.classList.add('hidden');
    document.getElementById('verified-by-college')?.classList.remove('hidden');
};

// زرار التحديث
window.refreshIdReview = () => {
    openIdReviewDashboard();
    window.showToast?.('تم التحديث', 'info');
};

// رفض الكارنيه (مع حذف الصورة من Storage)
window.rejectIdCard = async (uid) => {
    const reason = prompt("سبب الرفض (سيظهر للطالب):");
    if (!reason) return;

    try {
        // جلب بيانات المستخدم للحصول على رابط الصورة
        const userDoc = await getDoc(doc(db, "users", uid));
        const userData = userDoc.data();

        // حذف الصورة من Firebase Storage إن وجدت
        if (userData?.idCardImage) {
            try {
                // استخراج مسار الملف من الرابط
                const imageUrl = userData.idCardImage;
                const urlPath = new URL(imageUrl).pathname;
                const storagePath = decodeURIComponent(urlPath.split('/o/')[1]?.split('?')[0] || '');

                if (storagePath) {
                    const imageRef = ref(storage, storagePath);
                    await deleteObject(imageRef);
                    console.log('🗑️ ID card image deleted from storage:', storagePath);
                }
            } catch (storageError) {
                console.warn('Could not delete image from storage:', storageError);
                // متابعة حتى لو فشل حذف الصورة
            }
        }

        // تحديث بيانات المستخدم
        await updateDoc(doc(db, "users", uid), {
            idCardImage: null,
            idRejectionReason: reason,
            idRejectedAt: new Date()
        });

        window.showToast?.("تم رفض الكارنيه وحذف الصورة ✅", "success");
        openIdReviewDashboard();
    } catch (e) {
        console.error('Reject ID error:', e);
        alert("خطأ: " + e.message);
    }
};

// ============================================================
// 4. سجل الدرجات وتصدير التقارير (Scores & Excel)
// ============================================================
export const viewUserScoresView = async () => {
    const isPageAdmin = window.location.hash.includes('admin') || (auth.currentUser && auth.currentUser.email === SUPER_ADMIN_EMAIL);
    const sectionId = isPageAdmin ? 'admin-view-area' : 'scores-section';
    const containerId = isPageAdmin ? 'admin-view-content' : 'user-scores-list';

    document.getElementById(sectionId).classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'leaderboard-section', 'assignments-section', 'profile-section', 'admin-settings-section'].forEach(id => { if (id !== sectionId) document.getElementById(id)?.classList.add('hidden'); });

    if (isPageAdmin) document.getElementById('admin-view-title').textContent = '📊 سجل الدرجات الشامل';
    const content = document.getElementById(containerId);
    content.innerHTML = '<div class="p-20 text-center"><i class="fas fa-spinner fa-spin text-4xl text-primary-600"></i><p class="mt-4 font-bold text-surface-500">جاري تحليل البيانات...</p></div>';

    try {
        const q = query(collection(db, "user_scores"), orderBy("date", "desc"));
        const snap = await getDocs(q);
        const allScores = [];
        snap.forEach(d => allScores.push({ id: d.id, ...d.data() }));

        window.lastScoresData = allScores;

        const myScores = isPageAdmin ? allScores : allScores.filter(s => s.userId === auth.currentUser.uid);

        if (myScores.length === 0) {
            content.innerHTML = '<div class="p-20 text-center opacity-50 font-bold text-xl">لا توجد سجلات درجات متاحة.</div>';
            return;
        }

        if (isPageAdmin) {
            let html = `
                <div class="mb-6 flex justify-between items-center bg-white dark:bg-surface-800 p-4 rounded-2xl shadow-sm">
                    <button onclick="window.openUsersLogView()" class="text-primary-600 font-bold hover:underline flex items-center gap-2"><i class="fas fa-arrow-right"></i> عودة للطلاب</button>
                    <button onclick="window.exportToExcel()" class="bg-accent-600 text-white px-6 py-3 rounded-xl shadow-lg font-black hover:bg-accent-700 transition flex items-center gap-2 transform hover:scale-105">
                        <i class="fas fa-file-excel text-xl"></i> تحميل تقرير Excel
                    </button>
                </div>
                <div class="overflow-x-auto rounded-3xl shadow-xl border dark:border-surface-700 bg-white dark:bg-surface-800">
                    <table class="w-full text-sm text-right">
                        <thead class="bg-surface-100 dark:bg-surface-900 font-black text-surface-600 dark:text-surface-300">
                            <tr>
                                <th class="p-5">الطالب</th>
                                <th class="p-5">الكلية</th>
                                <th class="p-5">نوع النشاط</th>
                                <th class="p-5">الدرجة</th>
                                <th class="p-5">التاريخ</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y dark:divide-surface-700">`;

            myScores.forEach(s => {
                html += `
                    <tr class="hover:bg-primary-50 dark:hover:bg-primary-900/10 transition">
                        <td class="p-5 font-bold dark:text-white">${s.userName}</td>
                        <td class="p-5 text-xs font-bold text-primary-500 bg-primary-50 dark:bg-primary-900/30 rounded w-fit h-fit">${s.collegeId || '-'}</td>
                        <td class="p-5">
                            <div class="font-bold dark:text-surface-300">${s.quizTitle}</div>
                            <div class="text-[10px] text-surface-400">${s.sectionTitle || 'عام'}</div>
                        </td>
                        <td class="p-5 text-center font-black text-lg ${s.score >= 50 ? 'text-accent-600' : 'text-red-500'} dir-ltr">${s.score}</td>
                        <td class="p-5 text-xs text-surface-400 font-mono">${s.date?.toDate ? s.date.toDate().toLocaleDateString('ar-EG') : '-'}</td>
                    </tr>`;
            });
            html += '</tbody></table></div>';
            content.innerHTML = html;
            return;
        }

        const grouped = {};
        myScores.forEach(s => {
            const subj = s.sectionTitle || 'أنشطة عامة';
            if (!grouped[subj]) grouped[subj] = { total: 0, items: [] };
            grouped[subj].total += (parseInt(s.score) || 0);
            grouped[subj].items.push(s);
        });

        let studentHtml = `<div class="grid grid-cols-1 md:grid-cols-2 gap-6">`;
        for (const [subject, data] of Object.entries(grouped)) {
            const sid = subject.replace(/\s/g, '');
            studentHtml += `
                <div class="bg-white dark:bg-surface-800 rounded-[2rem] shadow-xl border-r-8 border-primary-600 overflow-hidden group hover:-translate-y-1 transition duration-300">
                    <div class="p-6 flex justify-between items-center cursor-pointer bg-surface-50 dark:bg-surface-700/50" onclick="document.getElementById('det-${sid}').classList.toggle('hidden')">
                        <div class="flex items-center gap-4">
                            <div class="w-14 h-14 bg-primary-600 text-white rounded-2xl flex items-center justify-center font-bold text-2xl shadow-lg shadow-primary-500/30">
                                <i class="fas fa-book"></i>
                            </div>
                            <div>
                                <h3 class="font-black text-xl dark:text-white">${subject}</h3>
                                <p class="text-xs text-surface-500 font-bold">${data.items.length} نشاط مسجل</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="block text-[10px] text-surface-400 font-bold uppercase">المجموع</span>
                            <span class="text-3xl font-black text-accent-600 dir-ltr">${data.total}</span>
                        </div>
                    </div>
                    
                    <div id="det-${sid}" class="hidden bg-white dark:bg-surface-800 p-6 animate-slide-down border-t dark:border-surface-700">
                        <table class="w-full text-sm text-right">
                            <thead class="text-xs text-surface-400 border-b dark:border-surface-700 uppercase font-black">
                                <tr><th class="pb-3">النشاط</th><th class="pb-3 text-center">الدرجة</th><th class="pb-3 text-left">التاريخ</th></tr>
                            </thead>
                            <tbody class="divide-y dark:divide-surface-700">
                                ${data.items.map(it => `
                                    <tr class="group/row hover:bg-surface-50 dark:hover:bg-surface-700/50">
                                        <td class="py-3 dark:text-white font-bold text-xs">${it.quizTitle}</td>
                                        <td class="py-3 text-center font-black ${it.score >= 50 ? 'text-accent-500' : 'text-red-500'} dir-ltr">${it.score}</td>
                                        <td class="py-3 text-left text-[10px] text-surface-400 font-mono">${it.date?.toDate().toLocaleDateString()}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;
        }
        studentHtml += `</div>`;
        content.innerHTML = studentHtml;

    } catch (e) {
        console.error(e);
        content.innerHTML = '<p class="text-red-500 font-bold text-center">حدث خطأ في تحميل السجل.</p>';
    }
};

// ============================================================
// 5. إدارة الصلاحيات والمشرفين (Admin Permissions)
// ============================================================
export const openAdminManagementView = async () => {
    const area = document.getElementById('admin-settings-section'); area.classList.remove('hidden');
    ['home-screen', 'study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'leaderboard-section', 'assignments-section', 'profile-section', 'admin-view-area'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });

    // حماية الصفحة للمالك فقط
    if (auth.currentUser.email !== SUPER_ADMIN_EMAIL) {
        document.getElementById('admin-settings-content').innerHTML = `
            <div class="flex flex-col items-center justify-center p-20 bg-white dark:bg-surface-800 rounded-3xl shadow-xl">
                <i class="fas fa-lock text-6xl text-red-500 mb-6"></i>
                <h2 class="text-2xl font-black text-surface-800 dark:text-white">منطقة محظورة</h2>
                <p class="text-surface-500 mt-2">إدارة المشرفين متاحة فقط لمالك المنصة.</p>
            </div>`;
        return;
    }

    const sectionsSnap = await getDocs(collection(db, "study_sections"));
    allSectionsCache = []; sectionsSnap.forEach(s => { allSectionsCache.push({ id: s.id, ...s.data() }); });

    const collegesOptions = UNIVERSITY_STRUCTURE.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    document.getElementById('admin-settings-content').innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
            <div class="p-8 bg-white dark:bg-surface-800 rounded-[2.5rem] shadow-xl h-fit border-t-8 border-primary-600">
                <h3 id="admin-form-title" class="font-black text-2xl mb-6 dark:text-white flex items-center gap-2">
                    <i class="fas fa-user-plus text-primary-600"></i> إضافة مشرف جديد
                </h3>
                
                <div class="mb-6">
                    <label class="block text-xs font-bold text-surface-400 mb-2 uppercase">البريد الإلكتروني (Google Email):</label>
                    <input type="email" id="admin-email" placeholder="example@gmail.com" class="w-full p-4 border rounded-2xl dark:bg-surface-700 dark:text-white text-left dir-ltr font-bold outline-none focus:ring-2 focus:ring-primary-500 font-mono">
                </div>
                
                <!-- اختيار الرتبة -->
                <div class="mb-6">
                    <label class="block text-xs font-bold text-surface-400 mb-2 uppercase">قالب الصلاحيات (يمكنك التعديل من الخيارات أدناه):</label>
                    <select id="admin-role" class="w-full p-4 border rounded-2xl dark:bg-surface-700 dark:text-white font-bold outline-none focus:ring-2 focus:ring-primary-500" onchange="window.applyRoleTemplate()">
                        <option value="custom">🔧 تخصيص يدوي - اختر الصلاحيات بنفسك</option>
                        <option value="viewer">👁️ مشاهد - عرض فقط بدون تعديل</option>
                        <option value="moderator">🛡️ مراقب - الطلاب + الدعم + الهويات</option>
                        <option value="content_manager" selected>📝 مدير محتوى - المحتوى + الكويزات</option>
                        <option value="super_admin">⭐ سوبر أدمن - معظم الصلاحيات (بدون الخطرة)</option>
                    </select>
                    <div class="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
                        <p class="text-xs text-amber-700 dark:text-amber-400 font-bold flex items-center gap-2">
                            <i class="fas fa-exclamation-triangle"></i>
                            الصلاحيات الخطرة (🔴) لا تتفعل تلقائياً - يجب تحديدها يدوياً
                    </div>
                </div>
                
                <div class="bg-surface-50 dark:bg-surface-900 p-6 rounded-2xl mb-6 border dark:border-surface-700">
                    <p class="text-xs font-black text-primary-600 mb-4 uppercase tracking-wide flex items-center gap-2"><i class="fas fa-sitemap"></i> تحديد النطاق (لإدارة الطلاب):</p>
                    
                    <div class="flex gap-3 mb-4">
                        <select id="scope-college" class="w-1/2 p-3 border rounded-xl text-xs dark:bg-surface-700 dark:text-white outline-none font-bold"><option value="">-- كل الكليات --</option>${collegesOptions}</select>
                        <select id="scope-dept" class="w-1/2 p-3 border rounded-xl text-xs dark:bg-surface-700 dark:text-white outline-none font-bold" disabled><option value="">-- كل الأقسام --</option></select>
                    </div>
                    
                    <div id="scope-checkboxes" class="h-40 overflow-y-auto bg-white dark:bg-surface-800 p-3 rounded-xl border dark:border-surface-700 custom-scrollbar space-y-1">
                        <p class="text-center text-xs text-surface-400 py-10 opacity-50">اختر الكلية لعرض المواد المتاحة (للمحتوى)...</p>
                    </div>
                </div>
                
                <div class="mb-6">
                    <p class="text-xs font-bold text-surface-400 mb-2 uppercase">المواد المحددة (لصلاحية المحتوى):</p>
                    <div id="selected-scopes-tags" class="flex flex-wrap gap-2 min-h-[40px] p-3 border border-dashed rounded-2xl bg-white dark:bg-900"></div>
                </div>
                
                <!-- صلاحيات عادية -->
                <p class="text-xs font-bold text-surface-500 mb-2 uppercase">🟢 الصلاحيات الأساسية:</p>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                    <label class="flex items-center gap-2 p-2 bg-primary-50 dark:bg-primary-900/20 rounded-xl cursor-pointer hover:bg-primary-100 transition border border-primary-100 dark:border-primary-800">
                        <input type="checkbox" id="p-cms" class="w-4 h-4 accent-primary-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-edit text-primary-500 mr-1"></i>المحتوى</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-primary-50 dark:bg-primary-900/20 rounded-xl cursor-pointer hover:bg-primary-100 transition border border-primary-100 dark:border-primary-800">
                        <input type="checkbox" id="p-quiz" class="w-4 h-4 accent-primary-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-question-circle text-primary-500 mr-1"></i>الكويزات</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-accent-50 dark:bg-accent-900/20 rounded-xl cursor-pointer hover:bg-accent-100 transition border border-accent-100 dark:border-accent-800">
                        <input type="checkbox" id="p-users" class="w-4 h-4 accent-accent-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-users text-accent-500 mr-1"></i>الطلاب</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-primary-50 dark:bg-primary-900/20 rounded-xl cursor-pointer hover:bg-primary-100 transition border border-primary-100 dark:border-primary-800">
                        <input type="checkbox" id="p-support" class="w-4 h-4 accent-primary-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-headset text-primary-500 mr-1"></i>الدعم</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-primary-50 dark:bg-primary-900/20 rounded-xl cursor-pointer hover:bg-primary-100 transition border border-primary-100 dark:border-primary-800">
                        <input type="checkbox" id="p-idReview" class="w-4 h-4 accent-primary-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-id-card text-primary-500 mr-1"></i>الهويات</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-primary-50 dark:bg-primary-900/20 rounded-xl cursor-pointer hover:bg-primary-100 transition border border-primary-100 dark:border-primary-800">
                        <input type="checkbox" id="p-statistics" class="w-4 h-4 accent-primary-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-chart-pie text-primary-500 mr-1"></i>الإحصائيات</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-pink-50 dark:bg-pink-900/20 rounded-xl cursor-pointer hover:bg-pink-100 transition border border-pink-100 dark:border-pink-800">
                        <input type="checkbox" id="p-reports" class="w-4 h-4 accent-pink-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-flag text-pink-500 mr-1"></i>البلاغات</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded-xl cursor-pointer hover:bg-orange-100 transition border border-orange-100 dark:border-orange-800">
                        <input type="checkbox" id="p-broadcast" class="w-4 h-4 accent-orange-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-bullhorn text-orange-500 mr-1"></i>الإشعارات</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-violet-50 dark:bg-violet-900/20 rounded-xl cursor-pointer hover:bg-violet-100 transition border border-violet-100 dark:border-violet-800">
                        <input type="checkbox" id="p-exams" class="w-4 h-4 accent-violet-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-calendar-alt text-violet-500 mr-1"></i>الامتحانات</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-accent-50 dark:bg-accent-900/20 rounded-xl cursor-pointer hover:bg-accent-100 transition border border-accent-100 dark:border-accent-800">
                        <input type="checkbox" id="p-announcements" class="w-4 h-4 accent-accent-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-scroll text-accent-500 mr-1"></i>الإعلانات</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-surface-50 dark:bg-surface-900/20 rounded-xl cursor-pointer hover:bg-surface-100 transition border border-surface-100 dark:border-surface-800">
                        <input type="checkbox" id="p-grades" class="w-4 h-4 accent-surface-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-graduation-cap text-surface-500 mr-1"></i>رفع الدرجات</span>
                    </label>
                </div>
                
                <!-- صلاحيات خطرة -->
                <p class="text-xs font-bold text-red-500 mb-2 uppercase">🔴 صلاحيات خطرة (يجب تفعيلها يدوياً):</p>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6 p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border-2 border-red-200 dark:border-red-800">
                    <label class="flex items-center gap-2 p-2 bg-white dark:bg-surface-800 rounded-xl cursor-pointer hover:bg-red-100 transition border border-red-200 dark:border-red-700">
                        <input type="checkbox" id="p-bannedUsers" class="w-4 h-4 accent-red-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-ban text-red-500 mr-1"></i>المحظورين</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-white dark:bg-surface-800 rounded-xl cursor-pointer hover:bg-red-100 transition border border-red-200 dark:border-red-700">
                        <input type="checkbox" id="p-deleteUsers" class="w-4 h-4 accent-red-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-user-times text-red-500 mr-1"></i>حذف الطلاب</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-white dark:bg-surface-800 rounded-xl cursor-pointer hover:bg-red-100 transition border border-red-200 dark:border-red-700">
                        <input type="checkbox" id="p-devices" class="w-4 h-4 accent-red-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-mobile-alt text-red-500 mr-1"></i>الأجهزة</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-white dark:bg-surface-800 rounded-xl cursor-pointer hover:bg-red-100 transition border border-red-200 dark:border-red-700">
                        <input type="checkbox" id="p-loginLogs" class="w-4 h-4 accent-red-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-history text-red-500 mr-1"></i>سجل الدخول</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 bg-white dark:bg-surface-800 rounded-xl cursor-pointer hover:bg-red-100 transition border border-red-200 dark:border-red-700">
                        <input type="checkbox" id="p-superAdmin" class="w-4 h-4 accent-red-600 rounded">
                        <span class="text-xs font-bold dark:text-white"><i class="fas fa-crown text-red-500 mr-1"></i>سوبر أدمن</span>
                    </label>
                </div>
                
                <div class="flex gap-3">
                    <button id="save-admin-btn" class="flex-1 bg-primary-600 text-white py-4 rounded-2xl hover:bg-primary-700 font-black shadow-lg shadow-primary-500/30 transition transform hover:-translate-y-1">
                        حفظ الصلاحيات
                    </button>
                    <button id="cancel-edit-admin" class="hidden bg-surface-200 text-surface-600 px-6 rounded-2xl hover:bg-surface-300 font-bold transition">إلغاء</button>
                </div>
            </div>
            
            <div class="p-8 bg-white dark:bg-surface-800 rounded-[2.5rem] shadow-xl border-t-8 border-surface-400 h-fit">
                <h3 class="font-black text-2xl mb-6 dark:text-white flex items-center gap-2"><i class="fas fa-users-cog text-surface-500"></i> فريق الإدارة</h3>
                <div id="admins-list" class="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-2"></div>
            </div>
            
            <!-- قسم الإشعارات -->
            <div class="lg:col-span-2 p-8 bg-gradient-to-br from-primary-50 to-primary-50 dark:from-primary-900/20 dark:to-primary-900/20 rounded-[2.5rem] shadow-xl border-2 border-primary-200 dark:border-primary-800">
                <h3 class="font-black text-2xl mb-6 text-primary-600 dark:text-primary-400 flex items-center gap-3">
                    <div class="w-12 h-12 bg-primary-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/30">
                        <i class="fas fa-bell"></i>
                    </div>
                    إعدادات الإشعارات
                </h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="bg-white dark:bg-surface-800 rounded-2xl p-6 border dark:border-surface-700 shadow-sm">
                        <h4 class="font-bold text-lg mb-4 dark:text-white flex items-center gap-2">
                            <i class="fas fa-mobile-alt text-accent-500"></i> إشعارات الهاتف
                        </h4>
                        <p class="text-sm text-surface-500 dark:text-surface-400 mb-4">
                            فعّل الإشعارات لتصلك تنبيهات فورية على هاتفك.
                        </p>
                        <button onclick="window.showNotificationPrompt()" class="w-full bg-accent-600 hover:bg-accent-700 text-white py-4 px-6 rounded-2xl font-black text-lg transition transform hover:scale-105 hover:shadow-lg hover:shadow-accent-500/30 flex items-center justify-center gap-3">
                            <i class="fas fa-bell"></i>
                            تفعيل الإشعارات
                        </button>
                    </div>
                    
                    <div class="bg-white dark:bg-surface-800 rounded-2xl p-6 border dark:border-surface-700 shadow-sm">
                        <h4 class="font-bold text-lg mb-4 dark:text-white flex items-center gap-2">
                            <i class="fas fa-info-circle text-primary-500"></i> معلومات
                        </h4>
                        <ul class="text-sm text-surface-500 dark:text-surface-400 space-y-2">
                            <li><i class="fas fa-check text-accent-500 ml-2"></i>إشعارات المنشورات الجديدة</li>
                            <li><i class="fas fa-check text-accent-500 ml-2"></i>إشعارات رسائل الدعم</li>
                            <li><i class="fas fa-check text-accent-500 ml-2"></i>تنبيهات الكارنيهات المعلقة</li>
                            <li><i class="fas fa-check text-accent-500 ml-2"></i>التنبيهات العاجلة</li>
                        </ul>
                    </div>
                </div>
            </div>
            
            <!-- قسم التحكم بالصيانة - للمالك فقط -->
            <div class="lg:col-span-2 p-8 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-[2.5rem] shadow-xl border-2 border-red-200 dark:border-red-800">
                <h3 class="font-black text-2xl mb-6 text-red-600 dark:text-red-400 flex items-center gap-3">
                    <div class="w-12 h-12 bg-red-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/30">
                        <i class="fas fa-power-off"></i>
                    </div>
                    تحكم المنصة (Owner Only)
                </h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- زر تفعيل/إلغاء الصيانة -->
                    <div class="bg-white dark:bg-surface-800 rounded-2xl p-6 border dark:border-surface-700 shadow-sm">
                        <h4 class="font-bold text-lg mb-4 dark:text-white flex items-center gap-2">
                            <i class="fas fa-tools text-orange-500"></i> وضع الصيانة
                        </h4>
                        <p class="text-sm text-surface-500 dark:text-surface-400 mb-4">
                            عند تفعيل الصيانة، لن يتمكن أي شخص من دخول المنصة إلا أنت.
                        </p>
                        <button id="toggle-maintenance-btn" onclick="window.toggleMaintenanceMode()" class="w-full bg-red-600 hover:bg-red-700 text-white py-4 px-6 rounded-2xl font-black text-lg transition transform hover:scale-105 hover:shadow-lg hover:shadow-red-500/30 flex items-center justify-center gap-3">
                            <i class="fas fa-power-off"></i>
                            <span id="maintenance-btn-text">جاري التحقق...</span>
                        </button>
                    </div>
                    
                    <!-- إعدادات رسالة الصيانة -->
                    <div class="bg-white dark:bg-surface-800 rounded-2xl p-6 border dark:border-surface-700 shadow-sm">
                        <h4 class="font-bold text-lg mb-4 dark:text-white flex items-center gap-2">
                            <i class="fas fa-comment-dots text-primary-500"></i> إعدادات الصيانة
                        </h4>
                        
                        <input type="text" id="maintenance-title" placeholder="عنوان الصفحة (الافتراضي: المنصة في وضع الصيانة)" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white text-sm outline-none focus:ring-2 focus:ring-red-500 mb-3">
                        
                        <select id="maintenance-layout" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white text-sm outline-none focus:ring-2 focus:ring-red-500 mb-3">
                            <option value="default">🚧 حاجز الصيانة (الافتراضي)</option>
                            <option value="update">🚀 تحديثات المنصة (صاروخ)</option>
                            <option value="coming_soon">⏳ قريباً (ساعة رملية)</option>
                        </select>

                        <textarea id="maintenance-message" rows="2" placeholder="نعمل على تحسينات للمنصة..." class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white text-sm outline-none focus:ring-2 focus:ring-red-500 mb-3"></textarea>
                        <input type="text" id="maintenance-return-time" placeholder="الوقت المتوقع (مثال: اليوم الساعة 10 مساءً)" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white text-sm outline-none focus:ring-2 focus:ring-red-500 mb-3">
                        
                        <!-- رقم الواتساب -->
                        <div class="flex gap-3 mb-3">
                            <label class="flex items-center gap-2 cursor-pointer bg-surface-50 dark:bg-surface-700 px-4 py-3 rounded-xl border dark:border-surface-600 w-1/2">
                                <input type="checkbox" id="maintenance-show-whatsapp" class="w-5 h-5 accent-accent-500" checked>
                                <span class="text-xs font-bold dark:text-white">عرض زر الواتساب</span>
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer bg-surface-50 dark:bg-surface-700 px-4 py-3 rounded-xl border dark:border-surface-600 w-1/2">
                                <input type="checkbox" id="maintenance-show-phone" class="w-5 h-5 accent-primary-500" checked>
                                <span class="text-xs font-bold dark:text-white">الرقم نصياً</span>
                            </label>
                        </div>
                        <input type="text" id="maintenance-whatsapp" placeholder="رقم الواتساب (مثال: 01040224684)" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white text-sm outline-none focus:ring-2 focus:ring-accent-500 mb-3">
                        
                        <button onclick="window.saveMaintenanceSettings()" class="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-bold transition">
                            <i class="fas fa-save"></i> حفظ الإعدادات
                        </button>
                    </div>
                </div>
                
                <!-- قسم الإيميلات المستثناة -->
                <div class="mt-6 bg-white dark:bg-surface-800 rounded-2xl p-6 border dark:border-surface-700 shadow-sm">
                    <h4 class="font-bold text-lg mb-4 dark:text-white flex items-center gap-2">
                        <i class="fas fa-user-shield text-accent-500"></i> إيميلات يُسمح لها بالدخول أثناء الصيانة
                    </h4>
                    <p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
                        أضف أي إيميل تريده (ليس شرطاً يكون أدمن) ليتمكن من الدخول أثناء وضع الصيانة
                    </p>
                    
                    <div class="flex gap-2 mb-4">
                        <input type="email" id="whitelist-email-input" placeholder="example@gmail.com" class="flex-1 p-3 border rounded-xl dark:bg-surface-700 dark:text-white text-sm outline-none focus:ring-2 focus:ring-accent-500 font-mono text-left">
                        <button onclick="window.addWhitelistEmail()" class="bg-accent-600 hover:bg-accent-700 text-white px-6 rounded-xl font-bold transition flex items-center gap-2">
                            <i class="fas fa-plus"></i> أضف
                        </button>
                    </div>
                    
                    <div id="whitelist-emails-list" class="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                        <p class="text-center text-xs text-surface-400 py-4">جاري التحميل...</p>
                    </div>
                </div>
                
                <!-- معلومات إضافية -->
                <div class="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
                    <p class="text-sm text-yellow-700 dark:text-yellow-300 flex items-center gap-2">
                        <i class="fas fa-info-circle"></i>
                        رقم الواتساب المعروض للطلاب: <strong class="font-mono">01040224684</strong>
                    </p>
                </div>
            </div>
        </div>
    `;

    currentSelectedScopes.clear(); editingAdminEmail = null; setupScopeSelectors(); loadAdminsList();

    // تحميل حالة الصيانة والقائمة البيضاء بعد رسم الـ HTML
    setTimeout(() => {
        window.loadMaintenanceStatus?.();
        window.loadWhitelistEmails?.();
        window.applyRoleTemplate(); // تطبيق القالب الافتراضي
    }, 100);

    // دالة تطبيق قالب الصلاحيات
    window.applyRoleTemplate = () => {
        const role = document.getElementById('admin-role')?.value || 'custom';

        // تصفير كل الصلاحيات أولاً
        const allCheckboxes = [
            'p-cms', 'p-quiz', 'p-users', 'p-support', 'p-idReview', 'p-statistics',
            'p-reports', 'p-broadcast', 'p-exams', 'p-announcements', 'p-grades',
            'p-bannedUsers', 'p-deleteUsers', 'p-devices', 'p-loginLogs', 'p-superAdmin'
        ];

        // القوالب الجاهزة (ملاحظة: الصلاحيات الخطرة لا تتفعل تلقائياً)
        const templates = {
            custom: [], // لا شيء - الأدمن يختار بنفسه
            viewer: [], // مشاهدة فقط - لا صلاحيات
            moderator: ['p-users', 'p-support', 'p-idReview', 'p-reports'], // مراقب
            content_manager: ['p-cms', 'p-quiz', 'p-exams', 'p-grades'], // مدير محتوى
            super_admin: [
                // الصلاحيات الأساسية - كلها
                'p-cms', 'p-quiz', 'p-users', 'p-support', 'p-idReview', 'p-statistics',
                'p-reports', 'p-broadcast', 'p-exams', 'p-announcements', 'p-grades'
                // الصلاحيات الخطرة لا تتفعل تلقائياً!
            ]
        };

        const selectedTemplate = templates[role] || [];

        // تطبيق القالب
        allCheckboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.checked = selectedTemplate.includes(id);
            }
        });

        // رسالة توضيحية
        if (role === 'super_admin') {
            window.showToast?.('💡 السوبر أدمن: الصلاحيات الخطرة (🔴) غير مفعلة - فعّلها يدوياً إذا لزم', 'info');
        }
    };

    document.getElementById('save-admin-btn').onclick = async () => {
        const email = document.getElementById('admin-email').value.trim();
        if (!email) return alert("⚠️ يرجى كتابة البريد الإلكتروني");

        // جلب الرتبة المختارة
        const role = document.getElementById('admin-role').value;
        const roleConfig = {
            'super_admin': { level: 80, permissions: { cms: true, quiz: true, users: true, support: true, broadcast: true, superAdmin: true } },
            'content_manager': { level: 60, permissions: { cms: true, quiz: true, users: false, support: false } },
            'moderator': { level: 40, permissions: { cms: false, quiz: false, users: true, support: true } },
            'viewer': { level: 20, permissions: { cms: false, quiz: false, users: false, support: false } }
        };

        const config = roleConfig[role] || { level: 50, permissions: {} };

        const allowedSections = Array.from(currentSelectedScopes);
        // جمع الصلاحيات من الـ checkboxes
        const permissions = {
            // صلاحيات أساسية
            cms: document.getElementById('p-cms')?.checked || false,
            quiz: document.getElementById('p-quiz')?.checked || false,
            users: document.getElementById('p-users')?.checked || false,
            support: document.getElementById('p-support')?.checked || false,
            idReview: document.getElementById('p-idReview')?.checked || false,
            statistics: document.getElementById('p-statistics')?.checked || false,
            reports: document.getElementById('p-reports')?.checked || false,
            broadcast: document.getElementById('p-broadcast')?.checked || false,
            exams: document.getElementById('p-exams')?.checked || false,
            announcements: document.getElementById('p-announcements')?.checked || false,
            grades: document.getElementById('p-grades')?.checked || false,
            // صلاحيات خطرة
            bannedUsers: document.getElementById('p-bannedUsers')?.checked || false,
            deleteUsers: document.getElementById('p-deleteUsers')?.checked || false,
            devices: document.getElementById('p-devices')?.checked || false,
            loginLogs: document.getElementById('p-loginLogs')?.checked || false,
            superAdmin: document.getElementById('p-superAdmin')?.checked || false
        };

        const scope = {
            collegeId: document.getElementById('scope-college').value,
            departmentId: document.getElementById('scope-dept').value
        };

        const btn = document.getElementById('save-admin-btn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        btn.disabled = true;

        try {
            await setDoc(doc(db, "admins", email), {
                email,
                role,
                level: config.level,
                allowedSections,
                permissions,
                scope,
                addedBy: auth.currentUser.email,
                addedAt: new Date(),
                updatedAt: new Date()
            }, { merge: true });

            await logAdminAction('update_admin', '', email, `تحديث صلاحيات مشرف: ${email} (${role})`);

            // إرسال إشعار للمشرف الجديد (إذا كان جديداً أو تم تحديثه)
            window._notifyNewAdmin?.(email, role, permissions);

            alert("✅ تم تحديث بيانات المشرف بنجاح");
            resetAdminForm();
            loadAdminsList();
        } catch (e) {
            console.error(e);
            alert("خطأ أثناء الحفظ");
        } finally {
            btn.innerHTML = 'حفظ الصلاحيات';
            btn.disabled = false;
        }
    };

    document.getElementById('cancel-edit-admin').onclick = resetAdminForm;
};

// منطق اختيار المواد (Checkbox Logic)
const setupScopeSelectors = () => {
    const colSelect = document.getElementById('scope-college');
    const deptSelect = document.getElementById('scope-dept');

    colSelect.onchange = () => {
        const colId = colSelect.value;
        deptSelect.innerHTML = '<option value="">-- كل الأقسام --</option>';
        deptSelect.disabled = !colId;

        if (colId) {
            const col = UNIVERSITY_STRUCTURE.find(c => c.id === colId);
            if (col && col.departments) {
                col.departments.forEach(dept => {
                    deptSelect.innerHTML += `<option value="${dept.id}">${dept.name}</option>`;
                });
            }
        }
        renderScopeList();
    };

    deptSelect.onchange = renderScopeList;
};

const renderScopeList = () => {
    const colId = document.getElementById('scope-college').value;
    const deptId = document.getElementById('scope-dept').value;
    const checkboxesDiv = document.getElementById('scope-checkboxes');

    if (!colId) {
        checkboxesDiv.innerHTML = '<p class="text-center text-xs text-surface-400 py-4">يجب اختيار الكلية أولاً</p>';
        return;
    }

    let filtered = allSectionsCache.filter(s => s.collegeId === colId);
    if (deptId) filtered = filtered.filter(s => s.departmentId === deptId || s.departmentId === 'all');

    checkboxesDiv.innerHTML = '';
    if (filtered.length === 0) {
        checkboxesDiv.innerHTML = '<p class="text-center text-xs text-red-400 py-4 font-bold">لا توجد مواد مسجلة لهذا القسم.</p>';
        return;
    }

    filtered.forEach(sec => {
        const div = document.createElement('div');
        div.className = "flex items-center gap-3 p-3 bg-surface-50 dark:bg-surface-700/50 rounded-xl hover:bg-primary-50 transition cursor-pointer border border-transparent hover:border-primary-200 group";
        const isChecked = currentSelectedScopes.has(sec.id) ? 'checked' : '';

        div.innerHTML = `
            <input type="checkbox" id="chk-${sec.id}" ${isChecked} class="w-5 h-5 accent-primary-600 rounded cursor-pointer">
            <label for="chk-${sec.id}" class="flex-grow cursor-pointer dark:text-white font-bold text-xs select-none">
                ${sec.title} 
                <span class="block text-[10px] text-surface-400 font-normal mt-0.5">${sec.departmentId}</span>
            </label>
        `;

        div.onclick = (e) => {
            if (e.target.tagName !== 'INPUT') {
                const chk = div.querySelector('input');
                chk.checked = !chk.checked;
                if (chk.checked) currentSelectedScopes.add(sec.id); else currentSelectedScopes.delete(sec.id);
                renderSelectedTags();
            }
        };

        div.querySelector('input').onchange = (e) => {
            if (e.target.checked) currentSelectedScopes.add(sec.id); else currentSelectedScopes.delete(sec.id);
            renderSelectedTags();
        };

        checkboxesDiv.appendChild(div);
    });
};

const renderSelectedTags = () => {
    const container = document.getElementById('selected-scopes-tags');
    container.innerHTML = '';

    if (currentSelectedScopes.size === 0) {
        container.innerHTML = '<span class="text-xs text-surface-400 italic w-full text-center py-2">لم يتم تحديد مواد = مشرف عام (يملك كافة الصلاحيات على المحتوى)</span>';
        return;
    }

    currentSelectedScopes.forEach(id => {
        const sec = allSectionsCache.find(s => s.id === id);
        const tag = document.createElement('div');
        tag.className = "bg-primary-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-2 animate-fade-in shadow-sm";
        tag.innerHTML = `<span>${sec ? sec.title : id}</span><i class="fas fa-times cursor-pointer hover:text-red-300 transition"></i>`;

        tag.querySelector('i').onclick = () => {
            currentSelectedScopes.delete(id);
            renderSelectedTags();
            renderScopeList();
        };
        container.appendChild(tag);
    });
};

const loadAdminsList = async () => {
    const list = document.getElementById('admins-list');
    list.innerHTML = '<div class="text-center py-10"><i class="fas fa-circle-notch fa-spin text-2xl text-surface-400"></i></div>';

    const snap = await getDocs(collection(db, "admins"));
    list.innerHTML = '';

    snap.forEach(d => {
        const data = d.data();
        const count = data.allowedSections?.length || 0;
        const scopeStr = data.scope?.collegeId ? `${data.scope.collegeId} / ${data.scope.departmentId || 'all'}` : 'Global Scope';

        // تحديد بادج الرتبة
        const roleLabels = {
            'super_admin': { label: '⭐ Super Admin', class: 'role-badge-super' },
            'content_manager': { label: '📝 Content Manager', class: 'role-badge-manager' },
            'moderator': { label: '🛡️ Moderator', class: 'role-badge-moderator' },
            'viewer': { label: '👁️ Viewer', class: 'role-badge-viewer' }
        };
        const roleInfo = roleLabels[data.role] || { label: '📝 Manager', class: 'role-badge-manager' };

        // تحضير badges الصلاحيات
        const p = data.permissions || {};
        let permBadges = '';
        if (p.superAdmin) permBadges += '<span class="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded border border-red-200">👑 سوبر</span> ';
        if (p.cms) permBadges += '<span class="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">📝 محتوى</span> ';
        if (p.quiz) permBadges += '<span class="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200">🧩 كويز</span> ';
        if (p.users) permBadges += '<span class="text-[9px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded border border-primary-200">👥 طلاب</span> ';
        if (p.bannedUsers) permBadges += '<span class="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100">⛔ حظر</span> ';
        if (p.broadcast) permBadges += '<span class="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded border border-orange-200">🔔 إشعار</span> ';

        const div = document.createElement('div');
        div.className = "p-4 bg-surface-50 dark:bg-surface-700/30 rounded-2xl border dark:border-surface-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 group transition hover:border-primary-500 hover:bg-white dark:hover:bg-surface-800 hover:shadow-md";
        div.innerHTML = `
            <div class="text-right overflow-hidden flex-1">
                <div class="flex items-center gap-2 mb-2">
                    <p class="font-black dark:text-white text-sm truncate max-w-[200px] font-mono">${data.email}</p>
                    <span class="px-2 py-1 rounded-full text-[9px] font-bold ${roleInfo.class}">${roleInfo.label}</span>
                </div>
                <div class="flex flex-wrap gap-1 mb-2">
                    <span class="text-[9px] ${count > 0 ? 'bg-primary-100 text-primary-700' : 'bg-surface-100 text-surface-700'} px-2 py-0.5 rounded font-bold">
                        ${count > 0 ? `محدد: ${count} مادة` : 'كل المواد'}
                    </span>
                    <span class="text-[9px] bg-primary-50 text-primary-700 px-2 py-0.5 rounded font-bold">
                        ${scopeStr}
                    </span>
                    ${data.level ? `<span class="text-[9px] bg-surface-100 text-surface-600 px-2 py-0.5 rounded font-bold">Lv.${data.level}</span>` : ''}
                </div>
                <div class="flex flex-wrap gap-1 opacity-75">
                    ${permBadges || '<span class="text-[9px] text-surface-400">لا صلاحيات إضافية</span>'}
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="window.editAdminPermissions('${data.email}')" class="w-9 h-9 bg-primary-50 text-primary-600 rounded-xl shadow-sm hover:bg-primary-600 hover:text-white transition flex items-center justify-center" title="تعديل الصلاحيات">
                    <i class="fas fa-pen text-xs"></i>
                </button>
                <button onclick="window.deleteAdmin('${d.id}')" class="w-9 h-9 bg-red-50 text-red-600 rounded-xl shadow-sm hover:bg-red-600 hover:text-white transition flex items-center justify-center" title="حذف المشرف">
                    <i class="fas fa-trash text-xs"></i>
                </button>
            </div>`;
        list.appendChild(div);
    });
};

const resetAdminForm = () => {
    editingAdminEmail = null;
    document.getElementById('admin-form-title').innerHTML = '<i class="fas fa-user-plus text-primary-600"></i> إضافة مشرف جديد';
    document.getElementById('admin-email').value = '';
    document.getElementById('admin-email').disabled = false;
    currentSelectedScopes.clear();
    renderSelectedTags();
    document.getElementById('save-admin-btn').innerHTML = 'حفظ الصلاحيات';
    document.getElementById('cancel-edit-admin').classList.add('hidden');

    // تصفير كل الـ checkboxes
    const allCheckboxes = ['p-cms', 'p-quiz', 'p-users', 'p-support', 'p-idReview', 'p-statistics', 'p-reports', 'p-broadcast', 'p-exams', 'p-announcements', 'p-grades', 'p-bannedUsers', 'p-deleteUsers', 'p-devices', 'p-loginLogs', 'p-superAdmin'];
    allCheckboxes.forEach(id => {
        const cb = document.getElementById(id);
        if (cb) cb.checked = false;
    });
};

// ============================================================
// دوال عامة مربوطة بـ Window (Global Functions)
// ============================================================

// دالة التوثيق الداخلية (بدون confirm أو refresh)
const _verifyUserInternal = async (uid, status) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    const userData = userDoc.data() || {};
    const studentName = userData.fullName || userData.displayName || 'طالب';

    await updateDoc(doc(db, "users", uid), {
        isVerified: status,
        idCardRejected: false,
        idCardRejectionReason: null,
        displayName: userData.fullName || userData.displayName
    });

    // إرسال إشعار للطالب عند القبول
    if (status) {
        try {
            await addDoc(collection(db, "notifications"), {
                userId: uid,
                type: 'verification_approved',
                title: '🎉 تهانينا! تم توثيق حسابك',
                message: `مرحباً ${studentName}! تم قبول بياناتك وتوثيق حسابك بنجاح. يمكنك الآن الاستفادة من جميع ميزات المنصة.`,
                read: false,
                createdAt: serverTimestamp()
            });
        } catch (notifErr) {
            console.log('Notification error:', notifErr);
        }
    }
    return studentName;
};

// إزالة كارت من الواجهة بسلاسة
const _removeCardFromUI = (uid) => {
    const card = document.getElementById(`id-card-${uid}`);
    if (card) {
        card.style.transition = 'all 0.4s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.8)';
        setTimeout(() => card.remove(), 400);
    }
    // تحديث الأرقام
    const pendingStat = document.getElementById('stat-pending');
    const verifiedStat = document.getElementById('stat-verified');
    const tabPendingCount = document.getElementById('tab-pending-count');
    const tabVerifiedCount = document.getElementById('tab-verified-count');
    if (pendingStat) pendingStat.textContent = parseInt(pendingStat.textContent) - 1;
    if (verifiedStat) verifiedStat.textContent = parseInt(verifiedStat.textContent) + 1;
    if (tabPendingCount) tabPendingCount.textContent = parseInt(tabPendingCount.textContent) - 1;
    if (tabVerifiedCount) tabVerifiedCount.textContent = parseInt(tabVerifiedCount.textContent) + 1;
};

// توثيق طالب واحد (بدون refresh)
window.verifySingleUser = async (uid) => {
    if (!confirm('تأكيد قبول الكارنيه وتوثيق الطالب؟')) return;
    try {
        await _verifyUserInternal(uid, true);
        _removeCardFromUI(uid);
        await logAdminAction('verify_student', uid, '', 'توثيق طالب من مراجعة الكارنيهات');
        window.showToast?.('✅ تم توثيق الطالب', 'success');
        window.updateIdCardsBadge?.();
        window.updateBatchCount?.();
    } catch (e) {
        console.error(e);
        window.showToast?.('❌ حدث خطأ', 'error');
    }
};

// توثيق الطالب (الدالة القديمة - للتوافقية مع الاستخدام من مكان آخر)
window.verifyUser = async (uid, status) => {
    if (!confirm(status ? "تأكيد قبول الكارنيه وتوثيق الطالب؟" : "إلغاء توثيق الطالب؟")) return;
    try {
        await _verifyUserInternal(uid, status);
        alert(status ? "✅ تم توثيق الحساب." : "تم إلغاء التوثيق.");
        window.updateIdCardsBadge?.();
        if (document.getElementById('admin-view-title')?.textContent?.includes('الهويات')) {
            openIdReviewDashboard();
        } else {
            openUsersLogView();
        }
    } catch (e) {
        console.error(e);
        alert("حدث خطأ.");
    }
};

// إخفاء/حذف صورة بروفايل طالب معين (أدمن)
window.adminRemoveUserPhoto = async (uid, name) => {
    if (!confirm(`هل تريد إخفاء صورة البروفايل لـ "${name}"؟\nسيتم استبدالها بالصورة الافتراضية.`)) return;
    try {
        await updateDoc(doc(db, "users", uid), { photoURL: null });
        alert('✅ تم إخفاء صورة البروفايل.');
        // تحديث الصفحة لو كنا في البروفايل
        if (window.loadUserProfile) window.loadUserProfile(uid);
    } catch (e) {
        console.error(e);
        alert('حدث خطأ: ' + e.message);
    }
};

// ======= دوال العمليات الجماعية =======

// تحديث عداد المحددين
window.updateBatchCount = () => {
    const checked = document.querySelectorAll('.id-select-checkbox:checked');
    const btn = document.getElementById('batch-approve-btn');
    const text = document.getElementById('batch-approve-text');
    if (btn) btn.disabled = checked.length === 0;
    if (text) text.textContent = `قبول المحددين (${checked.length})`;
};

// تحديد/إلغاء تحديد الكل
window.toggleSelectAllIds = () => {
    const checkboxes = document.querySelectorAll('.id-select-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    window.updateBatchCount();
    const btn = document.getElementById('select-all-btn');
    if (btn) btn.innerHTML = allChecked ? '<i class="far fa-check-square"></i> تحديد الكل' : '<i class="fas fa-check-square"></i> إلغاء التحديد';
};

// قبول المحددين
window.batchVerifySelected = async () => {
    const checked = document.querySelectorAll('.id-select-checkbox:checked');
    if (checked.length === 0) return window.showToast?.('حدد طلاب أولاً', 'warning');
    if (!confirm(`تأكيد قبول وتوثيق ${checked.length} طالب؟`)) return;

    const btn = document.getElementById('batch-approve-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التوثيق...'; }

    let success = 0, fail = 0;
    for (const cb of checked) {
        try {
            await _verifyUserInternal(cb.dataset.uid, true);
            _removeCardFromUI(cb.dataset.uid);
            success++;
        } catch (e) {
            console.error('Batch verify error:', e);
            fail++;
        }
    }

    await logAdminAction('batch_verify', '', '', `توثيق جماعي: ${success} نجاح، ${fail} فشل`);
    window.showToast?.(`✅ تم توثيق ${success} طالب${fail > 0 ? ` | ❌ فشل ${fail}` : ''}`, success > 0 ? 'success' : 'error');
    window.updateIdCardsBadge?.();
    window.updateBatchCount?.();
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-double"></i> <span id="batch-approve-text">قبول المحددين (0)</span>'; }
};

// قبول الكل دفعة واحدة
window.batchVerifyAll = async () => {
    const allCheckboxes = document.querySelectorAll('.id-select-checkbox');
    const totalCount = allCheckboxes.length;
    if (totalCount === 0) return window.showToast?.('لا يوجد طلبات معلقة', 'info');
    if (!confirm(`⚠️ تأكيد قبول وتوثيق جميع الطلاب (${totalCount}) دفعة واحدة؟\n\nتأكد أنك راجعت كل الكارنيهات!`)) return;

    // عرض شريط التقدم
    const progressDiv = document.createElement('div');
    progressDiv.id = 'batch-progress';
    progressDiv.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-white dark:bg-surface-800 shadow-2xl rounded-2xl p-6 w-[90%] max-w-md border-2 border-accent-500';
    progressDiv.innerHTML = `
        <h3 class="font-black text-lg mb-3 dark:text-white">⏳ جاري التوثيق...</h3>
        <div class="bg-surface-200 dark:bg-surface-700 rounded-full h-4 mb-2 overflow-hidden">
            <div id="batch-progress-bar" class="bg-gradient-to-r from-accent-500 to-accent-500 h-full rounded-full transition-all duration-300" style="width: 0%"></div>
        </div>
        <p id="batch-progress-text" class="text-sm text-surface-500 font-bold">0 / ${totalCount}</p>
    `;
    document.body.appendChild(progressDiv);

    let success = 0, fail = 0;
    const uids = Array.from(allCheckboxes).map(cb => cb.dataset.uid);

    for (let i = 0; i < uids.length; i++) {
        try {
            await _verifyUserInternal(uids[i], true);
            _removeCardFromUI(uids[i]);
            success++;
        } catch (e) {
            console.error('Batch verify error:', e);
            fail++;
        }
        // تحديث شريط التقدم
        const pct = Math.round(((i + 1) / uids.length) * 100);
        const bar = document.getElementById('batch-progress-bar');
        const txt = document.getElementById('batch-progress-text');
        if (bar) bar.style.width = pct + '%';
        if (txt) txt.textContent = `${i + 1} / ${uids.length}`;
    }

    // إزالة شريط التقدم
    setTimeout(() => document.getElementById('batch-progress')?.remove(), 2000);
    window.showToast?.(`✅ تم توثيق ${success} طالب${fail > 0 ? ` | ❌ فشل ${fail}` : ''} 🎉`, 'success');
    window.updateIdCardsBadge?.();
};

// رفض الكارنيه مع سبب الرفض
window.rejectIdCard = async (uid, userName) => {
    const reason = prompt(`سبب رفض كارنيه "${userName}":\n\nأمثلة:\n- الصورة غير واضحة\n- الكارنيه منتهي الصلاحية\n- الاسم غير مطابق للحساب\n- صورة غير صالحة`);

    if (!reason || reason.trim() === '') {
        return alert("يجب إدخال سبب الرفض");
    }

    if (!confirm(`تأكيد رفض الكارنيه بسبب:\n"${reason}"\n\nسيتم حذف الصورة وطلب رفع جديدة من الطالب.`)) return;

    try {
        await updateDoc(doc(db, "users", uid), {
            isVerified: false,
            idCardRejected: true,
            idCardRejectionReason: reason.trim(),
            idCardRejectedAt: new Date(),
            idCardImage: null // حذف الصورة المرفوضة
        });

        // إرسال إشعار للطالب
        try {
            await addDoc(collection(db, "notifications"), {
                userId: uid,
                message: `❌ تم رفض صورة الكارنيه: ${reason.trim()}`,
                link: '#profile',
                read: false,
                createdAt: new Date()
            });
        } catch (e) { console.warn("Notification error:", e); }

        await logAdminAction('reject_id_card', uid, userName, `رفض كارنيه: ${reason.trim()}`);
        alert("✅ تم رفض الكارنيه وإخطار الطالب.");

        // تحديث عداد الكارنيهات المعلقة
        window.updateIdCardsBadge?.();

        if (document.getElementById('admin-view-title').textContent.includes('الهويات')) {
            openIdReviewDashboard();
        } else {
            openUsersLogView();
        }
    } catch (e) {
        console.error(e);
        alert("حدث خطأ: " + e.message);
    }
};

window.editUserName = async (uid, oldName) => {
    const newName = prompt(`تعديل اسم الطالب (${oldName}):`, oldName);
    if (newName && newName !== oldName) {
        if (confirm(`هل أنت متأكد من تغيير الاسم إلى "${newName}"؟`)) {
            try {
                await updateDoc(doc(db, "users", uid), { displayName: newName });
                await logAdminAction('edit_name', uid, oldName, `تغيير الاسم: ${oldName} → ${newName}`);
                alert("✅ تم التعديل.");
                openUsersLogView();
            } catch (e) { console.error(e); alert("خطأ."); }
        }
    }
};

window.togglePlatformBan = async (uid, isBanned) => {
    // تأكد من أن isBanned قيمة boolean صحيحة
    const currentlyBanned = isBanned === true || isBanned === 'true';

    if (confirm(currentlyBanned ? "فك الحظر عن هذا الطالب؟" : "⛔ حظر الطالب نهائياً ومنعه من الدخول؟")) {
        try {
            await updateDoc(doc(db, "users", uid), {
                isBannedFromPlatform: !currentlyBanned,
                bannedAt: !currentlyBanned ? new Date() : null,
                bannedBy: !currentlyBanned ? auth.currentUser.email : null
            });
            await logAdminAction(currentlyBanned ? 'unban_user' : 'ban_user', uid, '', currentlyBanned ? 'فك حظر' : 'حظر نهائي');
            alert(currentlyBanned ? "✅ تم فك الحظر." : "⛔ تم الحظر.");
            window.showToast?.(currentlyBanned ? "✅ تم فك الحظر" : "⛔ تم الحظر", currentlyBanned ? "success" : "warning");
            // تحديث الواجهة المناسبة
            if (document.getElementById('admin-view-title').textContent.includes('الهويات')) {
                openIdReviewDashboard();
            } else {
                openUsersLogView();
            }
        } catch (e) {
            console.error("Ban Error:", e);
            alert("خطأ: " + e.message);
        }
    }
};

// ============================================================
// حذف وتعديل الأدمن
// ============================================================
window.deleteAdmin = async (email) => {
    // حماية المالك
    if (email === SUPER_ADMIN_EMAIL) {
        return alert('⛔ لا يمكن حذف مالك المنصة!');
    }

    if (!confirm(`هل أنت متأكد من حذف المشرف "${email}"؟`)) return;

    try {
        await deleteDoc(doc(db, "admins", email));
        await logAdminAction('delete_admin', '', email, `حذف مشرف: ${email}`);
        window.showToast?.('✅ تم حذف المشرف', 'success');
        loadAdminsList();
    } catch (e) {
        console.error(e);
        alert('خطأ: ' + e.message);
    }
};

window.startEditAdmin = (email, allowedSectionsStr, permissionsStr, scopeStr, role) => {
    // حماية المالك
    if (email === SUPER_ADMIN_EMAIL) {
        return alert('⛔ لا يمكن تعديل صلاحيات مالك المنصة!');
    }

    editingAdminEmail = email;
    document.getElementById('admin-form-title').innerHTML = '<i class="fas fa-pen text-yellow-500"></i> تعديل مشرف';
    document.getElementById('admin-email').value = email;
    document.getElementById('admin-email').disabled = true;
    document.getElementById('admin-role').value = role;
    document.getElementById('cancel-edit-admin').classList.remove('hidden');

    // استعادة الصلاحيات
    try {
        const permissions = JSON.parse(decodeURIComponent(permissionsStr));
        document.getElementById('p-cms').checked = permissions.cms || false;
        document.getElementById('p-quiz').checked = permissions.quiz || false;
        document.getElementById('p-users').checked = permissions.users || false;
        document.getElementById('p-support').checked = permissions.support || false;
    } catch (e) { }

    // استعادة المواد المحددة
    try {
        currentSelectedScopes.clear();
        const sections = JSON.parse(decodeURIComponent(allowedSectionsStr));
        sections.forEach(s => currentSelectedScopes.add(s));
        renderSelectedTags();
    } catch (e) { }

    // استعادة النطاق
    try {
        const scope = JSON.parse(decodeURIComponent(scopeStr));
        document.getElementById('scope-college').value = scope.collegeId || '';
        document.getElementById('scope-dept').value = scope.departmentId || '';
    } catch (e) { }
};

window.exportToExcel = () => {
    if (!window.lastScoresData || window.lastScoresData.length === 0) return alert("⚠️ لا توجد بيانات متاحة في الجدول للتصدير.");

    let csvContent = "\uFEFF";
    csvContent += "اسم الطالب,الكلية,القسم,عنوان النشاط,المادة,الدرجة,التاريخ\n";

    window.lastScoresData.forEach(row => {
        const date = row.date?.toDate ? row.date.toDate().toLocaleDateString('ar-EG') : '-';
        const cleanName = (row.userName || 'غير معروف').replace(/,/g, " ");
        const cleanTitle = (row.quizTitle || '').replace(/,/g, " ");

        csvContent += `${cleanName},${row.collegeId || '-'},${row.departmentId || 'all'},${cleanTitle},${row.sectionTitle},${row.score},${date}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Masar_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
};

window.openAnnouncementControl = async () => {
    const currentSnap = await getDoc(doc(db, "system", "announcement"));
    const current = currentSnap.exists() ? currentSnap.data() : {};

    // إنشاء قائمة الكليات والأقسام
    const collegesWithDepts = UNIVERSITY_STRUCTURE.map(c => `
        <div class="college-group bg-white/10 rounded-xl p-3 mb-2">
            <label class="flex items-center gap-2 cursor-pointer font-bold mb-2">
                <input type="checkbox" name="ann-target-college" value="${c.id}" class="w-4 h-4 accent-orange-500 ann-college-checkbox" data-college="${c.id}">
                <span class="text-sm">🎓 ${c.name}</span>
                <span class="text-xs opacity-50 mr-auto">(${c.departments.length} قسم)</span>
            </label>
            <div class="departments-list hidden pr-6 space-y-1" id="ann-depts-${c.id}">
                <label class="flex items-center gap-2 cursor-pointer text-xs opacity-80 hover:opacity-100">
                    <input type="checkbox" name="ann-target-dept-${c.id}" value="all" class="w-3 h-3 accent-accent-500" checked>
                    <span>✓ كل الأقسام</span>
                </label>
                ${c.departments.map(d => `
                    <label class="flex items-center gap-2 cursor-pointer text-xs opacity-80 hover:opacity-100">
                        <input type="checkbox" name="ann-target-dept-${c.id}" value="${d.id}" class="w-3 h-3 accent-primary-500 ann-dept-checkbox">
                        <span>${d.name}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');

    // إنشاء Modal
    let modal = document.getElementById('announcement-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'announcement-modal';
    modal.className = 'fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 w-full max-w-2xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl animate-scale-in flex flex-col">
            <div class="bg-gradient-to-r from-orange-500 to-red-500 text-white p-6 flex justify-between items-center flex-shrink-0">
                <div class="flex items-center gap-3">
                    <i class="fas fa-bullhorn text-3xl"></i>
                    <div>
                        <h3 class="font-black text-xl">إدارة الإعلانات</h3>
                        <p class="text-sm opacity-80">إنشاء إعلان موجه للطلاب</p>
                    </div>
                </div>
                <button onclick="document.getElementById('announcement-modal').remove()" class="hover:bg-white/20 p-2 rounded-full transition"><i class="fas fa-times text-xl"></i></button>
            </div>
            
            <div class="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                <!-- نوع الإعلان -->
                <div>
                    <label class="block text-sm font-bold mb-2 dark:text-surface-300">نوع الإعلان:</label>
                    <div class="grid grid-cols-4 gap-2">
                        <label class="cursor-pointer">
                            <input type="radio" name="ann-type" value="info" class="hidden peer" ${current.type === 'info' || !current.type ? 'checked' : ''}>
                            <div class="peer-checked:ring-4 peer-checked:ring-primary-500 peer-checked:scale-105 p-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-500 text-white text-center transition-all">
                                <i class="fas fa-info-circle text-xl mb-1 block"></i>
                                <span class="text-xs">عام</span>
                            </div>
                        </label>
                        <label class="cursor-pointer">
                            <input type="radio" name="ann-type" value="warning" class="hidden peer" ${current.type === 'warning' ? 'checked' : ''}>
                            <div class="peer-checked:ring-4 peer-checked:ring-amber-500 peer-checked:scale-105 p-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-center transition-all">
                                <i class="fas fa-exclamation-triangle text-xl mb-1 block"></i>
                                <span class="text-xs">تحذير</span>
                            </div>
                        </label>
                        <label class="cursor-pointer">
                            <input type="radio" name="ann-type" value="success" class="hidden peer" ${current.type === 'success' ? 'checked' : ''}>
                            <div class="peer-checked:ring-4 peer-checked:ring-accent-500 peer-checked:scale-105 p-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent-500 text-white text-center transition-all">
                                <i class="fas fa-check-circle text-xl mb-1 block"></i>
                                <span class="text-xs">نجاح</span>
                            </div>
                        </label>
                        <label class="cursor-pointer">
                            <input type="radio" name="ann-type" value="danger" class="hidden peer" ${current.type === 'danger' ? 'checked' : ''}>
                            <div class="peer-checked:ring-4 peer-checked:ring-red-500 peer-checked:scale-105 p-3 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white text-center transition-all">
                                <i class="fas fa-exclamation-circle text-xl mb-1 block"></i>
                                <span class="text-xs">مهم</span>
                            </div>
                        </label>
                    </div>
                </div>

                <!-- العنوان -->
                <div>
                    <label class="block text-sm font-bold mb-2 dark:text-surface-300">عنوان الإعلان (اختياري):</label>
                    <input type="text" id="ann-title" value="${current.title || ''}" placeholder="مثال: تنبيه هام من الإدارة" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white dark:border-surface-600 outline-none focus:ring-2 focus:ring-orange-500">
                </div>

                <!-- النص -->
                <div>
                    <label class="block text-sm font-bold mb-2 dark:text-surface-300">نص الإعلان: <span class="text-red-500">*</span></label>
                    <textarea id="ann-text" rows="3" placeholder="اكتب نص الإعلان هنا..." class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white dark:border-surface-600 outline-none focus:ring-2 focus:ring-orange-500">${current.text || ''}</textarea>
                </div>

                <!-- الرابط -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-bold mb-2 dark:text-surface-300">رابط (اختياري):</label>
                        <input type="url" id="ann-link" value="${current.link || ''}" placeholder="https://..." class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white dark:border-surface-600 outline-none focus:ring-2 focus:ring-orange-500">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-2 dark:text-surface-300">نص الرابط:</label>
                        <input type="text" id="ann-link-text" value="${current.linkText || ''}" placeholder="اعرف المزيد" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white dark:border-surface-600 outline-none focus:ring-2 focus:ring-orange-500">
                    </div>
                </div>

                <!-- الاستهداف -->
                <div class="bg-surface-50 dark:bg-surface-700/50 p-4 rounded-2xl">
                    <label class="block text-sm font-bold mb-3 dark:text-surface-300">🎯 استهداف الإعلان:</label>
                    
                    <label class="flex items-center gap-3 cursor-pointer mb-4 p-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-bold">
                        <input type="checkbox" id="ann-target-all" class="w-5 h-5 accent-white" ${current.targetAll !== false ? 'checked' : ''}>
                        <span>🌍 عرض للمنصة كلها</span>
                    </label>

                    <div id="ann-colleges-selection" class="${current.targetAll !== false ? 'hidden' : ''}">
                        <p class="text-xs text-surface-500 dark:text-surface-400 mb-2">أو اختر كليات/أقسام محددة:</p>
                        <div class="max-h-48 overflow-y-auto custom-scrollbar bg-surface-100 dark:bg-surface-700 rounded-xl p-2">
                            ${collegesWithDepts}
                        </div>
                    </div>
                </div>
            </div>

            <!-- الأزرار -->
            <div class="p-6 bg-surface-50 dark:bg-surface-700/50 flex gap-3 flex-shrink-0">
                <button id="ann-save-btn" class="flex-1 bg-gradient-to-r from-orange-500 to-red-500 text-white py-3 rounded-xl font-black hover:opacity-90 transition flex items-center justify-center gap-2">
                    <i class="fas fa-paper-plane"></i> نشر الإعلان
                </button>
                <button id="ann-hide-btn" class="px-6 bg-surface-200 dark:bg-surface-600 text-surface-700 dark:text-white py-3 rounded-xl font-bold hover:bg-surface-300 transition">
                    <i class="fas fa-eye-slash"></i> إخفاء
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Toggle colleges selection visibility
    document.getElementById('ann-target-all').onchange = (e) => {
        document.getElementById('ann-colleges-selection').classList.toggle('hidden', e.target.checked);
    };

    // Toggle department lists
    document.querySelectorAll('.ann-college-checkbox').forEach(cb => {
        cb.onchange = () => {
            const collegeId = cb.dataset.college;
            const deptsDiv = document.getElementById(`ann-depts-${collegeId}`);
            if (deptsDiv) deptsDiv.classList.toggle('hidden', !cb.checked);
        };
    });

    // Set current targets if editing
    if (current.targets && !current.targetAll) {
        current.targets.forEach(t => {
            const colCb = document.querySelector(`.ann-college-checkbox[value="${t.collegeId}"]`);
            if (colCb) {
                colCb.checked = true;
                colCb.dispatchEvent(new Event('change'));
                if (t.departmentId !== 'all') {
                    const deptCb = document.querySelector(`input[name="ann-target-dept-${t.collegeId}"][value="${t.departmentId}"]`);
                    if (deptCb) deptCb.checked = true;
                }
            }
        });
    }

    // Save button
    document.getElementById('ann-save-btn').onclick = async () => {
        const text = document.getElementById('ann-text').value.trim();
        if (!text) return alert('يرجى كتابة نص الإعلان');

        const type = document.querySelector('input[name="ann-type"]:checked')?.value || 'info';
        const title = document.getElementById('ann-title').value.trim();
        const link = document.getElementById('ann-link').value.trim();
        const linkText = document.getElementById('ann-link-text').value.trim();
        const targetAll = document.getElementById('ann-target-all').checked;

        let targets = [];
        if (!targetAll) {
            document.querySelectorAll('.ann-college-checkbox:checked').forEach(cb => {
                const collegeId = cb.value;
                const deptCheckboxes = document.querySelectorAll(`input[name="ann-target-dept-${collegeId}"]:checked`);
                deptCheckboxes.forEach(dCb => {
                    targets.push({ collegeId, departmentId: dCb.value });
                });
            });
            if (targets.length === 0) {
                return alert('يرجى اختيار كلية واحدة على الأقل');
            }
        }

        try {
            await setDoc(doc(db, "system", "announcement"), {
                isActive: true,
                type,
                title,
                text,
                link,
                linkText,
                targetAll,
                targets,
                updatedAt: new Date(),
                id: Date.now().toString()
            });
            window.showToast?.('✅ تم نشر الإعلان بنجاح', 'success');
            modal.remove();
        } catch (e) {
            console.error(e);
            alert('خطأ: ' + e.message);
        }
    };

    // Hide button
    document.getElementById('ann-hide-btn').onclick = async () => {
        if (confirm('هل تريد إخفاء الإعلان الحالي؟')) {
            await setDoc(doc(db, "system", "announcement"), { isActive: false, text: "" });
            window.showToast?.('تم إخفاء الإعلان', 'success');
            modal.remove();
        }
    };
};

window.deleteAdmin = async (id) => {
    // فقط المالك يستطيع حذف الأدمن
    if (auth.currentUser.email !== SUPER_ADMIN_EMAIL) {
        return alert("⛔ عذراً، فقط مالك المنصة يمكنه حذف المشرفين");
    }

    // لا يمكن حذف نفسك
    if (id === auth.currentUser.email) {
        return alert("⚠️ لا يمكنك حذف نفسك!");
    }

    if (confirm("⛔ هل أنت متأكد من حذف هذا المشرف؟ سيفقد جميع صلاحياته.")) {
        try {
            await deleteDoc(doc(db, "admins", id));
            window.showToast?.("تم حذف المشرف بنجاح", "success");
            openAdminManagementView();
        } catch (e) {
            console.error(e);
            alert("خطأ: " + e.message);
        }
    }
};

window.startEditAdmin = (email, allowedSectionsStr, permissionsStr, scopeStr) => {
    try {
        const allowedSections = JSON.parse(decodeURIComponent(allowedSectionsStr));
        const permissions = JSON.parse(decodeURIComponent(permissionsStr));
        const scope = JSON.parse(decodeURIComponent(scopeStr));

        editingAdminEmail = email;
        document.getElementById('admin-form-title').innerHTML = `<i class="fas fa-edit text-orange-500"></i> تعديل: <span class="text-surface-500 font-mono text-lg">${email}</span>`;
        document.getElementById('admin-email').value = email;
        document.getElementById('admin-email').disabled = true;

        currentSelectedScopes = new Set(allowedSections || []);
        renderSelectedTags();

        if (permissions) {
            document.getElementById('p-cms').checked = permissions.cms;
            document.getElementById('p-quiz').checked = permissions.quiz;
            document.getElementById('p-users').checked = permissions.users;
            document.getElementById('p-support').checked = permissions.support || false;
        }

        if (scope && scope.collegeId) {
            document.getElementById('scope-college').value = scope.collegeId;
            // Trigger change to load departments
            const event = new Event('change');
            document.getElementById('scope-college').dispatchEvent(event);
            setTimeout(() => {
                document.getElementById('scope-dept').value = scope.departmentId || '';
            }, 100);
        }

        document.getElementById('save-admin-btn').innerHTML = 'تحديث البيانات';
        document.getElementById('cancel-edit-admin').classList.remove('hidden');

        document.getElementById('admin-settings-section').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { console.error(e); }
};

window.openBonusModal = async (userId, userName) => {
    const modal = document.getElementById('bonus-modal');
    document.getElementById('bonus-user-id').value = userId;
    document.getElementById('bonus-user-name').value = userName;
    document.getElementById('bonus-amount').value = '';
    document.getElementById('bonus-reason').value = '';

    modal.classList.remove('hidden');

    const select = document.getElementById('bonus-subject-select');
    select.innerHTML = '<option value="">جاري التحميل...</option>';

    try {
        const sectionsSnap = await getDocs(collection(db, "study_sections"));
        select.innerHTML = '<option value="">-- اختر المادة --</option>';
        sectionsSnap.forEach(doc => {
            select.innerHTML += `<option value="${doc.id}">${doc.data().title}</option>`;
        });
        select.innerHTML += `<option value="general">🌟 نشاط عام (بدون مادة)</option>`;
    } catch (e) { console.error(e); }

    document.getElementById('confirm-bonus-btn').onclick = async () => {
        const sectionId = select.value;
        const amount = parseInt(document.getElementById('bonus-amount').value);
        const reason = document.getElementById('bonus-reason').value;
        const sectionTitle = select.options[select.selectedIndex].text;

        if (!sectionId || isNaN(amount) || !reason) return alert("البيانات ناقصة");

        try {
            await addDoc(collection(db, "user_scores"), {
                userId, userName,
                quizTitle: `🎁 بونص: ${reason}`,
                quizId: 'manual_bonus',
                score: amount,
                total: 0,
                sectionId, sectionTitle,
                date: new Date(), type: 'manual'
            });
            await sendNotification(userId, `🎉 مبروك! حصلت على ${amount} درجات بونص بسبب: ${reason}`, 'scores');
            await logAdminAction('give_bonus', userId, userName, `بونص فردي: ${amount} درجة لـ ${userName} — ${reason}`);
            alert("✅ تم إضافة البونص وإشعار الطالب.");
            modal.classList.add('hidden');
        } catch (e) { alert("خطأ: " + e.message); }
    };
};

window.openBadgeManager = async (userId) => {
    const modal = document.getElementById('badges-modal');
    modal.classList.remove('hidden');
    const listContent = document.getElementById('badges-list-content');
    listContent.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner fa-spin text-primary-600"></i></div>';

    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);
    let badges = snap.data().badges || [];

    const render = () => {
        if (badges.length === 0) listContent.innerHTML = '<p class="text-center text-sm text-surface-400 py-4">لا توجد أوسمة لهذا الطالب.</p>';
        else {
            listContent.innerHTML = badges.map((b, i) => `
                <div class="flex justify-between items-center p-3 bg-surface-50 dark:bg-surface-700 rounded-xl mb-2 border dark:border-surface-600 animate-fade-in">
                    <span class="text-lg flex items-center gap-2">${b.icon} <b class="text-sm dark:text-white">${b.title}</b></span>
                    <button onclick="window.delBadge('${userId}', ${i})" class="text-red-500 hover:bg-red-50 p-2 rounded-lg transition"><i class="fas fa-trash"></i></button>
                </div>`).join('');
        }
    };
    render();

    document.getElementById('add-badge-confirm').onclick = async () => {
        const icon = document.getElementById('new-badge-icon').value;
        const title = document.getElementById('new-badge-title').value;
        if (icon && title) {
            badges.push({ icon, title });
            await updateDoc(userRef, { badges });
            await sendNotification(userId, `🏆 تهانينا! حصلت على وسام جديد: ${icon} ${title}`, 'profile');
            render();
            document.getElementById('new-badge-icon').value = '';
            document.getElementById('new-badge-title').value = '';
            openUsersLogView();
        }
    };
    window.delBadge = async (uid, idx) => {
        if (confirm("حذف هذا الوسام؟")) {
            badges.splice(idx, 1);
            await updateDoc(userRef, { badges });
            render();
            openUsersLogView();
        }
    };
};

window.changeStudentCollege = async (userId, userName) => {
    const newCol = prompt(`نقل الطالب (${userName})\nأدخل كود الكلية الجديد (مثال: engineering):`); if (!newCol) return;
    const newDept = prompt(`أدخل كود القسم الجديد (مثال: civil):`); if (!newDept) return;

    if (confirm(`⚠️ تأكيد نقل الطالب؟\nالكلية: ${newCol}\nالقسم: ${newDept}`)) {
        await updateDoc(doc(db, "users", userId), { collegeId: newCol, departmentId: newDept });
        alert("✅ تم نقل الطالب بنجاح.");
        openUsersLogView();
    }
};

window.toggleChatBan = async (uid, cur) => {
    if (confirm(cur ? "فك حظر الشات عن هذا الطالب؟" : "منع هذا الطالب من استخدام الشات العام؟")) {
        await updateDoc(doc(db, "users", uid), { isChatBanned: !cur });
        await logAdminAction(cur ? 'unban_chat' : 'ban_chat', uid, '', cur ? 'فك حظر شات' : 'حظر شات');
        openUsersLogView();
    }
};

window.sendUrgentAlert = async () => {
    // إنشاء modal عصري بدل prompt
    let modal = document.getElementById('urgent-alert-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'urgent-alert-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-[350] flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-scale-in">
            <div class="bg-gradient-to-r from-red-600 to-rose-600 text-white p-5 flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <i class="fas fa-bullhorn text-xl"></i>
                    </div>
                    <div>
                        <h3 class="font-black text-lg">تنبيه عام عاجل</h3>
                        <p class="text-xs opacity-80">سيظهر لجميع المتصلين فوراً</p>
                    </div>
                </div>
                <button onclick="document.getElementById('urgent-alert-modal').remove()" class="hover:bg-white/20 p-2 rounded-full transition"><i class="fas fa-times"></i></button>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-xs font-bold mb-2 dark:text-surface-300 uppercase tracking-wide">نوع التنبيه:</label>
                    <div class="grid grid-cols-3 gap-2">
                        <label class="cursor-pointer">
                            <input type="radio" name="urgent-type" value="info" class="hidden peer" checked>
                            <div class="peer-checked:ring-2 peer-checked:ring-primary-500 peer-checked:bg-primary-50 dark:peer-checked:bg-primary-900/30 p-3 rounded-xl text-center transition border dark:border-surface-700">
                                <i class="fas fa-info-circle text-primary-500 text-lg mb-1 block"></i>
                                <span class="text-xs font-bold dark:text-surface-300">عام</span>
                            </div>
                        </label>
                        <label class="cursor-pointer">
                            <input type="radio" name="urgent-type" value="warning" class="hidden peer">
                            <div class="peer-checked:ring-2 peer-checked:ring-amber-500 peer-checked:bg-amber-50 dark:peer-checked:bg-amber-900/30 p-3 rounded-xl text-center transition border dark:border-surface-700">
                                <i class="fas fa-exclamation-triangle text-amber-500 text-lg mb-1 block"></i>
                                <span class="text-xs font-bold dark:text-surface-300">تحذير</span>
                            </div>
                        </label>
                        <label class="cursor-pointer">
                            <input type="radio" name="urgent-type" value="danger" class="hidden peer">
                            <div class="peer-checked:ring-2 peer-checked:ring-red-500 peer-checked:bg-red-50 dark:peer-checked:bg-red-900/30 p-3 rounded-xl text-center transition border dark:border-surface-700">
                                <i class="fas fa-exclamation-circle text-red-500 text-lg mb-1 block"></i>
                                <span class="text-xs font-bold dark:text-surface-300">عاجل</span>
                            </div>
                        </label>
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold mb-2 dark:text-surface-300 uppercase tracking-wide">نص التنبيه: <span class="text-red-500">*</span></label>
                    <textarea id="urgent-alert-text" rows="3" placeholder="اكتب نص التنبيه العاجل هنا..." class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white dark:border-surface-600 outline-none focus:ring-2 focus:ring-red-500 text-sm"></textarea>
                </div>
                <button id="send-urgent-btn" class="w-full bg-red-600 text-white py-3 rounded-xl font-black hover:bg-red-700 transition flex items-center justify-center gap-2 shadow-lg shadow-red-500/30">
                    <i class="fas fa-paper-plane"></i> إرسال التنبيه الآن
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    document.getElementById('send-urgent-btn').onclick = async () => {
        const text = document.getElementById('urgent-alert-text').value.trim();
        if (!text) return window.showToast?.('يرجى كتابة نص التنبيه', 'error');
        const type = document.querySelector('input[name="urgent-type"]:checked')?.value || 'info';
        const btn = document.getElementById('send-urgent-btn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
        btn.disabled = true;
        try {
            await setDoc(doc(db, "system", "urgent_alert"), { message: text, type, createdAt: new Date() });
            window.showToast?.('✅ تم إرسال التنبيه العاجل', 'success');
            modal.remove();
        } catch (e) {
            window.showToast?.('فشل إرسال التنبيه', 'error');
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال التنبيه الآن';
            btn.disabled = false;
        }
    };
};

window.copyAllEmails = async () => {
    const s = await getDocs(collection(db, "users"));
    let emails = []; s.forEach(d => { if (d.data().email) emails.push(d.data().email); });
    navigator.clipboard.writeText(emails.join(', '));
    alert(`📋 تم نسخ ${emails.length} عنوان بريد إلكتروني للحافظة.`);
};

window.resetLeaderboard = async () => {
    const confirmation = prompt("⚠️ تحذير خطير!\nسيتم حذف جميع الدرجات والأنشطة لجميع الطلاب.\nللتأكيد اكتب: 'تصفير الكل'");
    if (confirmation === 'تصفير الكل') {
        const s = await getDocs(collection(db, "user_scores"));
        const b = writeBatch(db);
        s.forEach(d => b.delete(d.ref));
        await b.commit();
        await logAdminAction('reset_leaderboard', '', '', `تصفير جميع النتائج (${s.size} مستند)`);
        alert("🗑️ تم تصفير جميع النتائج بنجاح.");
    }
};

window.giveGlobalBonus = async () => {
    const amount = prompt("كم درجة تريد إضافتها للجميع؟"); if (!amount) return;
    const reason = prompt("ما هو سبب البونص؟ (سيظهر للطلاب)"); if (!reason) return;

    if (confirm(`تأكيد إضافة ${amount} درجة لجميع مستخدمي المنصة؟`)) {
        const s = await getDocs(collection(db, "users"));
        const b = writeBatch(db);
        s.forEach(d => {
            const scoreRef = doc(collection(db, "user_scores"));
            b.set(scoreRef, {
                userId: d.id,
                userName: d.data().displayName,
                quizTitle: `🎁 مكافأة جماعية: ${reason}`,
                score: parseInt(amount),
                date: new Date(),
                type: 'manual',
                sectionTitle: 'إدارة المنصة'
            });
        });
        await b.commit();
        await logAdminAction('global_bonus', '', '', `بونص جماعي: ${amount} درجة لـ ${s.size} طالب — السبب: ${reason}`);
        alert("✅ تمت العملية بنجاح.");
    }
};

// ============================================================
// تصفير جميع الكارنيهات لإجبار المرفوعين مجدداً
// ============================================================
window.resetAllIdCards = async (btn) => {
    const confirmation = prompt("⚠️ تحذير!\nهل أنت متأكد من تصفير الكارنيهات لجميع الطلاب؟\nسيتم إجبار الجميع على إعادة رفع صور الهوية.\nللتأكيد اكتب: 'تصفير'");
    if (confirmation !== "تصفير") {
        alert("تم الإلغاء.");
        return;
    }

    const oldText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التصفير...';
    btn.disabled = true;

    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const batch = writeBatch(db);
        let count = 0;
        
        usersSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.email === SUPER_ADMIN_EMAIL) return; // استثناء المالك
            
            batch.update(docSnap.ref, {
                idCardImage: null,
                idCardRejected: false,
                idCardRejectionReason: null,
                isVerified: false
            });
            count++;
        });

        if (count > 0) {
            await batch.commit();
            alert(`✅ تم حذف بيانات الكارنيهات لـ ${count} طالب/ة.`);
            window.refreshUsersList?.();
        } else {
            alert("لا يوجد طلاب مسجلون.");
        }
    } catch (error) {
        console.error("Error resetting ID cards:", error);
        alert("حدث خطأ أثناء محاولة تصفير الكارنيهات: " + error.message);
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
};

// ============================================================
// حذف صور البروفايل المرفوعة يدوياً فقط (بدون المساس بصور جوجل)
// ============================================================
window.resetAllProfilePhotos = async (btn) => {
    const confirmation = prompt("⚠️ تحذير!\nسيتم حذف صور البروفايل المرفوعة يدوياً فقط.\nصور حسابات جوجل الأصلية لن تتأثر.\nللتأكيد اكتب: 'حذف الصور'");
    if (confirmation !== "حذف الصور") {
        alert("تم الإلغاء.");
        return;
    }

    const oldText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحذف...';
    btn.disabled = true;

    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const batch = writeBatch(db);
        let count = 0;
        let skippedGoogle = 0;

        usersSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.email === SUPER_ADMIN_EMAIL) return; // استثناء المالك

            const photo = data.photoURL || '';
            const isGooglePhoto = photo.includes('googleusercontent.com');

            // لو صورة جوجل → نسيبها زي ما هي
            if (isGooglePhoto) {
                // نحذف صورة الغلاف فقط لو موجودة
                if (data.coverPhoto) {
                    batch.update(docSnap.ref, { coverPhoto: null });
                    count++;
                }
                skippedGoogle++;
                return;
            }

            // لو صورة مرفوعة يدوي (Cloudinary/Firebase) → نحذفها
            batch.update(docSnap.ref, {
                photoURL: null,
                coverPhoto: null
            });
            count++;
        });

        if (count > 0) {
            await batch.commit();
            alert(`✅ تم حذف الصور المرفوعة يدوياً لـ ${count} طالب/ة.\n📷 تم الحفاظ على ${skippedGoogle} صورة جوجل أصلية.`);
            window.refreshUsersList?.();
        } else {
            alert(`لا توجد صور مرفوعة يدوياً لحذفها.\n📷 جميع الطلاب (${skippedGoogle}) يستخدمون صور جوجل.`);
        }
    } catch (error) {
        console.error("Error resetting profile photos:", error);
        alert("حدث خطأ: " + error.message);
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
};

// ============================================================
// ⛔ دالة التدمير الشامل (تصفير الطلاب والأنشطة فقط)
// ============================================================
window.wipeAllStudentData = async () => {
    const confirmation = prompt("⛔ تحذير نهائي: هذا سيحذف كل الطلاب، الدرجات، الشات، ورسائل الدعم.\nلن يتم حذف المحاضرات أو المشرفين.\n\nللتأكيد اكتب: 'حذف الكل'");

    if (confirmation !== "حذف الكل") return alert("تم إلغاء العملية.");

    // واجهة التحميل الحمراء
    const btn = document.createElement('div');
    btn.className = "fixed top-0 left-0 w-full h-full bg-red-900/95 text-white flex items-center justify-center z-[9999] flex-col";
    btn.innerHTML = `<h1 class="text-4xl font-bold mb-4">جاري تنظيف المنصة...</h1><div id="wipe-prog" class="text-2xl">0%</div>`;
    document.body.appendChild(btn);

    const collectionsToWipe = [
        "users",           // بيانات الطلاب
        "user_scores",     // الدرجات
        "user_scores_log", // سجل المحاولات
        "global_chat",     // الشات العام
        "support_chats",   // رسائل الدعم
        "notifications",   // الإشعارات
        "user_progress",   // التقدم في الدروس
        "follows",         // المتابعين (ما عدا متابعي الأدمن)
        "final_grades"     // درجات الفاينل
    ];

    try {
        let totalDeleted = 0;

        // 1. حذف المجموعات الرئيسية
        for (const colName of collectionsToWipe) {
            document.getElementById('wipe-prog').innerHTML = `جاري مسح: ${colName}...`;

            const q = query(collection(db, colName));
            const snapshot = await getDocs(q);

            const chunks = [];
            let batch = writeBatch(db);
            let counter = 0;

            snapshot.docs.forEach((doc) => {
                // 🛡️ حماية: عدم مسح حساب الأدمن المالك
                if (colName === 'users' && doc.data().email === SUPER_ADMIN_EMAIL) return;

                // 🛡️ حماية: عدم مسح متابعات الأدمن
                if (colName === 'follows') {
                    const followData = doc.data();
                    // لو الأدمن متابِع أو متابَع، ما تمسحش
                    if (followData.followerIsAdmin || followData.followingIsAdmin) return;
                }

                batch.delete(doc.ref);
                counter++;
                totalDeleted++;

                if (counter >= 400) {
                    chunks.push(batch);
                    batch = writeBatch(db);
                    counter = 0;
                }
            });

            if (counter > 0) chunks.push(batch);

            for (const b of chunks) {
                await b.commit();
            }
        }

        // 2. حذف تسليمات الواجبات (لأنها Subcollection)
        document.getElementById('wipe-prog').innerHTML = `جاري مسح حلول الواجبات...`;
        const assignsSnap = await getDocs(collection(db, "assignments"));
        for (const assignDoc of assignsSnap.docs) {
            const subsSnap = await getDocs(collection(db, "assignments", assignDoc.id, "submissions"));
            const batch = writeBatch(db);
            let hasOps = false;
            subsSnap.forEach(sub => {
                batch.delete(sub.ref);
                hasOps = true;
                totalDeleted++;
            });
            if (hasOps) await batch.commit();
        }

        btn.innerHTML = `
            <h1 class="text-5xl mb-4">✅ تمت الفرمتة!</h1>
            <p class="text-xl">تم حذف ${totalDeleted} مستند.</p>
            <p>المنصة الآن جاهزة لاستقبال الطلاب من الصفر.</p>
        `;

        await logAdminAction('wipe_all_data', '', '', `تدمير شامل: حذف ${totalDeleted} مستند`);

        setTimeout(() => {
            window.location.reload();
        }, 3000);

    } catch (e) {
        console.error(e);
        alert("حدث خطأ أثناء الحذف: " + e.message);
        btn.remove();
    }
};

// ربط الدوال بالنافذة لتكون متاحة للـ events.js و html
window.openUsersLogView = openUsersLogView;
window.openAssignmentsAdminView = openAssignmentsAdminView;
window.openLiveSessionControl = openLiveSessionControl;
window.openAdminManagementView = openAdminManagementView;
window.viewUserScoresView = viewUserScoresView;
window.saveGrade = saveGrade;
window.deleteAssign = deleteAssign;

// ============================================================
// بحث في الطلاب بالاسم أو الإيميل
// ============================================================
window.filterStudentsBySearch = () => {
    const searchInput = document.getElementById('search-student');
    if (!searchInput) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const cards = document.querySelectorAll('#users-table-container > div.p-4');

    let visibleCount = 0;
    cards.forEach(card => {
        const name = card.querySelector('h4')?.textContent?.toLowerCase() || '';
        const email = card.querySelector('.text-surface-500')?.textContent?.toLowerCase() || '';

        if (searchTerm === '' || name.includes(searchTerm) || email.includes(searchTerm)) {
            card.style.display = '';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    // تحديث العداد
    const countEl = document.getElementById('filter-count');
    if (countEl) countEl.textContent = `${visibleCount} طالب`;
};
window.loadSubmissions = loadSubmissions;
window.openSupportAdmin = openAdminSupportDashboard;
window.openIdReviewDashboard = openIdReviewDashboard;
window.verifyUser = verifyUser;

// ============================================================
// دوال التحكم بوضع الصيانة (Maintenance Mode Controls)
// ============================================================

// تبديل وضع الصيانة
window.toggleMaintenanceMode = async () => {
    const btn = document.getElementById('toggle-maintenance-btn');
    const btnText = document.getElementById('maintenance-btn-text');

    if (!confirm("⚠️ هل أنت متأكد من تغيير وضع المنصة؟")) return;

    btn.disabled = true;
    btnText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحديث...';

    try {
        const settingsRef = doc(db, "system", "settings");
        const snap = await getDoc(settingsRef);
        const currentMode = snap.exists() ? snap.data().maintenanceMode : false;

        await setDoc(settingsRef, {
            maintenanceMode: !currentMode,
            updatedAt: new Date(),
            updatedBy: auth.currentUser.email
        }, { merge: true });

        await logAdminAction('toggle_maintenance', '', '', !currentMode ? 'تفعيل وضع الصيانة' : 'إلغاء وضع الصيانة');
        alert(!currentMode ? "🚧 تم تفعيل وضع الصيانة - المنصة مغلقة الآن" : "✅ تم إلغاء الصيانة - المنصة متاحة للجميع");
        updateMaintenanceButton(!currentMode);

    } catch (e) {
        console.error("Maintenance Toggle Error:", e);
        alert("حدث خطأ: " + e.message);
    } finally {
        btn.disabled = false;
    }
};

// حفظ إعدادات الصيانة
window.saveMaintenanceSettings = async () => {
    const title = document.getElementById('maintenance-title').value.trim();
    const layout = document.getElementById('maintenance-layout').value;
    const message = document.getElementById('maintenance-message').value.trim();
    const returnTime = document.getElementById('maintenance-return-time').value.trim();
    const whatsappNumber = document.getElementById('maintenance-whatsapp').value.trim();
    const showWhatsapp = document.getElementById('maintenance-show-whatsapp').checked;
    const showPhoneText = document.getElementById('maintenance-show-phone').checked;

    try {
        await setDoc(doc(db, "system", "settings"), {
            maintenanceTitle: title,
            maintenanceLayout: layout,
            maintenanceMessage: message,
            expectedReturn: returnTime,
            whatsappNumber: whatsappNumber,
            showWhatsapp: showWhatsapp,
            showPhoneText: showPhoneText,
            updatedAt: new Date()
        }, { merge: true });

        alert("✅ تم حفظ إعدادات الصيانة");

    } catch (e) {
        console.error("Save Settings Error:", e);
        alert("حدث خطأ: " + e.message);
    }
};

// تحديث مظهر زر الصيانة
const updateMaintenanceButton = async (isActive) => {
    const btn = document.getElementById('toggle-maintenance-btn');
    const btnText = document.getElementById('maintenance-btn-text');

    if (!btn || !btnText) return;

    if (isActive) {
        btn.classList.remove('bg-red-600', 'hover:bg-red-700');
        btn.classList.add('bg-accent-600', 'hover:bg-accent-700');
        btnText.textContent = '🟢 إلغاء الصيانة (المنصة مغلقة حالياً)';
    } else {
        btn.classList.remove('bg-accent-600', 'hover:bg-accent-700');
        btn.classList.add('bg-red-600', 'hover:bg-red-700');
        btnText.textContent = '🔴 تفعيل وضع الصيانة';
    }
};

// تحميل حالة الصيانة عند فتح الصفحة
window.loadMaintenanceStatus = async () => {
    try {
        const snap = await getDoc(doc(db, "system", "settings"));
        if (snap.exists()) {
            const data = snap.data();
            updateMaintenanceButton(data.maintenanceMode);

            const titleField = document.getElementById('maintenance-title');
            const layoutField = document.getElementById('maintenance-layout');
            const msgField = document.getElementById('maintenance-message');
            const returnField = document.getElementById('maintenance-return-time');
            const whatsappField = document.getElementById('maintenance-whatsapp');
            const showWhatsappField = document.getElementById('maintenance-show-whatsapp');
            const showPhoneField = document.getElementById('maintenance-show-phone');

            if (titleField && data.maintenanceTitle) titleField.value = data.maintenanceTitle;
            if (layoutField && data.maintenanceLayout) layoutField.value = data.maintenanceLayout;
            if (msgField && data.maintenanceMessage) msgField.value = data.maintenanceMessage;
            if (returnField && data.expectedReturn) returnField.value = data.expectedReturn;
            if (whatsappField && data.whatsappNumber) whatsappField.value = data.whatsappNumber;
            if (showWhatsappField) showWhatsappField.checked = data.showWhatsapp !== false;
            if (showPhoneField) showPhoneField.checked = data.showPhoneText !== false;
        } else {
            updateMaintenanceButton(false);
        }
    } catch (e) {
        console.error("Load Maintenance Status Error:", e);
    }
};

// استدعاء تحميل الحالة عند فتح صفحة الإعدادات
// نستخدم interval علشان نتأكد إنها تشتغل
const maintenanceCheckInterval = setInterval(() => {
    if (document.getElementById('toggle-maintenance-btn')) {
        window.loadMaintenanceStatus();
        window.loadWhitelistEmails?.();
        clearInterval(maintenanceCheckInterval);
    }
}, 300);

// نظفه بعد 10 ثواني لو مفيش الزرار
setTimeout(() => clearInterval(maintenanceCheckInterval), 10000);

// ============================================================
// دوال قائمة الإيميلات المستثناة (Whitelist)
// ============================================================

// إضافة إيميل للقائمة البيضاء
window.addWhitelistEmail = async () => {
    const input = document.getElementById('whitelist-email-input');
    const email = input.value.trim().toLowerCase();

    if (!email || !email.includes('@')) {
        return alert("⚠️ يرجى إدخال إيميل صحيح");
    }

    try {
        const settingsRef = doc(db, "system", "settings");
        const snap = await getDoc(settingsRef);
        const currentList = snap.exists() ? (snap.data().whitelistEmails || []) : [];

        if (currentList.includes(email)) {
            return alert("هذا الإيميل موجود بالفعل في القائمة");
        }

        currentList.push(email);

        await setDoc(settingsRef, {
            whitelistEmails: currentList,
            updatedAt: new Date()
        }, { merge: true });

        input.value = '';
        window.loadWhitelistEmails();
        window.showToast?.("✅ تم إضافة الإيميل للقائمة البيضاء", "success");

    } catch (e) {
        console.error("Add Whitelist Error:", e);
        alert("حدث خطأ: " + e.message);
    }
};

// حذف إيميل من القائمة
window.removeWhitelistEmail = async (email) => {
    if (!confirm(`هل تريد حذف ${email} من القائمة؟`)) return;

    try {
        const settingsRef = doc(db, "system", "settings");
        const snap = await getDoc(settingsRef);
        let currentList = snap.exists() ? (snap.data().whitelistEmails || []) : [];

        currentList = currentList.filter(e => e !== email);

        await setDoc(settingsRef, {
            whitelistEmails: currentList,
            updatedAt: new Date()
        }, { merge: true });

        window.loadWhitelistEmails();
        window.showToast?.("تم حذف الإيميل", "success");

    } catch (e) {
        console.error("Remove Whitelist Error:", e);
    }
};

// تحميل وعرض القائمة
window.loadWhitelistEmails = async () => {
    const container = document.getElementById('whitelist-emails-list');
    if (!container) return;

    try {
        const snap = await getDoc(doc(db, "system", "settings"));
        const list = snap.exists() ? (snap.data().whitelistEmails || []) : [];

        if (list.length === 0) {
            container.innerHTML = '<p class="text-center text-xs text-surface-400 py-4 opacity-50">لا توجد إيميلات مستثناة حالياً</p>';
            return;
        }

        container.innerHTML = list.map(email => `
            <div class="flex items-center justify-between bg-accent-50 dark:bg-accent-900/20 p-3 rounded-xl border border-accent-200 dark:border-accent-800">
                <span class="text-sm font-mono text-accent-700 dark:text-accent-300">${email}</span>
                <button onclick="window.removeWhitelistEmail('${email}')" class="w-8 h-8 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-lg hover:bg-red-200 transition flex items-center justify-center">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>
        `).join('');

    } catch (e) {
        console.error("Load Whitelist Error:", e);
        container.innerHTML = '<p class="text-center text-xs text-red-400 py-4">خطأ في التحميل</p>';
    }
};

// ============================================================
// 🆕 Student Filtering & Targeted Notifications
// ============================================================

// Global variable to store all users for filtering
window.allUsersCache = [];

// Render users table implementation (used by filterStudents)
const renderUsersTableImpl = (users, isGlobalOwner) => {
    const container = document.getElementById('users-table-container');
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = '<div class="p-20 text-center text-surface-400 font-bold">لا يوجد طلاب مطابقين للفلتر.</div>';
        return;
    }

    let rows = '';
    const now = new Date();

    users.forEach(userData => {
        const lastSeen = userData.lastSeen ? (userData.lastSeen.toDate ? userData.lastSeen.toDate() : new Date(userData.lastSeen)) : new Date(0);
        const isOnline = ((now - lastSeen) / 1000 / 60) < 7;

        const isChatBanned = userData.isChatBanned === true;
        const isPlatformBanned = userData.isBannedFromPlatform === true;
        const isVerified = userData.isVerified === true;
        const badgesDisplay = userData.badges ? userData.badges.map(b => `<span title="${b.title}" class="cursor-help text-lg hover:scale-125 inline-block transition">${b.icon}</span>`).join(' ') : '<span class="text-surface-300 text-xs">-</span>';

        rows += `
            <tr class="group border-b dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition ${isPlatformBanned ? 'bg-red-50 dark:bg-red-900/10' : ''}">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-4">
                        <div class="relative">
                            <img src="${userData.photoURL || 'https://ui-avatars.com/api/?background=random&name=User'}" loading="lazy" class="w-12 h-12 rounded-full border-2 border-white shadow-sm object-cover cursor-pointer hover:scale-110 transition" onclick="window.location.hash='#profile/${userData.uid || userData.id}'">
                            ${isOnline ? '<span class="absolute bottom-0 right-0 w-3.5 h-3.5 bg-accent-500 border-2 border-white rounded-full"></span>' : ''}
                        </div>
                        <div>
                            <div class="font-black dark:text-white text-sm flex items-center gap-2">
                                <a href="#profile/${userData.uid || userData.id}" class="hover:text-primary-600 transition">${userData.displayName}</a>
                                ${isVerified ? '<i class="fas fa-check-circle text-primary-500 text-xs" title="موثق"></i>' : ''}
                                ${isPlatformBanned ? '<span class="text-[9px] bg-red-600 text-white px-1.5 rounded">محظور</span>' : ''}
                                <button onclick="window.editUserName('${userData.uid || userData.id}', '${userData.displayName}')" class="text-xs text-surface-400 hover:text-primary-500 transition" title="تعديل الاسم"><i class="fas fa-pen"></i></button>
                            </div>
                            <div class="text-[10px] text-surface-500 font-mono">${isGlobalOwner ? userData.email : ''}</div>
                            ${isOnline ? '<span class="text-[10px] text-accent-500 font-bold"><i class="fas fa-circle text-[6px] mr-1"></i>متصل</span>' : (userData.lastSeen ? `<span class="text-[10px] text-surface-400">${window._adminTimeAgo?.(userData.lastSeen) || ''}</span>` : '')}
                            <div class="text-[10px] text-primary-400 font-bold">${userData.collegeId || '?'} / ${userData.departmentId || '?'}</div>
                        </div>
                    </div>
                </td>
                <td class="px-4 py-4 text-center">${badgesDisplay}</td>
                <td class="px-6 py-4">
                    <div class="flex justify-end gap-2 flex-wrap">
                        <button onclick="window.openBadgeManager('${userData.uid || userData.id}')" class="w-8 h-8 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition flex items-center justify-center" title="إدارة الأوسمة"><i class="fas fa-medal"></i></button>
                        <button onclick="window.openBonusModal('${userData.uid || userData.id}', '${userData.displayName}')" class="w-8 h-8 bg-accent-100 text-accent-700 rounded-lg hover:bg-accent-200 transition flex items-center justify-center" title="إضافة درجات"><i class="fas fa-plus"></i></button>
                        <button onclick="window.changeStudentCollege('${userData.uid || userData.id}', '${userData.displayName}')" class="w-8 h-8 bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition flex items-center justify-center" title="نقل الطالب"><i class="fas fa-exchange-alt"></i></button>
                        
                        <button onclick="window.adminMessageUser('${userData.uid || userData.id}', '${userData.displayName}')" class="w-8 h-8 bg-pink-100 text-pink-600 rounded-lg hover:bg-pink-200 transition flex items-center justify-center" title="مراسلة خاصة"><i class="fas fa-envelope"></i></button>
                        
                        <button onclick="window.toggleChatBan('${userData.uid || userData.id}', ${isChatBanned})" class="w-8 h-8 rounded-lg transition flex items-center justify-center ${isChatBanned ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-surface-100 text-surface-500 hover:bg-orange-100 hover:text-orange-600'}" title="${isChatBanned ? 'فك حظر الشات' : 'حظر الشات'}">
                            <i class="fas fa-comment-slash"></i>
                        </button>
                        
                        ${(isGlobalOwner || window._adminPerms?.bannedUsers) ? `
                            <button onclick="window.togglePlatformBan('${userData.uid || userData.id}', ${isPlatformBanned})" class="w-8 h-8 rounded-lg transition flex items-center justify-center ${isPlatformBanned ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-surface-100 text-surface-500 hover:bg-red-100 hover:text-red-600'}" title="${isPlatformBanned ? 'فك الحظر النهائي' : 'طرد نهائي'}">
                                <i class="fas fa-ban"></i>
                            </button>
                        ` : ''}
                        ${(isGlobalOwner || window._adminPerms?.deleteUsers) ? `
                            <button onclick="window.deleteUserPermanently('${userData.uid || userData.id}', '${userData.displayName?.replace(/'/g, "\\'") || 'هذا المستخدم'}', '${userData.email || ''}')" class="w-8 h-8 bg-surface-800 text-white rounded-lg hover:bg-black transition flex items-center justify-center shadow-lg" title="حذف نهائي ❌">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>`;
    });

    container.innerHTML = `
        <table class="w-full text-sm text-right">
            <thead class="bg-surface-50 dark:bg-surface-700/50 text-surface-500 dark:text-surface-300 font-bold uppercase text-xs">
                <tr>
                    <th class="px-6 py-4">بيانات الطالب</th>
                    <th class="px-4 py-4 text-center">الإنجازات</th>
                    <th class="px-6 py-4 text-left">أدوات التحكم</th>
                </tr>
            </thead>
            <tbody class="divide-y dark:divide-surface-700 bg-white dark:bg-surface-800">${rows}</tbody>
        </table>`;
};

// Store reference globally for filtering
window.renderUsersTableImpl = renderUsersTableImpl;

// Filter students (called from filter controls)
window.filterStudents = () => {
    const colFilter = document.getElementById('filter-college')?.value || '';
    const deptFilter = document.getElementById('filter-dept')?.value || '';
    const onlineFirst = document.getElementById('filter-online')?.checked || false;
    const verifiedOnly = document.getElementById('filter-verified')?.checked || false;

    let filtered = window.allUsersCache.filter(u => {
        if (colFilter && u.collegeId !== colFilter) return false;
        if (deptFilter && u.departmentId !== deptFilter) return false;
        if (verifiedOnly && !u.isVerified) return false;
        return true;
    });

    // Sort by online status if checked
    if (onlineFirst) {
        const now = new Date();
        filtered.sort((a, b) => {
            const aSeen = a.lastSeen ? (a.lastSeen.toDate ? a.lastSeen.toDate() : new Date(a.lastSeen)) : new Date(0);
            const bSeen = b.lastSeen ? (b.lastSeen.toDate ? b.lastSeen.toDate() : new Date(b.lastSeen)) : new Date(0);
            const aOnline = ((now - aSeen) / 60000) < 7;
            const bOnline = ((now - bSeen) / 60000) < 7;
            if (aOnline && !bOnline) return -1;
            if (!aOnline && bOnline) return 1;
            return 0;
        });
    }

    // Update count
    const countEl = document.getElementById('filter-count');
    if (countEl) countEl.textContent = `${filtered.length} طالب`;

    // Store filtered for copy/notification
    window.filteredUsers = filtered;

    // Re-render table (if renderUsersTable exists)
    if (window.renderUsersTable) window.renderUsersTable(filtered);
};

// Copy filtered emails
window.copyFilteredEmails = () => {
    const users = window.filteredUsers || window.allUsersCache || [];
    const emails = users.filter(u => u.email).map(u => u.email);

    if (emails.length === 0) {
        alert('لا توجد إيميلات لنسخها');
        return;
    }

    navigator.clipboard.writeText(emails.join(', '));
    alert(`📋 تم نسخ ${emails.length} إيميل للحافظة`);
};

// Send targeted notification
window.sendTargetedNotification = async () => {
    const users = window.filteredUsers || window.allUsersCache || [];

    if (users.length === 0) {
        alert('لا يوجد مستخدمين لإرسال تنبيه لهم');
        return;
    }

    const message = prompt(`إرسال تنبيه لـ ${users.length} مستخدم\nاكتب نص التنبيه:`);
    if (!message || message.trim().length < 3) return;

    const link = prompt('رابط (اختياري):', '#') || '#';

    if (!confirm(`تأكيد إرسال تنبيه لـ ${users.length} مستخدم؟`)) return;

    try {
        const batch = writeBatch(db);

        users.forEach(u => {
            const notifRef = doc(collection(db, "notifications"));
            batch.set(notifRef, {
                userId: u.uid,
                message,
                link,
                read: false,
                createdAt: new Date()
            });
        });

        await batch.commit();
        await logAdminAction('send_targeted_notification', '', '', `إرسال إشعار مستهدف لـ ${users.length} مستخدم: ${message.substring(0, 50)}`);
        alert(`✅ تم إرسال التنبيه لـ ${users.length} مستخدم`);

    } catch (e) {
        console.error('Error sending notifications:', e);
        alert('خطأ في إرسال التنبيهات: ' + e.message);
    }
};

// Send notification to specific college/department
window.sendCollegeNotification = async () => {
    const colId = prompt('أدخل كود الكلية (مثال: engineering):');
    if (!colId) return;

    const deptId = prompt('أدخل كود القسم (اتركه فارغ لكل الكلية):', '') || '';

    const message = prompt('اكتب نص التنبيه:');
    if (!message) return;

    try {
        const q = query(collection(db, "users"), where("collegeId", "==", colId));
        const snap = await getDocs(q);

        let count = 0;
        const batch = writeBatch(db);

        snap.forEach(d => {
            const u = d.data();
            if (deptId && u.departmentId !== deptId) return;

            const notifRef = doc(collection(db, "notifications"));
            batch.set(notifRef, {
                userId: d.id,
                message,
                link: '#',
                read: false,
                createdAt: new Date()
            });
            count++;
        });

        await batch.commit();
        alert(`✅ تم إرسال التنبيه لـ ${count} طالب في ${colId}${deptId ? ' / ' + deptId : ''}`);

    } catch (e) {
        console.error(e);
        alert('خطأ: ' + e.message);
    }
};

// Copy emails by college/department
window.copyCollegeEmails = async () => {
    const colId = prompt('أدخل كود الكلية (مثال: engineering):');
    if (!colId) return;

    const deptId = prompt('أدخل كود القسم (اتركه فارغ لكل الكلية):', '') || '';

    try {
        const q = query(collection(db, "users"), where("collegeId", "==", colId));
        const snap = await getDocs(q);

        const emails = [];
        snap.forEach(d => {
            const u = d.data();
            if (deptId && u.departmentId !== deptId) return;
            if (u.email) emails.push(u.email);
        });

        if (emails.length === 0) {
            alert('لا توجد إيميلات');
            return;
        }

        navigator.clipboard.writeText(emails.join(', '));
        alert(`📋 تم نسخ ${emails.length} إيميل من ${colId}${deptId ? ' / ' + deptId : ''}`);

    } catch (e) {
        console.error(e);
        alert('خطأ: ' + e.message);
    }
};

// ============================================================
// حظر من المنصة بالكامل
// ============================================================
window.banFromPlatform = async (uid, userName) => {
    if (!confirm(`⚠️ هل أنت متأكد من حظر "${userName}" من المنصة بالكامل؟\n\nلن يتمكن من تسجيل الدخول مجدداً!`)) return;

    try {
        await updateDoc(doc(db, "users", uid), {
            isBannedFromPlatform: true,
            bannedAt: new Date(),
            bannedBy: auth.currentUser.email
        });
        await logAdminAction('ban_from_platform', uid, userName, `حظر من المنصة: ${userName}`);
        window.showToast?.('✅ تم حظر المستخدم من المنصة', 'success');
        openUsersLogView(); // إعادة تحميل القائمة
    } catch (e) {
        console.error(e);
        alert('خطأ: ' + e.message);
    }
};

window.unbanFromPlatform = async (uid, userName) => {
    if (!confirm(`هل تريد إلغاء حظر "${userName}"؟`)) return;

    try {
        await updateDoc(doc(db, "users", uid), {
            isBannedFromPlatform: false,
            unbannedAt: new Date(),
            unbannedBy: auth.currentUser.email
        });
        await logAdminAction('unban_from_platform', uid, userName, `إلغاء حظر: ${userName}`);
        window.showToast?.('✅ تم إلغاء الحظر', 'success');
        openUsersLogView();
    } catch (e) {
        console.error(e);
        alert('خطأ: ' + e.message);
    }
};

// ============================================================
// تصدير البيانات لـ Excel
// ============================================================
window.exportUsersToExcel = async () => {
    try {
        window.showToast?.('جاري تحضير ملف Excel...', 'info');

        const usersSnap = await getDocs(collection(db, "users"));
        const data = [];

        usersSnap.forEach(doc => {
            const u = doc.data();
            data.push({
                'الاسم': u.displayName || '-',
                'البريد الإلكتروني': (auth.currentUser?.email === SUPER_ADMIN_EMAIL) ? (u.email || '-') : 'مخفي',
                'الكلية': u.collegeName || '-',
                'القسم': u.departmentName || '-',
                'الفرقة': u.yearName || '-',
                'رقم الهاتف': u.phone || '-',
                'تاريخ التسجيل': u.createdAt?.toDate?.()?.toLocaleDateString('ar-EG') || '-',
                'موثق': u.isVerified ? 'نعم' : 'لا',
                'محظور': u.isBannedFromPlatform ? 'نعم' : 'لا',
                'XP': u.xp || 0,
                'المستوى': u.level || 1,
                'الـ Streak': u.currentStreak || 0
            });
        });

        // إنشاء ملف Excel
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'المستخدمين');

        // تحميل الملف
        XLSX.writeFile(wb, `مستخدمين_مسار_${new Date().toLocaleDateString('ar-EG')}.xlsx`);

        window.showToast?.('✅ تم تحميل ملف Excel', 'success');

    } catch (e) {
        console.error('Excel export error:', e);
        window.showToast?.('فشل تصدير Excel', 'error');
    }
};

// تصدير بيانات الحضور لـ Excel
window.exportAttendanceToExcel = async (sessionId) => {
    try {
        if (!sessionId) {
            alert('اختر جلسة حضور أولاً');
            return;
        }

        window.showToast?.('جاري تحضير بيانات الحضور...', 'info');

        const sessionDoc = await getDoc(doc(db, "attendance_sessions", sessionId));
        if (!sessionDoc.exists()) return alert('الجلسة غير موجودة');

        const session = sessionDoc.data();
        const data = [];

        // جلب سجلات الحضور
        const recordsSnap = await getDocs(collection(db, "attendance_sessions", sessionId, "records"));

        for (const rec of recordsSnap.docs) {
            const r = rec.data();
            // جلب بيانات الطالب
            const userDoc = await getDoc(doc(db, "users", r.userId));
            const u = userDoc.exists() ? userDoc.data() : {};

            data.push({
                'الاسم': u.displayName || r.userId,
                'البريد': (auth.currentUser?.email === SUPER_ADMIN_EMAIL) ? (u.email || '-') : 'مخفي',
                'وقت التسجيل': r.timestamp?.toDate?.()?.toLocaleString('ar-EG') || '-',
                'الحالة': r.status || 'حاضر'
            });
        }

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'الحضور');

        XLSX.writeFile(wb, `حضور_${session.title || 'جلسة'}_${new Date().toLocaleDateString('ar-EG')}.xlsx`);

        window.showToast?.('✅ تم تحميل بيانات الحضور', 'success');

    } catch (e) {
        console.error('Attendance export error:', e);
        window.showToast?.('فشل تصدير الحضور', 'error');
    }
};

// ============================================================
// نظام رفع درجات الفاينل من Excel (للسوبر أدمن فقط)
// ============================================================
export const openGradesUploadView = async () => {
    if (auth.currentUser?.email !== SUPER_ADMIN_EMAIL) {
        return alert('⛔ هذه الصفحة متاحة للسوبر أدمن فقط');
    }

    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '📊 رفع درجات الفاينل';
    const content = document.getElementById('admin-view-content');

    content.innerHTML = `
        <div class="max-w-3xl mx-auto">
            <!-- تعليمات -->
            <div class="bg-gradient-to-r from-primary-500 to-primary-600 text-white p-6 rounded-2xl mb-6 shadow-lg">
                <h3 class="text-xl font-bold mb-3"><i class="fas fa-info-circle ml-2"></i>تعليمات رفع الدرجات</h3>
                <ul class="space-y-2 text-sm opacity-90">
                    <li>📄 قم بإعداد ملف Excel بالصيغة التالية:</li>
                    <li class="bg-white/20 p-3 rounded-xl font-mono text-xs">
                        <table class="w-full text-center">
                            <tr class="border-b border-white/30">
                                <th class="p-1">رقم_الطالب</th>
                                <th class="p-1">المادة</th>
                                <th class="p-1">الدرجة</th>
                                <th class="p-1">من</th>
                            </tr>
                            <tr>
                                <td class="p-1">202400123</td>
                                <td class="p-1">الرياضيات</td>
                                <td class="p-1">85</td>
                                <td class="p-1">100</td>
                            </tr>
                        </table>
                    </li>
                    <li>⚠️ رقم الطالب يجب أن يطابق الرقم المسجل في المنصة</li>
                </ul>
            </div>

            <!-- منطقة الرفع -->
            <div class="bg-white dark:bg-surface-800 p-8 rounded-3xl shadow-xl border-2 border-dashed border-primary-300 dark:border-primary-700 text-center">
                <input type="file" id="grades-file-input" accept=".xlsx,.xls,.csv" class="hidden">
                <div id="grades-upload-zone" class="cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-900/20 p-10 rounded-2xl transition" onclick="document.getElementById('grades-file-input').click()">
                    <i class="fas fa-cloud-upload-alt text-6xl text-primary-400 mb-4"></i>
                    <p class="text-xl font-bold dark:text-white mb-2">اضغط لاختيار ملف Excel</p>
                    <p class="text-surface-500 text-sm">أو اسحب الملف وأفلته هنا</p>
                </div>
                <p id="grades-file-name" class="mt-4 font-bold text-primary-600 hidden"></p>
            </div>

            <!-- معاينة البيانات -->
            <div id="grades-preview" class="hidden mt-6">
                <div class="bg-surface-50 dark:bg-surface-700 p-6 rounded-2xl">
                    <h4 class="font-bold dark:text-white mb-4"><i class="fas fa-eye ml-2"></i>معاينة البيانات (<span id="grades-count">0</span> صف)</h4>
                    <div class="overflow-x-auto max-h-64 overflow-y-auto">
                        <table class="w-full text-sm" id="grades-preview-table">
                            <thead class="bg-primary-100 dark:bg-primary-900/50">
                                <tr>
                                    <th class="p-3 text-right font-bold">رقم الطالب</th>
                                    <th class="p-3 text-right font-bold">المادة</th>
                                    <th class="p-3 text-center font-bold">الدرجة</th>
                                    <th class="p-3 text-center font-bold">من</th>
                                </tr>
                            </thead>
                            <tbody id="grades-preview-body"></tbody>
                        </table>
                    </div>
                </div>
                <button onclick="window.uploadGradesToFirestore()" class="mt-6 w-full bg-gradient-to-r from-accent-500 to-accent-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition">
                    <i class="fas fa-upload ml-2"></i>رفع الدرجات للمنصة
                </button>
            </div>

            <!-- نتيجة الرفع -->
            <div id="grades-result" class="hidden mt-6 p-6 rounded-2xl"></div>
        </div>
    `;

    // ربط الأحداث
    const fileInput = document.getElementById('grades-file-input');
    fileInput.onchange = (e) => {
        if (e.target.files[0]) {
            window.processGradesExcel(e.target.files[0]);
        }
    };
};

window.openGradesUploadView = openGradesUploadView;

// متغير لتخزين بيانات الدرجات
let gradesData = [];

// معالجة ملف Excel
window.processGradesExcel = async (file) => {
    const fileNameEl = document.getElementById('grades-file-name');
    fileNameEl.textContent = `📁 ${file.name}`;
    fileNameEl.classList.remove('hidden');

    try {
        let workbook;

        // التعامل مع CSV بشكل خاص لحل مشكلة الـ encoding
        if (file.name.toLowerCase().endsWith('.csv')) {
            const text = await file.text(); // قراءة كنص UTF-8
            workbook = XLSX.read(text, { type: 'string' });
        } else {
            const data = await file.arrayBuffer();
            workbook = XLSX.read(data);
        }

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);

        console.log('📊 Raw Excel data:', json); // للتشخيص
        console.log('📊 First row keys:', json[0] ? Object.keys(json[0]) : 'no data');

        if (json.length === 0) {
            return alert('❌ الملف فارغ!');
        }

        // دالة للبحث عن مفتاح في الـ row (مرنة)
        const findKey = (row, ...candidates) => {
            for (const key of Object.keys(row)) {
                const normalizedKey = key.replace(/[\s_-]/g, '').toLowerCase();
                for (const candidate of candidates) {
                    const normalizedCandidate = candidate.replace(/[\s_-]/g, '').toLowerCase();
                    if (normalizedKey.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedKey)) {
                        return row[key];
                    }
                }
            }
            return null;
        };

        // تنظيف البيانات
        gradesData = json.map(row => ({
            studentId: String(findKey(row, 'رقمالطالب', 'رقم_الطالب', 'studentId', 'id', 'الرقم') || '').trim(),
            subject: String(findKey(row, 'المادة', 'subject', 'ماده', 'course') || '').trim(),
            score: parseFloat(findKey(row, 'الدرجة', 'درجة', 'score', 'grade') || 0),
            maxScore: parseFloat(findKey(row, 'من', 'max', 'maxScore', 'total', 'الإجمالي') || 100)
        })).filter(r => r.studentId && r.subject);

        console.log('📊 Processed grades:', gradesData); // للتشخيص

        // عرض المعاينة
        const previewBody = document.getElementById('grades-preview-body');
        previewBody.innerHTML = gradesData.slice(0, 20).map(r => `
            <tr class="border-b dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-600/50">
                <td class="p-2 font-mono">${r.studentId}</td>
                <td class="p-2">${r.subject}</td>
                <td class="p-2 text-center font-bold text-accent-600">${r.score}</td>
                <td class="p-2 text-center text-surface-500">${r.maxScore}</td>
            </tr>
        `).join('');

        document.getElementById('grades-count').textContent = gradesData.length;
        document.getElementById('grades-preview').classList.remove('hidden');

    } catch (e) {
        console.error('Excel read error:', e);
        alert('❌ فشل قراءة الملف. تأكد من أنه ملف Excel صحيح.');
    }
};

// رفع الدرجات للفايربيز
window.uploadGradesToFirestore = async () => {
    if (gradesData.length === 0) {
        return alert('❌ لا توجد بيانات للرفع!');
    }

    const resultEl = document.getElementById('grades-result');
    resultEl.innerHTML = '<div class="text-center p-6"><i class="fas fa-spinner fa-spin text-4xl text-primary-600"></i><p class="mt-4">جاري رفع الدرجات...</p></div>';
    resultEl.classList.remove('hidden');
    resultEl.className = 'mt-6 p-6 rounded-2xl bg-primary-50 dark:bg-primary-900/30';

    let success = 0, failed = 0, notFound = 0;
    const errors = [];

    try {
        // جلب كل المستخدمين للمطابقة
        const usersSnap = await getDocs(collection(db, "users"));
        const usersMap = {};
        usersSnap.forEach(d => {
            const u = d.data();
            if (u.studentId) usersMap[u.studentId] = { uid: d.id, name: u.displayName || u.fullName };
        });

        for (const grade of gradesData) {
            try {
                const student = usersMap[grade.studentId];
                if (!student) {
                    notFound++;
                    errors.push(`⚠️ رقم ${grade.studentId} غير موجود في المنصة`);
                    continue;
                }

                // حفظ الدرجة في collection final_grades
                await setDoc(doc(db, "final_grades", `${student.uid}_${grade.subject.replace(/\s+/g, '_')}`), {
                    userId: student.uid,
                    studentId: grade.studentId,
                    studentName: student.name,
                    subject: grade.subject,
                    score: grade.score,
                    maxScore: grade.maxScore,
                    percentage: Math.round((grade.score / grade.maxScore) * 100),
                    uploadedAt: serverTimestamp(),
                    uploadedBy: auth.currentUser.email
                });

                success++;
            } catch (e) {
                failed++;
                errors.push(`❌ فشل رفع درجة ${grade.studentId} - ${grade.subject}`);
            }
        }

        // عرض النتيجة
        resultEl.className = 'mt-6 p-6 rounded-2xl ' + (failed === 0 && notFound === 0 ? 'bg-accent-100 dark:bg-accent-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30');
        resultEl.innerHTML = `
            <h4 class="font-bold text-lg mb-4"><i class="fas fa-check-circle text-accent-600 ml-2"></i>تم الرفع!</h4>
            <div class="grid grid-cols-3 gap-4 mb-4">
                <div class="bg-accent-500 text-white p-4 rounded-xl text-center">
                    <div class="text-3xl font-black">${success}</div>
                    <div class="text-sm opacity-80">نجح</div>
                </div>
                <div class="bg-red-500 text-white p-4 rounded-xl text-center">
                    <div class="text-3xl font-black">${failed}</div>
                    <div class="text-sm opacity-80">فشل</div>
                </div>
                <div class="bg-orange-500 text-white p-4 rounded-xl text-center">
                    <div class="text-3xl font-black">${notFound}</div>
                    <div class="text-sm opacity-80">غير موجود</div>
                </div>
            </div>
            ${errors.length > 0 ? `<div class="bg-white dark:bg-surface-800 p-4 rounded-xl max-h-40 overflow-y-auto text-sm text-surface-600">${errors.slice(0, 20).join('<br>')}</div>` : ''}
        `;

        window.showToast?.(`✅ تم رفع ${success} درجة بنجاح`, 'success');
        await logAdminAction('upload_grades', '', '', `رفع درجات: ${success} نجاح، ${failed} فشل، ${notFound} غير موجود`);

        // إرسال إشعارات للطلاب الذين تم رفع درجاتهم
        const notifiedUsers = new Set();
        for (const grade of gradesData) {
            const student = usersMap[grade.studentId];
            if (student && !notifiedUsers.has(student.uid)) {
                notifiedUsers.add(student.uid);
                try {
                    await addDoc(collection(db, "notifications"), {
                        userId: student.uid,
                        title: "📊 تم نشر درجاتك!",
                        message: `تم إضافة درجة مادة ${grade.subject} وغيرها. افتح صفحة الدرجات للاطلاع.`,
                        type: "grade",
                        read: false,
                        createdAt: serverTimestamp()
                    });
                } catch (e) { console.warn('Notification error:', e); }
            }
        }

        if (notifiedUsers.size > 0) {
            window.showToast?.(`📬 تم إرسال إشعار لـ ${notifiedUsers.size} طالب`, 'info');
        }

    } catch (e) {
        console.error('Upload grades error:', e);
        resultEl.className = 'mt-6 p-6 rounded-2xl bg-red-100 dark:bg-red-900/30';
        resultEl.innerHTML = `<p class="text-red-600 font-bold"><i class="fas fa-times-circle ml-2"></i>حدث خطأ: ${e.message}</p>`;
    }
};

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
// تعديل بيانات الطالب (Edit Student Data)
// ============================================================
window.editStudentData = async (uid) => {
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (!userDoc.exists()) return alert('المستخدم غير موجود');
        const u = userDoc.data();

        const panel = document.createElement('div');
        panel.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[500] flex items-center justify-center p-4';
        panel.innerHTML = `
            <div class="bg-white dark:bg-surface-800 rounded-3xl w-full max-w-md shadow-2xl animate-slide-up">
                <div class="p-6 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-t-3xl">
                    <div class="flex justify-between items-center">
                        <h2 class="text-xl font-black"><i class="fas fa-edit ml-2"></i>تعديل بيانات الطالب</h2>
                        <button onclick="this.closest('.fixed').remove()" class="w-10 h-10 bg-white/20 rounded-full hover:bg-white/30 transition"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-bold mb-2 dark:text-surface-300">الاسم الرباعي</label>
                        <input type="text" id="edit-fullname" value="${u.fullName || u.displayName || ''}" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-2 dark:text-surface-300">الرقم القومي</label>
                        <input type="text" id="edit-nationalid" value="${u.nationalId || ''}" maxlength="14" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-mono">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-2 dark:text-surface-300">الرقم الجامعي</label>
                        <input type="text" id="edit-studentid" value="${u.studentId || ''}" maxlength="9" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-mono">
                    </div>
                    <button onclick="window.saveStudentData('${uid}')" class="w-full bg-gradient-to-r from-accent-500 to-accent-600 text-white py-4 rounded-xl font-bold hover:shadow-lg transition">
                        <i class="fas fa-save ml-2"></i>حفظ التعديلات
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        panel.onclick = (e) => { if (e.target === panel) panel.remove(); };
    } catch (e) {
        console.error('Edit error:', e);
        alert('فشل تحميل البيانات');
    }
};

window.saveStudentData = async (uid) => {
    const fullName = document.getElementById('edit-fullname').value.trim();
    const nationalId = document.getElementById('edit-nationalid').value.trim();
    const studentId = document.getElementById('edit-studentid').value.trim();

    if (!fullName) return alert('يرجى إدخال الاسم');

    try {
        await updateDoc(doc(db, "users", uid), {
            fullName,
            displayName: fullName,
            nationalId,
            studentId
        });
        await logAdminAction('edit_student_data', uid, fullName, `تعديل بيانات: ${fullName}`);
        alert('✅ تم حفظ التعديلات');
        document.querySelector('.fixed.inset-0')?.remove();
        openUsersLogView();
    } catch (e) {
        console.error(e);
        alert('فشل الحفظ');
    }
};

// ============================================================
// إضافة امتحان (Add Exam View)
// ============================================================
export const openAddExamView = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '📅 إدارة الامتحانات';
    const content = document.getElementById('admin-view-content');

    content.innerHTML = `
        <div class="max-w-2xl mx-auto">
            <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg mb-6">
                <h3 class="font-bold text-lg mb-4 dark:text-white"><i class="fas fa-plus ml-2 text-primary-500"></i>إضافة امتحان جديد</h3>
                <div class="space-y-4">
                    <input type="text" id="exam-title" placeholder="عنوان الامتحان" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                    <input type="text" id="exam-subject" placeholder="المادة" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                    <input type="datetime-local" id="exam-date" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                    <input type="text" id="exam-location" placeholder="المكان (اختياري)" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                    <button onclick="window.addExam()" class="w-full bg-gradient-to-r from-primary-500 to-pink-500 text-white py-4 rounded-xl font-bold hover:shadow-lg transition">
                        <i class="fas fa-calendar-plus ml-2"></i>إضافة الامتحان
                    </button>
                </div>
            </div>
            <div id="exams-list" class="space-y-3"></div>
        </div>
    `;

    // تحميل الامتحانات الموجودة
    try {
        const examsSnap = await getDocs(query(collection(db, "exams"), orderBy("date", "asc")));
        const list = document.getElementById('exams-list');

        if (examsSnap.empty) {
            list.innerHTML = '<p class="text-center text-surface-500 py-6">لا توجد امتحانات مجدولة</p>';
            return;
        }

        let html = '<h3 class="font-bold text-lg mb-4 dark:text-white"><i class="fas fa-list ml-2"></i>الامتحانات المجدولة</h3>';
        examsSnap.forEach(d => {
            const exam = d.data();
            const examDate = exam.date?.toDate?.() || new Date(exam.date);
            html += `
                <div class="bg-white dark:bg-surface-800 p-4 rounded-xl shadow flex items-center justify-between">
                    <div>
                        <div class="font-bold dark:text-white">${exam.title}</div>
                        <div class="text-sm text-surface-500">${exam.subject || ''} • ${examDate.toLocaleDateString('ar-EG')}</div>
                    </div>
                    <button onclick="window.deleteExam('${d.id}')" class="text-red-500 hover:bg-red-100 p-2 rounded-lg transition">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        });
        list.innerHTML = html;
    } catch (e) {
        console.error('Load exams error:', e);
    }
};
window.openAddExamView = openAddExamView;

window.addExam = async () => {
    const title = document.getElementById('exam-title').value.trim();
    const subject = document.getElementById('exam-subject').value.trim();
    const dateStr = document.getElementById('exam-date').value;
    const location = document.getElementById('exam-location').value.trim();

    if (!title || !dateStr) return alert('يرجى إدخال العنوان والتاريخ');

    try {
        await addDoc(collection(db, "exams"), {
            title,
            subject,
            date: new Date(dateStr),
            location,
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser.email
        });
        await logAdminAction('add_exam', '', title, `إضافة امتحان: ${title} (${subject})`);
        alert('✅ تم إضافة الامتحان');
        openAddExamView();
    } catch (e) {
        console.error(e);
        alert('فشل الإضافة');
    }
};

window.deleteExam = async (examId) => {
    if (!confirm('حذف هذا الامتحان؟')) return;
    try {
        await deleteDoc(doc(db, "exams", examId));
        await logAdminAction('delete_exam', '', examId, `حذف امتحان: ${examId}`);
        openAddExamView();
    } catch (e) {
        console.error(e);
        alert('فشل الحذف');
    }
};

// ============================================================
// بنك الأسئلة (Question Bank View)
// ============================================================
export const openQuestionBankView = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '📝 بنك الأسئلة';
    const content = document.getElementById('admin-view-content');

    content.innerHTML = `
        <div class="max-w-3xl mx-auto">
            <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg mb-6">
                <h3 class="font-bold text-lg mb-4 dark:text-white"><i class="fas fa-plus ml-2 text-primary-500"></i>إضافة سؤال جديد</h3>
                <div class="space-y-4">
                    <input type="text" id="q-subject" placeholder="المادة" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                    <input type="text" id="q-year" placeholder="السنة (مثال: 2024)" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                    <textarea id="q-question" placeholder="نص السؤال" rows="3" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white"></textarea>
                    <textarea id="q-answer" placeholder="الإجابة النموذجية" rows="3" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white"></textarea>
                    <button onclick="window.addQuestion()" class="w-full bg-gradient-to-r from-primary-500 to-primary-600 text-white py-4 rounded-xl font-bold hover:shadow-lg transition">
                        <i class="fas fa-plus ml-2"></i>إضافة السؤال
                    </button>
                </div>
            </div>
            <div id="questions-list"></div>
        </div>
    `;

    // تحميل الأسئلة
    try {
        const questionsSnap = await getDocs(collection(db, "question_bank"));
        const list = document.getElementById('questions-list');

        if (questionsSnap.empty) {
            list.innerHTML = '<p class="text-center text-surface-500 py-6">لا توجد أسئلة في البنك</p>';
            return;
        }

        let html = '<h3 class="font-bold text-lg mb-4 dark:text-white"><i class="fas fa-list ml-2"></i>الأسئلة المتاحة</h3><div class="space-y-4">';
        questionsSnap.forEach(d => {
            const q = d.data();
            html += `
                <div class="bg-white dark:bg-surface-800 p-4 rounded-xl shadow">
                    <div class="flex justify-between items-start mb-2">
                        <span class="bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-bold">${q.subject} - ${q.year}</span>
                        <button onclick="window.deleteQuestion('${d.id}')" class="text-red-500 hover:bg-red-100 p-2 rounded-lg transition"><i class="fas fa-trash"></i></button>
                    </div>
                    <p class="font-bold dark:text-white mb-2">${q.question}</p>
                    <details class="text-sm text-surface-600 dark:text-surface-400">
                        <summary class="cursor-pointer text-accent-600 font-bold">عرض الإجابة</summary>
                        <p class="mt-2 p-3 bg-accent-50 dark:bg-accent-900/30 rounded-lg">${q.answer}</p>
                    </details>
                </div>
            `;
        });
        html += '</div>';
        list.innerHTML = html;
    } catch (e) {
        console.error('Load questions error:', e);
    }
};
window.openQuestionBankView = openQuestionBankView;

window.addQuestion = async () => {
    const subject = document.getElementById('q-subject').value.trim();
    const year = document.getElementById('q-year').value.trim();
    const question = document.getElementById('q-question').value.trim();
    const answer = document.getElementById('q-answer').value.trim();

    if (!subject || !question) return alert('يرجى إدخال المادة والسؤال');

    try {
        await addDoc(collection(db, "question_bank"), {
            subject, year, question, answer,
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser.email
        });
        alert('✅ تم إضافة السؤال');
        openQuestionBankView();
    } catch (e) {
        console.error(e);
        alert('فشل الإضافة');
    }
};

window.deleteQuestion = async (qId) => {
    if (!confirm('حذف هذا السؤال؟')) return;
    try {
        await deleteDoc(doc(db, "question_bank", qId));
        openQuestionBankView();
    } catch (e) {
        console.error(e);
        alert('فشل الحذف');
    }
};

// ============================================================
// لوحة تتبع الأجهزة (Device Sessions Dashboard)
// ============================================================
export const openDeviceSessionsView = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '📱 إدارة الأجهزة المتصلة';
    const content = document.getElementById('admin-view-content');

    content.innerHTML = '<div class="text-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-primary-600"></i><p class="mt-4 text-surface-500">جاري تحميل جلسات الأجهزة...</p></div>';

    try {
        const sessionsSnap = await getDocs(collection(db, "device_sessions"));

        // تجميع الجلسات حسب المستخدم
        const userSessions = {};
        sessionsSnap.forEach(d => {
            const s = d.data();
            if (!userSessions[s.userId]) {
                userSessions[s.userId] = { name: s.userName, photo: s.userPhoto, sessions: [] };
            }
            userSessions[s.userId].sessions.push({ id: d.id, ...s });
        });

        const usersWithMultiple = Object.entries(userSessions).filter(([, v]) => v.sessions.length >= 2);
        const totalSessions = sessionsSnap.size;
        const totalUsers = Object.keys(userSessions).length;

        content.innerHTML = `
            <!-- إحصائيات -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-5 rounded-2xl shadow-lg">
                    <div class="text-4xl font-black">${totalSessions}</div>
                    <div class="text-sm opacity-80 font-bold">إجمالي الجلسات</div>
                </div>
                <div class="bg-gradient-to-br from-accent-500 to-accent-600 text-white p-5 rounded-2xl shadow-lg">
                    <div class="text-4xl font-black">${totalUsers}</div>
                    <div class="text-sm opacity-80 font-bold">مستخدم نشط</div>
                </div>
                <div class="bg-gradient-to-br from-orange-500 to-red-600 text-white p-5 rounded-2xl shadow-lg">
                    <div class="text-4xl font-black">${usersWithMultiple.length}</div>
                    <div class="text-sm opacity-80 font-bold">لديهم أكثر من جهاز</div>
                </div>
                <div class="bg-gradient-to-br from-primary-500 to-pink-600 text-white p-5 rounded-2xl shadow-lg">
                    <div class="text-4xl font-black">2</div>
                    <div class="text-sm opacity-80 font-bold">الحد الأقصى للأجهزة</div>
                </div>
            </div>
            
            <!-- أزرار التحكم -->
            <div class="flex gap-3 mb-6">
                <button onclick="window.openDeviceSessionsView()" class="bg-primary-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-primary-700 transition flex items-center gap-2">
                    <i class="fas fa-sync-alt"></i> تحديث
                </button>
                <button onclick="window.clearInactiveSessions()" class="bg-red-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-red-700 transition flex items-center gap-2">
                    <i class="fas fa-broom"></i> تنظيف الجلسات غير النشطة
                </button>
            </div>
            
            <!-- قائمة المستخدمين -->
            <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-lg overflow-hidden border dark:border-surface-700">
                <table class="w-full text-sm text-right">
                    <thead class="bg-surface-50 dark:bg-surface-700/50 text-surface-500 dark:text-surface-300 font-bold uppercase text-xs">
                        <tr>
                            <th class="px-6 py-4">المستخدم</th>
                            <th class="px-4 py-4 text-center">الأجهزة</th>
                            <th class="px-6 py-4">آخر نشاط</th>
                            <th class="px-4 py-4 text-center">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y dark:divide-surface-700">
                        ${Object.entries(userSessions).map(([uid, data]) => {
            const sess = data.sessions.sort((a, b) => (b.lastActive?.toDate?.() || 0) - (a.lastActive?.toDate?.() || 0));
            const lastActive = sess[0]?.lastActive?.toDate?.() || null;
            const lastStr = lastActive ? lastActive.toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
            const isMultiple = sess.length >= 2;

            return `
                                <tr class="group hover:bg-surface-50 dark:hover:bg-surface-700/50 transition ${isMultiple ? 'bg-orange-50 dark:bg-orange-900/10' : ''}">
                                    <td class="px-6 py-4">
                                        <div class="flex items-center gap-3">
                                            <img src="${data.photo || 'https://ui-avatars.com/api/?name=' + (data.name || 'U')}" class="w-10 h-10 rounded-full border-2 border-white shadow">
                                            <div>
                                                <a href="#profile/${uid}" class="font-bold dark:text-white hover:text-primary-600">${data.name || 'مستخدم'}</a>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="px-4 py-4 text-center">
                                        <span class="px-3 py-1 rounded-full font-black text-sm ${isMultiple ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400' : 'bg-accent-100 text-accent-600'}">${sess.length}</span>
                                    </td>
                                    <td class="px-6 py-4 text-surface-500 text-xs">${lastStr}</td>
                                    <td class="px-4 py-4">
                                        <div class="flex justify-center gap-2">
                                            <button onclick="window.showUserSessions('${uid}')" class="w-8 h-8 bg-primary-100 text-primary-600 rounded-lg hover:bg-primary-200 transition flex items-center justify-center" title="عرض التفاصيل">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            <button onclick="window.forceLogoutUser('${uid}')" class="w-8 h-8 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition flex items-center justify-center" title="تسجيل خروج من كل الأجهزة">
                                                <i class="fas fa-sign-out-alt"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        console.error('Device sessions error:', e);
        content.innerHTML = '<p class="text-center text-red-500 p-10">حدث خطأ في تحميل البيانات</p>';
    }
};

window.openDeviceSessionsView = openDeviceSessionsView;

// ============================================================
// لوحة عرض جميع حالات الحظر بين المستخدمين (للأونر فقط)
// ============================================================
export const openBlocksDashboard = async () => {
    if (auth.currentUser?.email !== SUPER_ADMIN_EMAIL) {
        return alert('⛔ هذه الصفحة للأونر فقط');
    }

    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '🚫 سجل حظر المراسلات';
    const content = document.getElementById('admin-view-content');

    content.innerHTML = '<div class="text-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-primary-600"></i><p class="mt-4 text-surface-500">جاري تحميل بيانات الحظر...</p></div>';

    try {
        // جلب كل المستخدمين الذين لديهم قائمة حظر
        const usersSnap = await getDocs(collection(db, "users"));
        const blockData = [];

        usersSnap.forEach(d => {
            const u = d.data();
            const blockedUsers = u.blockedUsers || [];
            if (blockedUsers.length > 0) {
                blockData.push({
                    blockerUid: d.id,
                    blockerName: u.displayName || 'مستخدم',
                    blockerPhoto: u.photoURL,
                    blockedUsers: blockedUsers
                });
            }
        });

        if (blockData.length === 0) {
            content.innerHTML = `
                <div class="flex flex-col items-center justify-center py-20 text-surface-400">
                    <i class="fas fa-handshake text-6xl mb-4 opacity-50"></i>
                    <p class="text-xl font-bold">لا توجد حالات حظر بين المستخدمين 🎉</p>
                </div>
            `;
            return;
        }

        // جلب أسماء المستخدمين المحظورين
        const allBlockedUids = [...new Set(blockData.flatMap(b => b.blockedUsers))];
        const blockedUsersInfo = {};

        for (const uid of allBlockedUids) {
            try {
                const userDoc = await getDoc(doc(db, "users", uid));
                if (userDoc.exists()) {
                    const d = userDoc.data();
                    blockedUsersInfo[uid] = { name: d.displayName || 'مستخدم', photo: d.photoURL };
                } else {
                    blockedUsersInfo[uid] = { name: 'مستخدم محذوف', photo: null };
                }
            } catch (e) {
                blockedUsersInfo[uid] = { name: 'غير معروف', photo: null };
            }
        }

        const totalBlocks = blockData.reduce((sum, b) => sum + b.blockedUsers.length, 0);

        content.innerHTML = `
            <!-- إحصائيات -->
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                <div class="bg-gradient-to-br from-red-500 to-rose-600 text-white p-5 rounded-2xl shadow-lg">
                    <div class="text-4xl font-black">${totalBlocks}</div>
                    <div class="text-sm opacity-80 font-bold">إجمالي حالات الحظر</div>
                </div>
                <div class="bg-gradient-to-br from-orange-500 to-amber-600 text-white p-5 rounded-2xl shadow-lg">
                    <div class="text-4xl font-black">${blockData.length}</div>
                    <div class="text-sm opacity-80 font-bold">مستخدم قام بالحظر</div>
                </div>
                <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-5 rounded-2xl shadow-lg">
                    <div class="text-4xl font-black">${allBlockedUids.length}</div>
                    <div class="text-sm opacity-80 font-bold">مستخدم محظور</div>
                </div>
            </div>

            <!-- جدول الحظر -->
            <div class="bg-white dark:bg-surface-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-surface-50 dark:bg-surface-700">
                            <tr>
                                <th class="px-6 py-4 text-right text-sm font-bold text-surface-700 dark:text-surface-300">الحاظر</th>
                                <th class="px-4 py-4 text-center text-sm font-bold text-surface-700 dark:text-surface-300">←</th>
                                <th class="px-6 py-4 text-right text-sm font-bold text-surface-700 dark:text-surface-300">المحظور</th>
                                <th class="px-4 py-4 text-center text-sm font-bold text-surface-700 dark:text-surface-300">إجراء</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y dark:divide-surface-700">
                            ${blockData.flatMap(blocker =>
            blocker.blockedUsers.map(blockedUid => {
                const blocked = blockedUsersInfo[blockedUid] || { name: 'غير معروف', photo: null };
                return `
                                        <tr class="hover:bg-surface-50 dark:hover:bg-surface-700/50 transition">
                                            <td class="px-6 py-4">
                                                <div class="flex items-center gap-3">
                                                    <img src="${blocker.blockerPhoto || 'https://ui-avatars.com/api/?name=' + blocker.blockerName}" class="w-10 h-10 rounded-full border-2 border-white shadow">
                                                    <a href="#profile/${blocker.blockerUid}" class="font-bold dark:text-white hover:text-primary-600">${blocker.blockerName}</a>
                                                </div>
                                            </td>
                                            <td class="px-4 py-4 text-center">
                                                <i class="fas fa-ban text-red-500 text-xl"></i>
                                            </td>
                                            <td class="px-6 py-4">
                                                <div class="flex items-center gap-3">
                                                    <img src="${blocked.photo || 'https://ui-avatars.com/api/?name=' + blocked.name}" class="w-10 h-10 rounded-full border-2 border-white shadow">
                                                    <a href="#profile/${blockedUid}" class="font-bold dark:text-white hover:text-primary-600">${blocked.name}</a>
                                                </div>
                                            </td>
                                            <td class="px-4 py-4 text-center">
                                                <button onclick="window.adminUnblock('${blocker.blockerUid}', '${blockedUid}')" class="px-3 py-1 bg-accent-100 text-accent-600 rounded-lg hover:bg-accent-200 transition text-sm font-bold">
                                                    <i class="fas fa-unlock ml-1"></i> فك الحظر
                                                </button>
                                            </td>
                                        </tr>
                                    `;
            })
        ).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (e) {
        console.error('Blocks dashboard error:', e);
        content.innerHTML = '<p class="text-center text-red-500 p-10">حدث خطأ في تحميل البيانات</p>';
    }
};

window.openBlocksDashboard = openBlocksDashboard;

// فك حظر بواسطة الأدمن
window.adminUnblock = async (blockerUid, blockedUid) => {
    if (!confirm('هل تريد فك الحظر بين هذين المستخدمين؟')) return;

    try {
        await updateDoc(doc(db, "users", blockerUid), { blockedUsers: arrayRemove(blockedUid) });
        await logAdminAction('admin_unblock', blockerUid, blockedUid, `فك حظر مراسلة بواسطة الأدمن`);
        window.showToast?.('✅ تم فك الحظر بنجاح', 'success');
        openBlocksDashboard();
    } catch (e) {
        console.error('Admin unblock error:', e);
        window.showToast?.('فشل فك الحظر', 'error');
    }
};

// تسجيل خروج من كل أجهزة مستخدم
window.forceLogoutUser = async (userId) => {
    if (!confirm('هل تريد تسجيل خروج هذا المستخدم من جميع أجهزته؟')) return;

    try {
        const snap = await getDocs(query(collection(db, "device_sessions"), where("userId", "==", userId)));
        const batch = [];
        snap.forEach(d => batch.push(deleteDoc(d.ref)));
        await Promise.all(batch);

        window.showToast?.('✅ تم تسجيل الخروج من جميع الأجهزة', 'success');
        await logAdminAction('force_logout', userId, '', `تسجيل خروج إجباري من ${snap.size} جهاز`);
        openDeviceSessionsView();
    } catch (e) {
        console.error(e);
        window.showToast?.('فشل العملية', 'error');
    }
};

// تنظيف الجلسات غير النشطة (أكثر من 7 أيام)
window.clearInactiveSessions = async () => {
    if (!confirm('سيتم حذف جميع الجلسات غير النشطة منذ أكثر من 7 أيام.\n\nمتابعة؟')) return;

    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const snap = await getDocs(collection(db, "device_sessions"));

        let deleteCount = 0;
        const batch = [];
        snap.forEach(d => {
            const lastActive = d.data().lastActive?.toDate?.();
            if (lastActive && lastActive < sevenDaysAgo) {
                batch.push(deleteDoc(d.ref));
                deleteCount++;
            }
        });

        await Promise.all(batch);
        await logAdminAction('clear_inactive_sessions', '', '', `تنظيف ${deleteCount} جلسة غير نشطة`);
        window.showToast?.(`✅ تم حذف ${deleteCount} جلسة غير نشطة`, 'success');
        openDeviceSessionsView();
    } catch (e) {
        console.error(e);
        window.showToast?.('فشل التنظيف', 'error');
    }
};

// عرض جلسات مستخدم معين
window.showUserSessions = async (userId) => {
    const snap = await getDocs(query(collection(db, "device_sessions"), where("userId", "==", userId)));

    let html = '';
    snap.forEach(d => {
        const s = d.data();
        const created = s.createdAt?.toDate?.()?.toLocaleString('ar-EG') || '-';
        const lastActive = s.lastActive?.toDate?.()?.toLocaleString('ar-EG') || '-';

        html += `
            <div class="bg-white dark:bg-surface-700 p-4 rounded-xl mb-3 border-r-4 border-primary-500">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-${s.deviceInfo?.os?.includes('Win') ? 'laptop' : s.deviceInfo?.os?.includes('Android') ? 'mobile-alt' : 'desktop'} text-primary-500"></i>
                        <span class="font-bold dark:text-white">${s.deviceInfo?.browser || 'Unknown'}</span>
                    </div>
                    <button onclick="window.deleteSession('${d.id}')" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
                </div>
                <div class="text-xs text-surface-500 space-y-1">
                    <p><strong>النظام:</strong> ${s.deviceInfo?.os || '-'}</p>
                    <p><strong>الشاشة:</strong> ${s.deviceInfo?.screen || '-'}</p>
                    <p><strong>إنشاء:</strong> ${created}</p>
                    <p><strong>آخر نشاط:</strong> ${lastActive}</p>
                </div>
            </div>
        `;
    });

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 w-full max-w-md max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl">
            <div class="bg-gradient-to-r from-primary-600 to-primary-600 text-white p-4 flex justify-between items-center">
                <h2 class="text-lg font-black">📱 أجهزة المستخدم (${snap.size})</h2>
                <button onclick="this.closest('.fixed').remove()" class="w-8 h-8 bg-white/20 rounded-full hover:bg-white/30 transition flex items-center justify-center"><i class="fas fa-times"></i></button>
            </div>
            <div class="p-4 overflow-y-auto max-h-[60vh]">${html || '<p class="text-center text-surface-400">لا توجد جلسات</p>'}</div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.deleteSession = async (sessionId) => {
    await deleteDoc(doc(db, "device_sessions", sessionId));
    window.showToast?.('تم حذف الجلسة', 'info');
    document.querySelector('.fixed.inset-0')?.remove();
    openDeviceSessionsView();
};

// ============================================================
// سجل تسجيلات الدخول (Login Logs Dashboard)
// ============================================================
export const openLoginLogsView = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '📋 سجل تسجيلات الدخول';
    const content = document.getElementById('admin-view-content');

    content.innerHTML = '<div class="text-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-primary-600"></i></div>';

    try {
        const logsSnap = await getDocs(query(collection(db, "login_logs"), orderBy("timestamp", "desc"), limit(200)));

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let todayLogins = 0;
        let newLogins = 0;

        logsSnap.forEach(d => {
            const data = d.data();
            const ts = data.timestamp?.toDate?.();
            if (ts && ts >= today) todayLogins++;
            if (data.action === 'new_login') newLogins++;
        });

        content.innerHTML = `
            <!-- إحصائيات -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="bg-gradient-to-br from-accent-500 to-accent-600 text-white p-5 rounded-2xl shadow-lg">
                    <div class="text-4xl font-black">${todayLogins}</div>
                    <div class="text-sm opacity-80 font-bold">دخول اليوم</div>
                </div>
                <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-5 rounded-2xl shadow-lg">
                    <div class="text-4xl font-black">${newLogins}</div>
                    <div class="text-sm opacity-80 font-bold">تسجيلات جديدة</div>
                </div>
                <div class="bg-gradient-to-br from-primary-500 to-pink-600 text-white p-5 rounded-2xl shadow-lg">
                    <div class="text-4xl font-black">${logsSnap.size}</div>
                    <div class="text-sm opacity-80 font-bold">إجمالي السجلات</div>
                </div>
            </div>
            
            <!-- الجدول -->
            <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-lg overflow-hidden border dark:border-surface-700">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-right min-w-[700px]">
                        <thead class="bg-surface-50 dark:bg-surface-700/50 text-surface-500 dark:text-surface-300 font-bold uppercase text-xs">
                            <tr>
                                <th class="px-4 py-4">المستخدم</th>
                                <th class="px-4 py-4">الوقت</th>
                                <th class="px-4 py-4">المتصفح</th>
                                <th class="px-4 py-4">النظام</th>
                                <th class="px-4 py-4 text-center">النوع</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y dark:divide-surface-700">
                            ${logsSnap.docs.map(d => {
            const log = d.data();
            const ts = log.timestamp?.toDate?.();
            const timeStr = ts ? ts.toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
            const isNew = log.action === 'new_login';

            return `
                                    <tr class="group hover:bg-surface-50 dark:hover:bg-surface-700/50 transition">
                                        <td class="px-4 py-3">
                                            <div>
                                                <a href="#profile/${log.userId}" class="font-bold dark:text-white hover:text-primary-600">${log.userName || 'مجهول'}</a>
                                                <p class="text-xs text-surface-400">${log.userEmail || ''}</p>
                                            </div>
                                        </td>
                                        <td class="px-4 py-3 text-surface-500 text-xs">${timeStr}</td>
                                        <td class="px-4 py-3 text-surface-600 dark:text-surface-300">${log.deviceInfo?.browser || '-'}</td>
                                        <td class="px-4 py-3 text-surface-500 text-xs">${log.deviceInfo?.os || '-'}</td>
                                        <td class="px-4 py-3 text-center">
                                            <span class="px-2 py-1 rounded-full text-xs font-bold ${isNew ? 'bg-accent-100 text-accent-600' : 'bg-primary-100 text-primary-600'}">${isNew ? 'جديد' : 'تحديث'}</span>
                                        </td>
                                    </tr>
                                `;
        }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (e) {
        console.error('Login logs error:', e);
        content.innerHTML = '<p class="text-center text-red-500 p-10">حدث خطأ في تحميل السجلات</p>';
    }
};

window.openLoginLogsView = openLoginLogsView;

// ============================================================
// 📊 لوحة الإحصائيات المتقدمة (Advanced Statistics Dashboard)
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
        // جلب البيانات
        const usersSnap = await getDocs(collection(db, "users"));
        const sectionsSnap = await getDocs(collection(db, "study_sections"));
        const scoresSnap = await getDocs(query(collection(db, "user_scores"), limit(500)));

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

        // إحصائيات المستخدمين
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

        // إحصائيات المواد
        const subjectViews = {};
        scoresSnap.forEach(d => {
            const s = d.data();
            if (s.sectionTitle) {
                subjectViews[s.sectionTitle] = (subjectViews[s.sectionTitle] || 0) + 1;
            }
        });

        const topSubjects = Object.entries(subjectViews).sort((a, b) => b[1] - a[1]).slice(0, 5);

        content.innerHTML = `
            <!-- الإحصائيات الرئيسية -->
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
                <!-- المستخدمين الجدد -->
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
                
                <!-- أكثر المواد نشاطاً -->
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

// ============================================================
// 🚨 نظام البلاغات (Reports System)
// ============================================================
export const openReportsDashboard = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '🚨 إدارة البلاغات';
    const content = document.getElementById('admin-view-content');
    content.innerHTML = '<div class="text-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-red-600"></i></div>';

    try {
        const reportsSnap = await getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(100)));

        const pending = [];
        const resolved = [];
        reportsSnap.forEach(d => {
            const r = { id: d.id, ...d.data() };
            if (r.status === 'resolved') resolved.push(r);
            else pending.push(r);
        });

        content.innerHTML = `
            <!-- إحصائيات -->
            <div class="grid grid-cols-3 gap-4 mb-6">
                <div class="bg-red-100 dark:bg-red-900/30 p-4 rounded-2xl text-center">
                    <div class="text-3xl font-black text-red-600">${pending.length}</div>
                    <div class="text-xs text-surface-500 font-bold">بلاغ معلق</div>
                </div>
                <div class="bg-accent-100 dark:bg-accent-900/30 p-4 rounded-2xl text-center">
                    <div class="text-3xl font-black text-accent-600">${resolved.length}</div>
                    <div class="text-xs text-surface-500 font-bold">تم حله</div>
                </div>
                <div class="bg-primary-100 dark:bg-primary-900/30 p-4 rounded-2xl text-center">
                    <div class="text-3xl font-black text-primary-600">${reportsSnap.size}</div>
                    <div class="text-xs text-surface-500 font-bold">إجمالي</div>
                </div>
            </div>
            
            <!-- البلاغات المعلقة -->
            <h3 class="font-black text-lg mb-4 dark:text-white flex items-center gap-2">
                <i class="fas fa-exclamation-triangle text-red-500"></i> البلاغات المعلقة
            </h3>
            
            ${pending.length === 0 ? '<p class="text-center text-surface-400 p-8 bg-accent-50 dark:bg-accent-900/20 rounded-2xl">🎉 لا توجد بلاغات معلقة!</p>' : `
            <div class="space-y-4">
                ${pending.map(r => `
                    <div class="bg-white dark:bg-surface-800 p-4 rounded-2xl shadow border-r-4 border-red-500">
                        <div class="flex justify-between items-start mb-3">
                            <div>
                                <p class="font-bold dark:text-white">${r.reporterName || 'مجهول'}</p>
                                <p class="text-xs text-surface-400">${r.createdAt?.toDate?.()?.toLocaleString('ar-EG') || '-'}</p>
                            </div>
                            <span class="px-2 py-1 bg-red-100 text-red-600 rounded-full text-xs font-bold">${r.type || 'بلاغ'}</span>
                        </div>
                        <p class="text-sm text-surface-600 dark:text-surface-300 mb-3 bg-surface-50 dark:bg-surface-700 p-3 rounded-xl">${r.reason || 'لا يوجد سبب'}</p>
                        <div class="flex gap-2">
                            <button onclick="window.resolveReport('${r.id}')" class="flex-1 bg-accent-600 text-white py-2 rounded-xl font-bold text-sm hover:bg-accent-700 transition">
                                <i class="fas fa-check"></i> تم الحل
                            </button>
                            ${r.reportedUserId ? `<button onclick="window.banReportedUser('${r.reportedUserId}', '${r.id}')" class="bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-700 transition">
                                <i class="fas fa-ban"></i> حظر
                            </button>` : ''}
                            <button onclick="window.deleteReport('${r.id}')" class="bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300 px-4 py-2 rounded-xl font-bold text-sm hover:bg-surface-300 transition">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            `}
        `;
    } catch (e) {
        console.error('Reports error:', e);
        content.innerHTML = '<p class="text-center text-red-500 p-10">حدث خطأ في تحميل البلاغات</p>';
    }
};

window.openReportsDashboard = openReportsDashboard;

window.resolveReport = async (reportId) => {
    await updateDoc(doc(db, "reports", reportId), { status: 'resolved', resolvedAt: new Date() });
    await logAdminAction('resolve_report', '', reportId, `حل بلاغ: ${reportId}`);
    window.showToast?.('تم حل البلاغ ✅', 'success');
    openReportsDashboard();
};

window.deleteReport = async (reportId) => {
    if (confirm('حذف هذا البلاغ؟')) {
        await deleteDoc(doc(db, "reports", reportId));
        openReportsDashboard();
    }
};

window.banReportedUser = async (userId, reportId) => {
    if (confirm('هل تريد حظر هذا المستخدم؟')) {
        await updateDoc(doc(db, "users", userId), { isBanned: true, bannedAt: new Date(), banReason: 'بسبب بلاغ' });
        await updateDoc(doc(db, "reports", reportId), { status: 'resolved', action: 'banned' });
        window.showToast?.('تم حظر المستخدم ⛔', 'success');
        openReportsDashboard();
    }
};

// دالة للإبلاغ (تُستخدم من أي مكان)
window.reportUser = async (userId, userName, reason, type = 'user') => {
    const user = auth.currentUser;
    if (!user) return;

    await addDoc(collection(db, "reports"), {
        reporterId: user.uid,
        reporterName: user.displayName,
        reportedUserId: userId,
        reportedUserName: userName,
        reason,
        type,
        status: 'pending',
        createdAt: serverTimestamp()
    });

    window.showToast?.('تم إرسال البلاغ ✅', 'success');
};

// دالة عرض مودال الإبلاغ عن مستخدم
window.showReportUserModal = (userId, userName) => {
    const existingModal = document.getElementById('report-user-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'report-user-modal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-2xl max-w-md w-full p-6 transform scale-100">
            <div class="flex justify-between items-center mb-4">
                <h3 class="font-black text-lg dark:text-white flex items-center gap-2">
                    <i class="fas fa-flag text-red-500"></i> إبلاغ عن ${userName}
                </h3>
                <button onclick="document.getElementById('report-user-modal').remove()" class="w-8 h-8 bg-surface-100 dark:bg-surface-700 rounded-full flex items-center justify-center hover:bg-surface-200 dark:hover:bg-surface-600">
                    <i class="fas fa-times text-surface-500"></i>
                </button>
            </div>
            
            <div class="space-y-3 mb-4">
                <label class="flex items-center p-3 bg-surface-50 dark:bg-surface-700 rounded-xl cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-600">
                    <input type="radio" name="report-reason" value="spam" class="ml-3 accent-red-500">
                    <span class="dark:text-white font-bold">🔄 سبام / رسائل مزعجة</span>
                </label>
                <label class="flex items-center p-3 bg-surface-50 dark:bg-surface-700 rounded-xl cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-600">
                    <input type="radio" name="report-reason" value="inappropriate" class="ml-3 accent-red-500">
                    <span class="dark:text-white font-bold">🚫 محتوى غير لائق</span>
                </label>
                <label class="flex items-center p-3 bg-surface-50 dark:bg-surface-700 rounded-xl cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-600">
                    <input type="radio" name="report-reason" value="harassment" class="ml-3 accent-red-500">
                    <span class="dark:text-white font-bold">😡 تحرش / إساءة</span>
                </label>
                <label class="flex items-center p-3 bg-surface-50 dark:bg-surface-700 rounded-xl cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-600">
                    <input type="radio" name="report-reason" value="fake" class="ml-3 accent-red-500">
                    <span class="dark:text-white font-bold">🎭 حساب مزيف</span>
                </label>
                <label class="flex items-center p-3 bg-surface-50 dark:bg-surface-700 rounded-xl cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-600">
                    <input type="radio" name="report-reason" value="other" class="ml-3 accent-red-500">
                    <span class="dark:text-white font-bold">📝 سبب آخر</span>
                </label>
            </div>
            
            <textarea id="report-other-reason" placeholder="اكتب تفاصيل إضافية (اختياري)..." class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white text-sm hidden" rows="2"></textarea>
            
            <button id="submit-report-btn" class="w-full bg-red-600 text-white py-3 rounded-xl font-bold mt-4 hover:bg-red-700 transition">
                <i class="fas fa-paper-plane"></i> إرسال البلاغ
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    // عرض حقل السبب الآخر
    document.querySelectorAll('input[name="report-reason"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const otherTextarea = document.getElementById('report-other-reason');
            otherTextarea.classList.toggle('hidden', radio.value !== 'other');
        });
    });

    // إرسال البلاغ
    document.getElementById('submit-report-btn').onclick = async () => {
        const selected = document.querySelector('input[name="report-reason"]:checked');
        if (!selected) {
            alert('اختر سبب البلاغ');
            return;
        }

        const reasonMap = {
            'spam': 'سبام / رسائل مزعجة',
            'inappropriate': 'محتوى غير لائق',
            'harassment': 'تحرش / إساءة',
            'fake': 'حساب مزيف',
            'other': document.getElementById('report-other-reason').value || 'سبب آخر'
        };

        await window.reportUser(userId, userName, reasonMap[selected.value], 'user');
        modal.remove();
    };

    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};

// ============================================================
// ⏰ الإشعارات المجدولة (Scheduled Notifications)
// ============================================================
export const openScheduledNotifications = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '⏰ الإشعارات المجدولة';
    const content = document.getElementById('admin-view-content');
    content.innerHTML = '<div class="text-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-primary-600"></i></div>';

    try {
        const notifsSnap = await getDocs(query(collection(db, "scheduled_notifications"), orderBy("scheduledFor", "desc")));

        content.innerHTML = `
            <!-- إنشاء إشعار جديد -->
            <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700 mb-6">
                <h3 class="font-black text-lg mb-4 dark:text-white">➕ إنشاء إشعار مجدول</h3>
                <div class="grid md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label class="block text-xs font-bold mb-1 dark:text-surface-300">العنوان:</label>
                        <input type="text" id="sched-title" placeholder="عنوان الإشعار" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-bold">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 dark:text-surface-300">الوقت المجدول:</label>
                        <input type="datetime-local" id="sched-time" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                    </div>
                </div>
                <div class="mb-4">
                    <label class="block text-xs font-bold mb-1 dark:text-surface-300">المحتوى:</label>
                    <textarea id="sched-body" placeholder="نص الإشعار..." class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white h-20"></textarea>
                </div>
                <button onclick="window.createScheduledNotification()" class="w-full bg-primary-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-primary-700 transition">
                    <i class="fas fa-clock"></i> جدولة الإشعار
                </button>
            </div>
            
            <!-- الإشعارات المجدولة -->
            <h3 class="font-black text-lg mb-4 dark:text-white">📋 الإشعارات المجدولة</h3>
            ${notifsSnap.empty ? '<p class="text-center text-surface-400 p-8 bg-surface-50 dark:bg-surface-700 rounded-2xl">لا توجد إشعارات مجدولة</p>' : `
            <div class="space-y-3">
                ${notifsSnap.docs.map(d => {
            const n = d.data();
            const schedTime = n.scheduledFor?.toDate?.();
            const isPast = schedTime && schedTime < new Date();
            return `
                        <div class="bg-white dark:bg-surface-800 p-4 rounded-2xl shadow border-r-4 ${isPast ? 'border-accent-500' : 'border-yellow-500'}">
                            <div class="flex justify-between items-start">
                                <div>
                                    <p class="font-bold dark:text-white">${n.title}</p>
                                    <p class="text-sm text-surface-500">${n.body}</p>
                                    <p class="text-xs text-surface-400 mt-1">
                                        <i class="fas fa-clock"></i> ${schedTime?.toLocaleString('ar-EG') || '-'}
                                        ${isPast ? '<span class="text-accent-500 mr-2">✓ تم الإرسال</span>' : '<span class="text-yellow-500 mr-2">⏳ قيد الانتظار</span>'}
                                    </p>
                                </div>
                                <div class="flex gap-2">
                                    ${!isPast ? `<button onclick="window.sendScheduledNow('${d.id}')" class="bg-accent-600 text-white px-3 py-1 rounded-lg text-xs font-bold"><i class="fas fa-paper-plane"></i></button>` : ''}
                                    <button onclick="window.deleteScheduledNotif('${d.id}')" class="bg-red-100 text-red-600 px-3 py-1 rounded-lg text-xs font-bold"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
            `}
        `;
    } catch (e) {
        console.error('Scheduled notifications error:', e);
        content.innerHTML = '<p class="text-center text-red-500 p-10">حدث خطأ</p>';
    }
};

window.openScheduledNotifications = openScheduledNotifications;

window.createScheduledNotification = async () => {
    const title = document.getElementById('sched-title').value.trim();
    const body = document.getElementById('sched-body').value.trim();
    const time = document.getElementById('sched-time').value;

    if (!title || !body || !time) return alert('أكمل جميع الحقول');

    await addDoc(collection(db, "scheduled_notifications"), {
        title,
        body,
        scheduledFor: new Date(time),
        sent: false,
        createdAt: serverTimestamp()
    });

    window.showToast?.('تم جدولة الإشعار ✅', 'success');
    openScheduledNotifications();
};

window.sendScheduledNow = async (notifId) => {
    const notifDoc = await getDoc(doc(db, "scheduled_notifications", notifId));
    if (!notifDoc.exists()) return;

    const n = notifDoc.data();
    // إرسال الإشعار لكل المستخدمين
    const usersSnap = await getDocs(collection(db, "users"));
    const batch = [];
    usersSnap.forEach(u => {
        batch.push(addDoc(collection(db, "notifications"), {
            userId: u.id,
            title: n.title,
            body: n.body,
            type: 'scheduled',
            read: false,
            createdAt: serverTimestamp()
        }));
    });

    await Promise.all(batch);
    await updateDoc(doc(db, "scheduled_notifications", notifId), { sent: true, sentAt: serverTimestamp() });

    window.showToast?.(`تم إرسال الإشعار لـ ${usersSnap.size} مستخدم ✅`, 'success');
    openScheduledNotifications();
};

window.deleteScheduledNotif = async (id) => {
    if (confirm('حذف هذا الإشعار؟')) {
        await deleteDoc(doc(db, "scheduled_notifications", id));
        openScheduledNotifications();
    }
};

// ============================================================
// 📤 التصدير المتقدم (Advanced Export)
// ============================================================
export const openAdvancedExport = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '📤 التصدير المتقدم';
    const content = document.getElementById('admin-view-content');

    content.innerHTML = `
        <div class="grid md:grid-cols-2 gap-6">
            <!-- تصدير بيانات مستخدم -->
            <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                <h3 class="font-black text-lg mb-4 dark:text-white flex items-center gap-2">
                    <i class="fas fa-user text-primary-500"></i> تصدير بيانات مستخدم
                </h3>
                <p class="text-sm text-surface-500 mb-4">تصدير كل بيانات مستخدم معين (معلوماته، درجاته، نشاطه)</p>
                <input type="text" id="export-user-email" placeholder="إيميل المستخدم" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white mb-4 font-mono text-sm">
                <button onclick="window.exportUserData()" class="w-full bg-primary-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-primary-700 transition">
                    <i class="fas fa-download"></i> تصدير JSON
                </button>
            </div>
            
            <!-- تصدير إحصائيات شهرية -->
            <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                <h3 class="font-black text-lg mb-4 dark:text-white flex items-center gap-2">
                    <i class="fas fa-calendar text-accent-500"></i> تصدير إحصائيات شهرية
                </h3>
                <p class="text-sm text-surface-500 mb-4">تصدير إحصائيات المنصة لشهر معين</p>
                <input type="month" id="export-month" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white mb-4">
                <button onclick="window.exportMonthlyStats()" class="w-full bg-accent-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-accent-700 transition">
                    <i class="fas fa-file-excel"></i> تصدير Excel
                </button>
            </div>
            
            <!-- تصدير كل البيانات -->
            <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                <h3 class="font-black text-lg mb-4 dark:text-white flex items-center gap-2">
                    <i class="fas fa-database text-primary-500"></i> تصدير كل المستخدمين
                </h3>
                <p class="text-sm text-surface-500 mb-4">تصدير قائمة بكل المستخدمين وبياناتهم الأساسية</p>
                <button onclick="window.exportAllUsers()" class="w-full bg-primary-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-primary-700 transition">
                    <i class="fas fa-file-csv"></i> تصدير CSV
                </button>
            </div>
            
            <!-- تصدير الدرجات -->
            <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                <h3 class="font-black text-lg mb-4 dark:text-white flex items-center gap-2">
                    <i class="fas fa-graduation-cap text-orange-500"></i> تصدير كل الدرجات
                </h3>
                <p class="text-sm text-surface-500 mb-4">تصدير جميع درجات الاختبارات والواجبات</p>
                <button onclick="window.exportAllScores()" class="w-full bg-orange-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-orange-700 transition">
                    <i class="fas fa-file-excel"></i> تصدير Excel
                </button>
            </div>
        </div>
    `;
};

window.openAdvancedExport = openAdvancedExport;

window.exportUserData = async () => {
    const email = document.getElementById('export-user-email').value.trim();
    if (!email) return alert('أدخل إيميل المستخدم');

    try {
        const usersSnap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
        if (usersSnap.empty) return alert('المستخدم غير موجود');

        const userDoc = usersSnap.docs[0];
        const userData = { id: userDoc.id, ...userDoc.data() };

        // جلب درجاته
        const scoresSnap = await getDocs(query(collection(db, "user_scores"), where("userId", "==", userDoc.id)));
        userData.scores = [];
        scoresSnap.forEach(s => userData.scores.push(s.data()));

        // تحميل JSON
        const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user_${email.replace('@', '_')}_data.json`;
        a.click();

        window.showToast?.('تم تصدير البيانات ✅', 'success');
    } catch (e) {
        console.error(e);
        alert('حدث خطأ: ' + e.message);
    }
};

window.exportAllUsers = async () => {
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        let csv = 'الاسم,الإيميل,الكلية,القسم,آخر دخول,موثق\n';

        usersSnap.forEach(d => {
            const u = d.data();
            const emailVal = (auth.currentUser?.email === SUPER_ADMIN_EMAIL) ? (u.email || '') : 'مخفي';
            csv += `"${u.displayName || ''}","${emailVal}","${u.collegeId || ''}","${u.departmentId || ''}","${u.lastLogin?.toDate?.()?.toLocaleString('ar-EG') || ''}","${u.isVerified ? 'نعم' : 'لا'}"\n`;
        });

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `all_users_${new Date().toLocaleDateString('ar-EG')}.csv`;
        a.click();

        window.showToast?.(`تم تصدير ${usersSnap.size} مستخدم ✅`, 'success');
    } catch (e) {
        console.error(e);
        alert('حدث خطأ');
    }
};

window.exportAllScores = async () => {
    try {
        const scoresSnap = await getDocs(collection(db, "user_scores"));
        let csv = 'الطالب,الإيميل,الاختبار,المادة,الدرجة,من,التاريخ\n';

        scoresSnap.forEach(d => {
            const s = d.data();
            csv += `"${s.userName || ''}","${s.userEmail || ''}","${s.quizTitle || ''}","${s.sectionTitle || ''}","${s.score || 0}","${s.total || 0}","${s.date?.toDate?.()?.toLocaleString('ar-EG') || ''}"\n`;
        });

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `all_scores_${new Date().toLocaleDateString('ar-EG')}.csv`;
        a.click();

        window.showToast?.(`تم تصدير ${scoresSnap.size} درجة ✅`, 'success');
    } catch (e) {
        console.error(e);
        alert('حدث خطأ');
    }
};

window.exportMonthlyStats = async () => {
    const monthInput = document.getElementById('export-month').value;
    if (!monthInput) return alert('اختر الشهر');

    const [year, month] = monthInput.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    try {
        // جلب المستخدمين الجدد
        const usersSnap = await getDocs(collection(db, "users"));
        let newUsers = 0;
        let activeUsers = 0;

        usersSnap.forEach(d => {
            const u = d.data();
            const created = u.createdAt?.toDate?.() || u.lastLogin?.toDate?.();
            if (created && created >= startDate && created <= endDate) newUsers++;

            const lastLogin = u.lastLogin?.toDate?.();
            if (lastLogin && lastLogin >= startDate && lastLogin <= endDate) activeUsers++;
        });

        // جلب الدرجات
        const scoresSnap = await getDocs(collection(db, "user_scores"));
        let quizzesTaken = 0;
        let totalScore = 0;

        scoresSnap.forEach(d => {
            const s = d.data();
            const date = s.date?.toDate?.();
            if (date && date >= startDate && date <= endDate) {
                quizzesTaken++;
                totalScore += s.score || 0;
            }
        });

        const avgScore = quizzesTaken > 0 ? Math.round(totalScore / quizzesTaken) : 0;

        // إنشاء تقرير
        const report = `
تقرير شهر ${month}/${year}
========================
المستخدمين الجدد: ${newUsers}
المستخدمين النشطين: ${activeUsers}
إجمالي الاختبارات: ${quizzesTaken}
متوسط الدرجات: ${avgScore}
        `.trim();

        const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `monthly_report_${year}_${month}.txt`;
        a.click();

        window.showToast?.('تم تصدير التقرير ✅', 'success');
    } catch (e) {
        console.error(e);
        alert('حدث خطأ');
    }
};

// ============================================================
// 📚 إدارة المحتوى (Content Management) — نسخة محسّنة
// ============================================================
export const openContentManagement = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section', 'admin-settings-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '📚 إدارة المحتوى';
    const content = document.getElementById('admin-view-content');
    content.innerHTML = '<div class="text-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-primary-600"></i></div>';

    try {
        const snap = await getDocs(query(collection(db, "study_sections"), orderBy("createdAt", "desc")));

        // تصنيف المواد حسب الكليات والأقسام
        window._cmAllSections = [];
        window._cmGeneralSections = [];
        window._cmSectionsData = {};

        snap.forEach(d => {
            const data = d.data();
            const section = { id: d.id, ...data };
            window._cmAllSections.push(section);

            if (data.targets) {
                const isAll = data.targets.some(t => t.collegeId === 'all');
                if (isAll) {
                    window._cmGeneralSections.push(section);
                } else {
                    data.targets.forEach(t => {
                        if (!window._cmSectionsData[t.collegeId]) window._cmSectionsData[t.collegeId] = {};
                        if (!window._cmSectionsData[t.collegeId][t.departmentId]) window._cmSectionsData[t.collegeId][t.departmentId] = [];
                        if (!window._cmSectionsData[t.collegeId][t.departmentId].find(s => s.id === section.id)) {
                            window._cmSectionsData[t.collegeId][t.departmentId].push(section);
                        }
                    });
                }
            } else if (data.targetColleges && Array.isArray(data.targetColleges)) {
                if (data.targetColleges.includes('all')) {
                    window._cmGeneralSections.push(section);
                } else {
                    data.targetColleges.forEach(colId => {
                        if (!window._cmSectionsData[colId]) window._cmSectionsData[colId] = {};
                        if (!window._cmSectionsData[colId]['all']) window._cmSectionsData[colId]['all'] = [];
                        if (!window._cmSectionsData[colId]['all'].find(s => s.id === section.id)) {
                            window._cmSectionsData[colId]['all'].push(section);
                        }
                    });
                }
            } else {
                window._cmGeneralSections.push(section);
            }
        });

        // بناء الـ options لـ dropdowns في الـ modals
        const sectionOptions = snap.docs.map(d => `<option value="${d.id}">${d.data().title}</option>`).join('');

        content.innerHTML = `
            <style>
                .cm-tool-btn { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1rem; border-radius: 0.75rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; border: 1px solid transparent; white-space: nowrap; }
                .cm-tool-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .cm-folder { padding: 1.25rem; border-radius: 1.25rem; cursor: pointer; text-align: center; color: white; transition: all 0.2s; position: relative; overflow: hidden; }
                .cm-folder:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(0,0,0,0.15); }
            </style>

            <!-- شريط أدوات متقدمة -->
            <div class="mb-6 bg-white dark:bg-surface-800 p-4 rounded-2xl shadow-lg border dark:border-surface-700">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="font-black text-sm text-surface-600 dark:text-surface-300 flex items-center gap-2">
                        <i class="fas fa-tools text-primary-500"></i> أدوات متقدمة
                    </h4>
                    <span class="text-xs font-bold text-surface-400 bg-surface-100 dark:bg-surface-700 px-3 py-1 rounded-full">
                        <i class="fas fa-database text-primary-500 ml-1"></i> ${snap.size} مادة
                    </span>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button onclick="window._cmOpenToolModal('archive')" class="cm-tool-btn bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 border-amber-200 dark:border-amber-800">
                        <i class="fas fa-archive"></i> أرشفة مادة
                    </button>
                    <button onclick="window._cmOpenToolModal('move')" class="cm-tool-btn bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 hover:bg-primary-100 border-primary-200 dark:border-primary-800">
                        <i class="fas fa-exchange-alt"></i> نقل موضوعات
                    </button>
                    <button onclick="window._cmOpenToolModal('delete')" class="cm-tool-btn bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 border-red-200 dark:border-red-800">
                        <i class="fas fa-trash-alt"></i> حذف جماعي
                    </button>
                    <button onclick="window._cmOpenToolModal('restore')" class="cm-tool-btn bg-accent-50 dark:bg-accent-900/20 text-accent-700 dark:text-accent-400 hover:bg-accent-100 border-accent-200 dark:border-accent-800">
                        <i class="fas fa-undo-alt"></i> استعادة مؤرشف
                    </button>
                </div>
            </div>

            <!-- منطقة التصفح -->
            <div id="cm-browse-area"></div>

            <!-- Modal أدوات -->
            <div id="cm-tool-modal" class="hidden fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
                <div class="bg-white dark:bg-surface-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
                    <div id="cm-tool-modal-header" class="p-5 text-white flex items-center justify-between">
                        <h3 id="cm-tool-modal-title" class="font-black text-lg flex items-center gap-2"></h3>
                        <button onclick="document.getElementById('cm-tool-modal').classList.add('hidden')" class="hover:bg-white/20 p-2 rounded-full transition"><i class="fas fa-times"></i></button>
                    </div>
                    <div id="cm-tool-modal-body" class="p-6"></div>
                </div>
            </div>
        `;

        // عرض المستوى الجذري
        window._cmBrowseContent();

    } catch (e) {
        console.error('Content management error:', e);
        content.innerHTML = '<p class="text-center text-red-500 p-10">حدث خطأ في تحميل المحتوى</p>';
    }
};

window.openContentManagement = openContentManagement;

// ---- دالة التصفح الهرمي ----
window._cmBrowseContent = (collegeId = null, deptId = null) => {
    const area = document.getElementById('cm-browse-area');
    if (!area) return;

    let html = '';

    // ---- Breadcrumb ----
    html += `<div class="mb-4 flex items-center flex-wrap gap-2 bg-white dark:bg-surface-800 p-3 px-4 rounded-xl shadow-sm border dark:border-surface-700">
        <div class="flex items-center gap-2 text-sm flex-wrap">
            <button onclick="window._cmBrowseContent()" class="text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition">
                <i class="fas fa-home"></i> الرئيسية
            </button>`;

    if (collegeId) {
        const college = UNIVERSITY_STRUCTURE.find(c => c.id === collegeId);
        html += `<i class="fas fa-chevron-left text-surface-300 text-xs"></i>
            <button onclick="window._cmBrowseContent('${collegeId}')" class="${deptId ? 'text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30' : 'text-surface-600 dark:text-surface-300'} px-2 py-1 rounded-lg font-bold transition">
                🎓 ${college?.name || collegeId}
            </button>`;
    }
    if (deptId && collegeId) {
        const college = UNIVERSITY_STRUCTURE.find(c => c.id === collegeId);
        const dept = college?.departments.find(d => d.id === deptId);
        html += `<i class="fas fa-chevron-left text-surface-300 text-xs"></i>
            <span class="text-surface-600 dark:text-surface-300 font-bold px-2 py-1">📁 ${dept?.name || deptId}</span>`;
    }
    html += `</div></div>`;

    // ---- محتوى حسب المستوى ----
    if (!collegeId) {
        // المستوى الجذري: كليات + عامة
        let totalSections = window._cmGeneralSections.length;
        UNIVERSITY_STRUCTURE.forEach(c => {
            const cd = window._cmSectionsData[c.id];
            if (cd) Object.values(cd).forEach(arr => totalSections += arr.length);
        });

        html += `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">`;

        // المواد العامة
        if (window._cmGeneralSections.length > 0) {
            html += `<div onclick="window._cmShowGeneralSections()" class="cm-folder bg-gradient-to-br from-accent-600 to-primary-700 group">
                <div class="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition mx-auto">
                    <i class="fas fa-globe-africa text-3xl text-white"></i>
                </div>
                <h4 class="font-black text-base text-white">المواد العامة</h4>
                <p class="text-xs text-white/70 mt-1">${window._cmGeneralSections.length} مادة</p>
            </div>`;
        }

        // الكليات
        UNIVERSITY_STRUCTURE.forEach(college => {
            const collegeData = window._cmSectionsData[college.id];
            let count = 0;
            if (collegeData) Object.values(collegeData).forEach(depts => count += depts.length);

            html += `<div onclick="window._cmBrowseContent('${college.id}')" class="cm-folder ${count > 0 ? 'bg-gradient-to-br from-primary-600 to-primary-700' : 'bg-gradient-to-br from-surface-500 to-surface-600'} group">
                <div class="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition mx-auto">
                    <i class="fas fa-university text-3xl text-white"></i>
                </div>
                <h4 class="font-black text-sm text-white truncate">${college.name}</h4>
                <p class="text-xs text-white/70 mt-1">${count} مادة · ${college.departments.length} قسم</p>
            </div>`;
        });
        html += `</div>`;

    } else if (!deptId) {
        // مستوى الكلية: عرض الأقسام
        const college = UNIVERSITY_STRUCTURE.find(c => c.id === collegeId);
        const collegeData = window._cmSectionsData[collegeId] || {};

        let totalCollegeSections = 0;
        Object.values(collegeData).forEach(arr => totalCollegeSections += arr.length);

        html += `<div class="mb-3 text-sm font-bold text-surface-400"><i class="fas fa-university text-primary-500 ml-1"></i> ${totalCollegeSections} مادة في هذه الكلية</div>`;

        html += `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">`;
        college.departments.forEach(dept => {
            const deptSections = collegeData[dept.id] || [];
            const allSections = collegeData['all'] || [];
            const sections = [...deptSections, ...allSections.filter(s => !deptSections.find(d => d.id === s.id))];

            html += `<div onclick="window._cmBrowseContent('${collegeId}', '${dept.id}')" class="cm-folder ${sections.length > 0 ? 'bg-gradient-to-br from-primary-600 to-primary-700' : 'bg-gradient-to-br from-surface-500 to-surface-600'} group">
                <div class="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition mx-auto">
                    <i class="fas fa-folder text-3xl text-white"></i>
                </div>
                <h4 class="font-black text-sm text-white truncate">${dept.name}</h4>
                <p class="text-xs text-white/70 mt-1">${sections.length} مادة</p>
            </div>`;
        });
        html += `</div>`;

    } else {
        // مستوى القسم: عرض المواد
        const collegeData = window._cmSectionsData[collegeId] || {};
        const deptSections = collegeData[deptId] || [];
        const allSections = collegeData['all'] || [];
        const sections = [...deptSections, ...allSections.filter(s => !deptSections.find(d => d.id === s.id))];

        // بحث
        html += `<div class="mb-3 flex items-center gap-3">
            <div class="flex-1 relative">
                <i class="fas fa-search absolute top-1/2 -translate-y-1/2 right-3 text-surface-400 text-sm"></i>
                <input type="text" id="cm-search-input" placeholder="بحث في المواد..." class="w-full p-2.5 pr-9 border rounded-xl dark:bg-surface-700 dark:text-white dark:border-surface-600 text-sm outline-none focus:ring-2 focus:ring-primary-500" oninput="window._cmFilterSearch()">
            </div>
            <span class="text-sm font-bold text-surface-400 whitespace-nowrap">${sections.length} مادة</span>
        </div>`;

        if (sections.length === 0) {
            html += `<div class="text-center py-16 bg-surface-50 dark:bg-surface-800 rounded-2xl border-2 border-dashed dark:border-surface-700">
                <i class="fas fa-folder-open text-5xl text-surface-300 dark:text-surface-600 mb-4"></i>
                <p class="text-surface-400 font-bold">لا توجد مواد في هذا القسم</p>
            </div>`;
        } else {
            html += `<div id="cm-sections-list" class="grid grid-cols-1 md:grid-cols-2 gap-3">`;
            sections.forEach(s => {
                const createdAt = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
                const targetInfo = _cmGetTargetLabel(s);

                html += `<div class="cm-section-card flex justify-between items-center p-4 bg-white dark:bg-surface-800 rounded-2xl shadow-sm border border-surface-100 dark:border-surface-700 hover:shadow-md hover:border-primary-400 transition group" data-title="${s.title}">
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <div class="w-11 h-11 bg-primary-50 dark:bg-primary-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                            <i class="fas fa-book text-xl text-primary-500"></i>
                        </div>
                        <div class="min-w-0">
                            <span class="font-bold text-sm dark:text-white block truncate">${s.title}</span>
                            <div class="flex items-center gap-2 mt-0.5">
                                ${createdAt ? `<span class="text-[10px] text-surface-400"><i class="far fa-calendar-alt ml-1"></i>${createdAt}</span>` : ''}
                                <span class="text-[10px] text-primary-500 bg-primary-50 dark:bg-primary-900/20 px-1.5 py-0.5 rounded">${targetInfo}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-1.5 mr-2">
                        <button onclick="window.location.hash='admin/cms/${s.id}'" class="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 hover:bg-primary-600 hover:text-white transition flex items-center justify-center text-sm" title="فتح الدروس"><i class="fas fa-folder-open"></i></button>
                        <button onclick="window._cmArchiveSingle('${s.id}', '${s.title.replace(/'/g, "\\'")}')" class="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 hover:bg-amber-500 hover:text-white transition flex items-center justify-center text-sm" title="أرشفة"><i class="fas fa-archive"></i></button>
                        <button onclick="window._cmDeleteSingle('${s.id}', '${s.title.replace(/'/g, "\\'")}')" class="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-600 hover:text-white transition flex items-center justify-center text-sm" title="حذف"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            });
            html += `</div>`;
        }
    }

    area.innerHTML = html;
};

// عرض المواد العامة
window._cmShowGeneralSections = () => {
    const area = document.getElementById('cm-browse-area');
    if (!area) return;

    let html = `<div class="mb-4 flex items-center flex-wrap gap-2 bg-white dark:bg-surface-800 p-3 px-4 rounded-xl shadow-sm border dark:border-surface-700">
        <div class="flex items-center gap-2 text-sm">
            <button onclick="window._cmBrowseContent()" class="text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition">
                <i class="fas fa-home"></i> الرئيسية
            </button>
            <i class="fas fa-chevron-left text-surface-300 text-xs"></i>
            <span class="text-surface-600 dark:text-surface-300 font-bold px-2 py-1">📚 المواد العامة</span>
        </div>
        <span class="mr-auto text-sm font-bold text-surface-400">${window._cmGeneralSections.length} مادة</span>
    </div>`;

    // بحث
    html += `<div class="mb-3">
        <div class="relative">
            <i class="fas fa-search absolute top-1/2 -translate-y-1/2 right-3 text-surface-400 text-sm"></i>
            <input type="text" id="cm-search-input" placeholder="بحث في المواد العامة..." class="w-full p-2.5 pr-9 border rounded-xl dark:bg-surface-700 dark:text-white dark:border-surface-600 text-sm outline-none focus:ring-2 focus:ring-primary-500" oninput="window._cmFilterSearch()">
        </div>
    </div>`;

    html += `<div id="cm-sections-list" class="grid grid-cols-1 md:grid-cols-2 gap-3">`;
    window._cmGeneralSections.forEach(s => {
        const createdAt = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
        html += `<div class="cm-section-card flex justify-between items-center p-4 bg-white dark:bg-surface-800 rounded-2xl shadow-sm border border-surface-100 dark:border-surface-700 hover:shadow-md hover:border-accent-400 transition group" data-title="${s.title}">
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="w-11 h-11 bg-accent-50 dark:bg-accent-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i class="fas fa-book text-xl text-accent-500"></i>
                </div>
                <div class="min-w-0">
                    <span class="font-bold text-sm dark:text-white block truncate">${s.title}</span>
                    <div class="flex items-center gap-2 mt-0.5">
                        ${createdAt ? `<span class="text-[10px] text-surface-400"><i class="far fa-calendar-alt ml-1"></i>${createdAt}</span>` : ''}
                        <span class="text-[10px] text-accent-500 bg-accent-50 dark:bg-accent-900/20 px-1.5 py-0.5 rounded">كل الكليات</span>
                    </div>
                </div>
            </div>
            <div class="flex gap-1.5 mr-2">
                <button onclick="window.location.hash='admin/cms/${s.id}'" class="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 hover:bg-primary-600 hover:text-white transition flex items-center justify-center text-sm" title="فتح الدروس"><i class="fas fa-folder-open"></i></button>
                <button onclick="window._cmArchiveSingle('${s.id}', '${s.title.replace(/'/g, "\\'")}')" class="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 hover:bg-amber-500 hover:text-white transition flex items-center justify-center text-sm" title="أرشفة"><i class="fas fa-archive"></i></button>
                <button onclick="window._cmDeleteSingle('${s.id}', '${s.title.replace(/'/g, "\\'")}')" class="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-600 hover:text-white transition flex items-center justify-center text-sm" title="حذف"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    });
    html += `</div>`;
    area.innerHTML = html;
};

// بحث في المواد
window._cmFilterSearch = () => {
    const q = (document.getElementById('cm-search-input')?.value || '').trim().toLowerCase();
    document.querySelectorAll('.cm-section-card').forEach(card => {
        const title = (card.dataset.title || '').toLowerCase();
        card.style.display = title.includes(q) ? '' : 'none';
    });
};

// دالة مساعدة لعرض استهداف المادة
const _cmGetTargetLabel = (section) => {
    if (!section.targets) return section.collegeId || 'عام';
    if (section.targets.some(t => t.collegeId === 'all')) return 'كل الكليات';
    const colleges = [...new Set(section.targets.map(t => t.collegeId))];
    if (colleges.length === 1) {
        const col = UNIVERSITY_STRUCTURE.find(c => c.id === colleges[0]);
        return col?.name || colleges[0];
    }
    return `${colleges.length} كليات`;
};

// ---- فتح Modal الأدوات ----
window._cmOpenToolModal = async (tool) => {
    const modal = document.getElementById('cm-tool-modal');
    const header = document.getElementById('cm-tool-modal-header');
    const title = document.getElementById('cm-tool-modal-title');
    const body = document.getElementById('cm-tool-modal-body');
    modal.classList.remove('hidden');

    const sectionOptions = (window._cmAllSections || []).map(s => `<option value="${s.id}">${s.title}</option>`).join('');

    if (tool === 'archive') {
        header.className = 'p-5 text-white flex items-center justify-between bg-gradient-to-r from-amber-600 to-yellow-600';
        title.innerHTML = '<i class="fas fa-archive ml-2"></i> أرشفة مادة';
        body.innerHTML = `
            <p class="text-sm text-surface-500 dark:text-surface-400 mb-4">سيتم نقل المادة للأرشيف وإخفائها عن الطلاب. يمكنك استعادتها لاحقاً.</p>
            <select id="cm-archive-select" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white mb-4 font-bold">
                <option value="">اختر المادة</option>${sectionOptions}
            </select>
            <button onclick="window._cmDoArchive()" class="w-full bg-amber-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-amber-700 transition flex items-center justify-center gap-2">
                <i class="fas fa-archive"></i> أرشفة المادة
            </button>`;
    } else if (tool === 'move') {
        header.className = 'p-5 text-white flex items-center justify-between bg-gradient-to-r from-primary-600 to-primary-600';
        title.innerHTML = '<i class="fas fa-exchange-alt ml-2"></i> نقل موضوعات';
        body.innerHTML = `
            <p class="text-sm text-surface-500 dark:text-surface-400 mb-4">نقل كل الدروس من مادة إلى مادة أخرى.</p>
            <label class="block text-xs font-bold text-surface-500 mb-1">من مادة:</label>
            <select id="cm-move-from" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white mb-3 font-bold">
                <option value="">اختر المصدر</option>${sectionOptions}
            </select>
            <label class="block text-xs font-bold text-surface-500 mb-1">إلى مادة:</label>
            <select id="cm-move-to" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white mb-4 font-bold">
                <option value="">اختر الوجهة</option>${sectionOptions}
            </select>
            <button onclick="window._cmDoMove()" class="w-full bg-primary-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-primary-700 transition flex items-center justify-center gap-2">
                <i class="fas fa-arrow-right"></i> نقل الكل
            </button>`;
    } else if (tool === 'delete') {
        header.className = 'p-5 text-white flex items-center justify-between bg-gradient-to-r from-red-600 to-rose-600';
        title.innerHTML = '<i class="fas fa-trash-alt ml-2"></i> حذف جماعي';
        body.innerHTML = `
            <p class="text-sm text-red-400 mb-4 font-bold">⚠️ تحذير: سيتم حذف المادة وجميع دروسها نهائياً!</p>
            <select id="cm-delete-select" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white mb-4 font-bold">
                <option value="">اختر المادة</option>${sectionOptions}
            </select>
            <button onclick="window._cmDoBulkDelete()" class="w-full bg-red-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-red-700 transition flex items-center justify-center gap-2">
                <i class="fas fa-trash"></i> حذف نهائي
            </button>`;
    } else if (tool === 'restore') {
        header.className = 'p-5 text-white flex items-center justify-between bg-gradient-to-r from-accent-600 to-accent-600';
        title.innerHTML = '<i class="fas fa-undo-alt ml-2"></i> استعادة من الأرشيف';
        body.innerHTML = '<div class="text-center p-6"><i class="fas fa-spinner fa-spin text-2xl text-accent-600"></i></div>';

        try {
            const archivedSnap = await getDocs(collection(db, "archived_content"));
            if (archivedSnap.empty) {
                body.innerHTML = `<div class="text-center py-8">
                    <i class="fas fa-box-open text-4xl text-surface-300 mb-3"></i>
                    <p class="text-surface-400 font-bold">لا توجد مواد مؤرشفة</p>
                </div>`;
            } else {
                let archiveHtml = '<div class="space-y-2 max-h-64 overflow-y-auto">';
                archivedSnap.forEach(d => {
                    const data = d.data();
                    const archivedDate = data.archivedAt?.toDate ? data.archivedAt.toDate().toLocaleDateString('ar-EG') : '';
                    archiveHtml += `<div class="flex items-center justify-between p-3 bg-surface-50 dark:bg-surface-700 rounded-xl">
                        <div>
                            <p class="font-bold text-sm dark:text-white">${data.title || d.id}</p>
                            ${archivedDate ? `<p class="text-[10px] text-surface-400">أُرشفت: ${archivedDate}</p>` : ''}
                        </div>
                        <button onclick="window._cmRestoreArchived('${d.id}')" class="bg-accent-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-accent-700 transition">
                            <i class="fas fa-undo ml-1"></i>استعادة
                        </button>
                    </div>`;
                });
                archiveHtml += '</div>';
                body.innerHTML = archiveHtml;
            }
        } catch (e) {
            body.innerHTML = '<p class="text-red-500 text-center">حدث خطأ في تحميل المؤرشف</p>';
        }
    }
};

// ---- تنفيذ الأرشفة ----
window._cmDoArchive = async () => {
    const sectionId = document.getElementById('cm-archive-select')?.value;
    if (!sectionId) return alert('اختر المادة');
    if (!confirm('سيتم أرشفة هذه المادة وإخفائها من الطلاب. متابعة؟')) return;

    try {
        const sectionDoc = await getDoc(doc(db, "study_sections", sectionId));
        if (!sectionDoc.exists()) return alert('المادة غير موجودة');

        await setDoc(doc(db, "archived_content", sectionId), {
            ...sectionDoc.data(),
            archivedAt: serverTimestamp(),
            originalId: sectionId
        });
        await deleteDoc(doc(db, "study_sections", sectionId));

        document.getElementById('cm-tool-modal').classList.add('hidden');
        window.showToast?.('تم أرشفة المادة ✅', 'success');
        await logAdminAction('archive_section', '', sectionId, `أرشفة مادة: ${sectionDoc.data().title}`);
        openContentManagement();
    } catch (e) {
        console.error(e);
        alert('حدث خطأ أثناء الأرشفة');
    }
};

// أرشفة مباشرة من بطاقة المادة
window._cmArchiveSingle = async (id, title) => {
    if (!confirm(`أرشفة المادة "${title}"؟\nسيتم إخفائها عن الطلاب.`)) return;
    try {
        const sectionDoc = await getDoc(doc(db, "study_sections", id));
        if (!sectionDoc.exists()) return alert('المادة غير موجودة');

        await setDoc(doc(db, "archived_content", id), {
            ...sectionDoc.data(),
            archivedAt: serverTimestamp(),
            originalId: id
        });
        await deleteDoc(doc(db, "study_sections", id));

        window.showToast?.('تم أرشفة المادة ✅', 'success');
        await logAdminAction('archive_section', '', id, `أرشفة مادة: ${title}`);
        openContentManagement();
    } catch (e) {
        console.error(e);
        alert('حدث خطأ');
    }
};

// حذف مباشر من بطاقة المادة
window._cmDeleteSingle = async (id, title) => {
    if (!confirm(`⚠️ حذف المادة "${title}" وجميع دروسها نهائياً؟\n\nلا يمكن التراجع عن هذا الإجراء.`)) return;
    try {
        const subsSnap = await getDocs(collection(db, "study_sections", id, "subsections"));
        const deletePromises = [];
        subsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
        await Promise.all(deletePromises);
        await deleteDoc(doc(db, "study_sections", id));

        window.showToast?.(`تم حذف "${title}" ✅`, 'success');
        await logAdminAction('delete_section', '', id, `حذف مادة: ${title}`);
        openContentManagement();
    } catch (e) {
        console.error(e);
        alert('حدث خطأ أثناء الحذف');
    }
};

// ---- تنفيذ الحذف الجماعي ----
window._cmDoBulkDelete = async () => {
    const sectionId = document.getElementById('cm-delete-select')?.value;
    if (!sectionId) return alert('اختر المادة');

    const confirmText = prompt('⚠️ تحذير خطير!\n\nسيتم حذف كل محتوى هذه المادة نهائياً.\n\nاكتب "حذف" للتأكيد:');
    if (confirmText !== 'حذف') return;

    try {
        // حذف الموضوعات الفرعية (المسار الصحيح: subsections)
        const subsSnap = await getDocs(collection(db, "study_sections", sectionId, "subsections"));
        const batch = [];
        subsSnap.forEach(d => batch.push(deleteDoc(d.ref)));
        await Promise.all(batch);

        await deleteDoc(doc(db, "study_sections", sectionId));

        document.getElementById('cm-tool-modal').classList.add('hidden');
        window.showToast?.('تم الحذف ✅', 'success');
        await logAdminAction('bulk_delete_content', '', sectionId, `حذف مادة ومحتواها`);
        openContentManagement();
    } catch (e) {
        console.error(e);
        alert('حدث خطأ');
    }
};

// ---- تنفيذ النقل ----
window._cmDoMove = async () => {
    const fromId = document.getElementById('cm-move-from')?.value;
    const toId = document.getElementById('cm-move-to')?.value;

    if (!fromId || !toId) return alert('اختر المادتين');
    if (fromId === toId) return alert('اختر مادتين مختلفتين');
    if (!confirm('سيتم نقل كل الموضوعات من المادة الأولى للثانية. متابعة؟')) return;

    try {
        // المسار الصحيح: subsections (بدل sub_sections)
        const subsSnap = await getDocs(collection(db, "study_sections", fromId, "subsections"));

        for (const subDoc of subsSnap.docs) {
            const data = subDoc.data();
            await addDoc(collection(db, "study_sections", toId, "subsections"), data);
            await deleteDoc(subDoc.ref);
        }

        document.getElementById('cm-tool-modal').classList.add('hidden');
        window.showToast?.(`تم نقل ${subsSnap.size} موضوع ✅`, 'success');
        await logAdminAction('move_content', '', '', `نقل ${subsSnap.size} درس`);
        openContentManagement();
    } catch (e) {
        console.error(e);
        alert('حدث خطأ');
    }
};

// ---- استعادة من الأرشيف ----
window._cmRestoreArchived = async (archivedId) => {
    if (!confirm('استعادة هذه المادة وإعادتها للطلاب؟')) return;
    try {
        const archivedDoc = await getDoc(doc(db, "archived_content", archivedId));
        if (!archivedDoc.exists()) return alert('المادة غير موجودة في الأرشيف');

        const data = archivedDoc.data();
        const { archivedAt, originalId, ...sectionData } = data;

        await setDoc(doc(db, "study_sections", originalId || archivedId), {
            ...sectionData,
            restoredAt: serverTimestamp()
        });
        await deleteDoc(doc(db, "archived_content", archivedId));

        document.getElementById('cm-tool-modal').classList.add('hidden');
        window.showToast?.('تم استعادة المادة ✅', 'success');
        await logAdminAction('restore_section', '', archivedId, `استعادة مادة: ${data.title}`);
        openContentManagement();
    } catch (e) {
        console.error(e);
        alert('حدث خطأ في الاستعادة');
    }
};

// دوال قديمة للتوافق
window.archiveSection = () => window._cmOpenToolModal('archive');
window.bulkDeleteContent = () => window._cmOpenToolModal('delete');
window.moveContentBetweenSections = () => window._cmOpenToolModal('move');

// ============================================================
// 🎯 إدارة محاولات الكويزات (Quiz Attempts Management)
// ============================================================
export const openQuizAttemptsManager = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '🎯 إدارة محاولات الكويزات';
    const content = document.getElementById('admin-view-content');
    content.innerHTML = '<div class="text-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-primary-600"></i></div>';

    try {
        // جلب الكويزات
        const quizzesSnap = await getDocs(collection(db, "quizzes"));
        const quizOptions = quizzesSnap.docs.map(d => `<option value="${d.id}">${d.data().title || d.id}</option>`).join('');

        content.innerHTML = `
            <div class="grid md:grid-cols-2 gap-6 mb-8">
                <!-- إضافة محاولات لطالب -->
                <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                    <h3 class="font-black text-lg mb-4 dark:text-white flex items-center gap-2">
                        <i class="fas fa-user-plus text-accent-500"></i> إضافة محاولات لطالب
                    </h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold mb-1 dark:text-surface-300">الكويز:</label>
                            <select id="attempt-quiz" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                                <option value="">اختر الكويز</option>
                                ${quizOptions}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold mb-1 dark:text-surface-300">إيميل الطالب:</label>
                            <input type="email" id="attempt-email" placeholder="student@email.com" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-mono text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-bold mb-1 dark:text-surface-300">عدد المحاولات الإضافية:</label>
                            <input type="number" id="attempt-count" value="1" min="1" max="10" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                        </div>
                        <button onclick="window.grantExtraAttempts()" class="w-full bg-accent-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-accent-700 transition">
                            <i class="fas fa-plus-circle"></i> إضافة محاولات
                        </button>
                    </div>
                </div>
                
                <!-- إلغاء/إعادة كويز لطالب -->
                <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                    <h3 class="font-black text-lg mb-4 dark:text-white flex items-center gap-2">
                        <i class="fas fa-undo text-primary-500"></i> إلغاء نتيجة طالب
                    </h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold mb-1 dark:text-surface-300">الكويز:</label>
                            <select id="reset-quiz" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                                <option value="">اختر الكويز</option>
                                ${quizOptions}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold mb-1 dark:text-surface-300">إيميل الطالب:</label>
                            <input type="email" id="reset-email" placeholder="student@email.com" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-mono text-sm">
                        </div>
                        <button onclick="window.resetStudentQuiz()" class="w-full bg-primary-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-primary-700 transition">
                            <i class="fas fa-redo"></i> إعادة الكويز للطالب
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- إلغاء كويز لكلية كاملة -->
            <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg border dark:border-surface-700">
                <h3 class="font-black text-lg mb-4 dark:text-white flex items-center gap-2">
                    <i class="fas fa-university text-red-500"></i> إلغاء نتائج كلية كاملة
                </h3>
                <div class="grid md:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-xs font-bold mb-1 dark:text-surface-300">الكويز:</label>
                        <select id="college-reset-quiz" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                            <option value="">اختر الكويز</option>
                            ${quizOptions}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 dark:text-surface-300">الكلية:</label>
                        <select id="college-reset-id" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                            <option value="">اختر الكلية</option>
                            ${UNIVERSITY_STRUCTURE.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="flex items-end">
                        <button onclick="window.resetCollegeQuiz()" class="w-full bg-red-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-red-700 transition">
                            <i class="fas fa-trash-alt"></i> إلغاء نتائج الكلية
                        </button>
                    </div>
                </div>
                <p class="text-xs text-surface-400 mt-3">⚠️ سيتم حذف جميع نتائج طلاب الكلية المختارة في هذا الكويز</p>
            </div>
        `;
    } catch (e) {
        console.error('Quiz attempts manager error:', e);
        content.innerHTML = '<p class="text-center text-red-500 p-10">حدث خطأ</p>';
    }
};

window.openQuizAttemptsManager = openQuizAttemptsManager;

// إضافة محاولات إضافية لطالب
window.grantExtraAttempts = async () => {
    const quizId = document.getElementById('attempt-quiz').value;
    const email = document.getElementById('attempt-email').value.trim();
    const count = parseInt(document.getElementById('attempt-count').value) || 1;

    if (!quizId || !email) return alert('اختر الكويز وأدخل إيميل الطالب');

    try {
        // البحث عن الطالب
        const usersSnap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
        if (usersSnap.empty) return alert('الطالب غير موجود');

        const userId = usersSnap.docs[0].id;
        const userName = usersSnap.docs[0].data().displayName || email;

        // إضافة المحاولات الإضافية
        const extraAttemptsRef = doc(db, "quiz_extra_attempts", `${quizId}_${userId}`);
        const existing = await getDoc(extraAttemptsRef);
        const currentExtra = existing.exists() ? (existing.data().extraAttempts || 0) : 0;

        await setDoc(extraAttemptsRef, {
            quizId,
            userId,
            userName,
            email,
            extraAttempts: currentExtra + count,
            grantedBy: auth.currentUser.email,
            grantedAt: serverTimestamp()
        }, { merge: true });

        window.showToast?.(`✅ تم إضافة ${count} محاولات لـ ${userName}`, 'success');

        // تنظيف الحقول
        document.getElementById('attempt-email').value = '';
    } catch (e) {
        console.error('Grant attempts error:', e);
        alert('حدث خطأ: ' + e.message);
    }
};

// إعادة الكويز لطالب معين
window.resetStudentQuiz = async () => {
    const quizId = document.getElementById('reset-quiz').value;
    const email = document.getElementById('reset-email').value.trim();

    if (!quizId || !email) return alert('اختر الكويز وأدخل إيميل الطالب');
    if (!confirm(`هل تريد إلغاء نتيجة الطالب ${email} وإتاحة الكويز له مرة أخرى؟`)) return;

    try {
        // البحث عن الطالب
        const usersSnap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
        if (usersSnap.empty) return alert('الطالب غير موجود');

        const userId = usersSnap.docs[0].id;
        const userName = usersSnap.docs[0].data().displayName || email;

        // حذف نتيجته من user_scores
        const scoresSnap = await getDocs(query(
            collection(db, "user_scores"),
            where("userId", "==", userId),
            where("quizId", "==", quizId)
        ));

        const deleteBatch = [];
        scoresSnap.forEach(d => deleteBatch.push(deleteDoc(d.ref)));
        await Promise.all(deleteBatch);

        // إضافة محاولة إضافية
        const extraAttemptsRef = doc(db, "quiz_extra_attempts", `${quizId}_${userId}`);
        const existing = await getDoc(extraAttemptsRef);
        const currentExtra = existing.exists() ? (existing.data().extraAttempts || 0) : 0;

        await setDoc(extraAttemptsRef, {
            quizId,
            userId,
            userName,
            email,
            extraAttempts: currentExtra + 1,
            grantedBy: auth.currentUser.email,
            grantedAt: serverTimestamp()
        }, { merge: true });

        window.showToast?.(`✅ تم إلغاء نتيجة ${userName} وإتاحة الكويز له`, 'success');
        document.getElementById('reset-email').value = '';
    } catch (e) {
        console.error('Reset student quiz error:', e);
        alert('حدث خطأ: ' + e.message);
    }
};

// إلغاء نتائج كلية كاملة
window.resetCollegeQuiz = async () => {
    const quizId = document.getElementById('college-reset-quiz').value;
    const collegeId = document.getElementById('college-reset-id').value;

    if (!quizId || !collegeId) return alert('اختر الكويز والكلية');

    const collegeName = UNIVERSITY_STRUCTURE.find(c => c.id === collegeId)?.name || collegeId;
    const confirmText = prompt(`⚠️ تحذير خطير!\n\nسيتم حذف جميع نتائج طلاب "${collegeName}" في هذا الكويز.\n\nاكتب "حذف" للتأكيد:`);
    if (confirmText !== 'حذف') return;

    try {
        // جلب طلاب الكلية
        const usersSnap = await getDocs(query(collection(db, "users"), where("collegeId", "==", collegeId)));
        const userIds = usersSnap.docs.map(d => d.id);

        if (userIds.length === 0) {
            alert('لا يوجد طلاب في هذه الكلية');
            return;
        }

        // حذف نتائجهم
        let deletedCount = 0;
        for (const userId of userIds) {
            const scoresSnap = await getDocs(query(
                collection(db, "user_scores"),
                where("userId", "==", userId),
                where("quizId", "==", quizId)
            ));

            for (const d of scoresSnap.docs) {
                await deleteDoc(d.ref);
                deletedCount++;
            }

            // إضافة محاولة إضافية
            const extraRef = doc(db, "quiz_extra_attempts", `${quizId}_${userId}`);
            const existing = await getDoc(extraRef);
            const currentExtra = existing.exists() ? (existing.data().extraAttempts || 0) : 0;

            await setDoc(extraRef, {
                quizId,
                userId,
                extraAttempts: currentExtra + 1,
                grantedBy: auth.currentUser.email,
                grantedAt: serverTimestamp()
            }, { merge: true });
        }

        window.showToast?.(`✅ تم حذف ${deletedCount} نتيجة وإتاحة الكويز لـ ${userIds.length} طالب`, 'success');
    } catch (e) {
        console.error('Reset college quiz error:', e);
        alert('حدث خطأ: ' + e.message);
    }
};

// ============================================================
// جدولة الإعلانات (Scheduled Announcements)
// ============================================================
export const openScheduledAnnouncementsView = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '📅 جدولة الإعلانات';
    const content = document.getElementById('admin-view-content');

    content.innerHTML = `
        <div class="max-w-2xl mx-auto">
            <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg mb-6">
                <h3 class="font-bold text-lg mb-4 dark:text-white"><i class="fas fa-plus ml-2 text-primary-500"></i>جدولة إعلان جديد</h3>
                <div class="space-y-4">
                    <input type="text" id="sched-title" placeholder="عنوان الإعلان" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                    <textarea id="sched-content" placeholder="محتوى الإعلان" rows="3" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white"></textarea>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-bold mb-2 dark:text-surface-300">تاريخ النشر</label>
                            <input type="datetime-local" id="sched-date" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-2 dark:text-surface-300">النوع</label>
                            <select id="sched-type" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                                <option value="info">معلومة</option>
                                <option value="warning">تحذير</option>
                                <option value="urgent">عاجل</option>
                            </select>
                        </div>
                    </div>
                    <button onclick="window.scheduleAnnouncement()" class="w-full bg-gradient-to-r from-primary-500 to-primary-600 text-white py-4 rounded-xl font-bold hover:shadow-lg transition">
                        <i class="fas fa-clock ml-2"></i>جدولة الإعلان
                    </button>
                </div>
            </div>
            <div id="scheduled-list"></div>
        </div>
    `;

    // تحميل الإعلانات المجدولة
    try {
        const scheduledSnap = await getDocs(query(collection(db, "scheduled_announcements"), orderBy("publishDate", "asc")));
        const list = document.getElementById('scheduled-list');

        if (scheduledSnap.empty) {
            list.innerHTML = '<p class="text-center text-surface-500 py-6">لا توجد إعلانات مجدولة</p>';
            return;
        }

        let html = '<h3 class="font-bold text-lg mb-4 dark:text-white"><i class="fas fa-list ml-2"></i>الإعلانات المجدولة</h3><div class="space-y-3">';
        const now = new Date();
        scheduledSnap.forEach(d => {
            const ann = d.data();
            const pubDate = ann.publishDate?.toDate?.() || new Date(ann.publishDate);
            const isPending = pubDate > now;
            const typeColors = { info: 'blue', warning: 'yellow', urgent: 'red' };
            const color = typeColors[ann.type] || 'blue';

            html += `
                <div class="bg-white dark:bg-surface-800 p-4 rounded-xl shadow border-r-4 border-${color}-500">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h4 class="font-bold dark:text-white">${ann.title}</h4>
                            <p class="text-sm text-surface-500">${pubDate.toLocaleString('ar-EG')}</p>
                        </div>
                        <div class="flex gap-2 items-center">
                            <span class="px-2 py-1 ${isPending ? 'bg-yellow-100 text-yellow-700' : 'bg-accent-100 text-accent-700'} rounded-full text-xs font-bold">
                                ${isPending ? 'في الانتظار' : 'تم النشر'}
                            </span>
                            <button onclick="window.deleteScheduledAnn('${d.id}')" class="text-red-500 hover:bg-red-100 p-2 rounded-lg transition">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <p class="text-sm text-surface-600 dark:text-surface-400">${ann.content}</p>
                </div>
            `;
        });
        html += '</div>';
        list.innerHTML = html;
    } catch (e) {
        console.error('Load scheduled announcements error:', e);
    }
};
window.openScheduledAnnouncementsView = openScheduledAnnouncementsView;

window.scheduleAnnouncement = async () => {
    const title = document.getElementById('sched-title').value.trim();
    const content = document.getElementById('sched-content').value.trim();
    const dateStr = document.getElementById('sched-date').value;
    const type = document.getElementById('sched-type').value;

    if (!title || !content || !dateStr) return alert('يرجى ملء جميع الحقول');

    try {
        await addDoc(collection(db, "scheduled_announcements"), {
            title,
            content,
            type,
            publishDate: new Date(dateStr),
            published: false,
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser.email
        });
        alert('✅ تم جدولة الإعلان');
        openScheduledAnnouncementsView();
    } catch (e) {
        console.error(e);
        alert('فشل الجدولة');
    }
};

window.deleteScheduledAnn = async (annId) => {
    if (!confirm('حذف هذا الإعلان المجدول؟')) return;
    try {
        await deleteDoc(doc(db, "scheduled_announcements", annId));
        openScheduledAnnouncementsView();
    } catch (e) {
        console.error(e);
        alert('فشل الحذف');
    }
};

// التحقق من الإعلانات المجدولة ونشرها (تُستدعى بشكل دوري)
window.checkAndPublishScheduledAnnouncements = async () => {
    try {
        const now = new Date();
        const scheduledSnap = await getDocs(query(
            collection(db, "scheduled_announcements"),
            where("published", "==", false)
        ));

        for (const d of scheduledSnap.docs) {
            const ann = d.data();
            const pubDate = ann.publishDate?.toDate?.() || new Date(ann.publishDate);

            if (pubDate <= now) {
                // نشر الإعلان
                await updateDoc(doc(db, "announcements", "main"), {
                    text: `${ann.title}: ${ann.content}`,
                    type: ann.type,
                    date: serverTimestamp()
                });

                // وضع علامة تم النشر
                await updateDoc(d.ref, { published: true, publishedAt: serverTimestamp() });

                console.log('Published scheduled announcement:', ann.title);
            }
        }
    } catch (e) {
        console.error('Check scheduled announcements error:', e);
    }
};

// التحقق كل 5 دقائق
setInterval(window.checkAndPublishScheduledAnnouncements, 5 * 60 * 1000);
setTimeout(window.checkAndPublishScheduledAnnouncements, 5000);

// ============================================================
// داشبورد الأعضاء المحظورين (Banned Users Dashboard)
// ============================================================
export const openBannedUsersDashboard = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '🚫 الأعضاء المحظورين';
    const content = document.getElementById('admin-view-content');

    content.innerHTML = '<div class="text-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-red-600"></i><p class="mt-4 text-surface-500">جاري تحميل الأعضاء المحظورين...</p></div>';

    try {
        const usersSnap = await getDocs(query(collection(db, "users"), where("isBannedFromPlatform", "==", true)));

        if (usersSnap.empty) {
            content.innerHTML = `
                <div class="text-center py-20 px-6">
                    <div class="w-20 h-20 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-check-circle text-4xl text-accent-500"></i>
                    </div>
                    <h3 class="text-2xl font-black text-surface-700 dark:text-white mb-2">لا يوجد أعضاء محظورين</h3>
                    <p class="text-surface-500">كل الأعضاء في حالة جيدة 🎉</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="mb-6 bg-gradient-to-r from-red-500 to-orange-500 p-6 rounded-2xl text-white shadow-xl">
                <div class="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h3 class="text-2xl font-black flex items-center gap-2">
                            <i class="fas fa-ban"></i> إجمالي المحظورين
                        </h3>
                        <p class="opacity-80 text-sm">الأعضاء الممنوعين من دخول المنصة</p>
                    </div>
                    <div class="text-5xl font-black">${usersSnap.size}</div>
                </div>
            </div>
            
            <div class="bg-white dark:bg-surface-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="p-4 bg-surface-50 dark:bg-surface-700 border-b dark:border-surface-600">
                    <input type="text" id="search-banned" placeholder="بحث في المحظورين..." 
                           class="w-full p-3 border rounded-xl dark:bg-surface-600 dark:text-white"
                           oninput="window.filterBannedUsers(this.value)">
                </div>
                
                <div id="banned-users-list" class="divide-y dark:divide-surface-700">
        `;

        usersSnap.forEach(d => {
            const u = d.data();
            const bannedDate = u.bannedAt?.toDate?.()?.toLocaleString('ar-EG') || 'غير معروف';

            html += `
                <div class="banned-user-item p-4 hover:bg-surface-50 dark:hover:bg-surface-700 transition flex items-center justify-between gap-4"
                     data-name="${(u.displayName || '').toLowerCase()}" data-email="${(u.email || '').toLowerCase()}">
                    <div class="flex items-center gap-4">
                        <div class="relative">
                            <img src="${u.photoURL || 'https://ui-avatars.com/api/?name=' + (u.displayName || 'U')}" 
                                 class="w-14 h-14 rounded-full object-cover border-2 border-red-300 grayscale">
                            <div class="absolute -bottom-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">
                                <i class="fas fa-ban"></i>
                            </div>
                        </div>
                        <div>
                            <h4 class="font-bold text-surface-800 dark:text-white flex items-center gap-2">
                                ${u.displayName || 'بدون اسم'}
                                ${u.isVerified ? '<i class="fas fa-check-circle text-primary-500 text-sm"></i>' : ''}
                            </h4>
                            <p class="text-sm text-surface-500 font-mono">${isOwner ? (u.email || '-') : 'مخفي'}</p>
                            <div class="flex items-center gap-3 mt-1 text-xs text-surface-400">
                                <span><i class="far fa-calendar"></i> حُظر: ${bannedDate}</span>
                                ${u.bannedBy ? `<span><i class="fas fa-user-shield"></i> بواسطة: ${u.bannedBy}</span>` : ''}
                            </div>
                            ${u.banReason ? `<p class="text-xs text-red-500 mt-1"><i class="fas fa-comment-alt ml-1"></i>${u.banReason}</p>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="window.viewBannedUserProfile('${d.id}')" 
                                class="bg-surface-100 dark:bg-surface-600 text-surface-600 dark:text-surface-300 px-3 py-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-500 transition text-sm font-bold">
                            <i class="fas fa-eye ml-1"></i> الملف
                        </button>
                        <button onclick="window.unbanUser('${d.id}', '${u.displayName?.replace(/'/g, "\\'")}' || 'هذا العضو')" 
                                class="bg-accent-500 text-white px-4 py-2 rounded-lg hover:bg-accent-600 transition text-sm font-bold shadow-lg">
                            <i class="fas fa-unlock ml-1"></i> إلغاء الحظر
                        </button>
                    </div>
                </div>
            `;
        });

        html += '</div></div>';
        content.innerHTML = html;

    } catch (e) {
        console.error('Load banned users error:', e);
        content.innerHTML = '<p class="text-center text-red-500 p-10">حدث خطأ في تحميل البيانات</p>';
    }
};
window.openBannedUsersDashboard = openBannedUsersDashboard;

// فلترة الأعضاء المحظورين
window.filterBannedUsers = (searchTerm) => {
    const term = searchTerm.toLowerCase();
    document.querySelectorAll('.banned-user-item').forEach(item => {
        const name = item.dataset.name || '';
        const email = item.dataset.email || '';
        if (name.includes(term) || email.includes(term)) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
};

// عرض ملف المحظور
window.viewBannedUserProfile = (uid) => {
    window.location.hash = `profile/${uid}`;
};

// إلغاء حظر المستخدم
window.unbanUser = async (uid, name) => {
    if (!confirm(`هل تريد إلغاء حظر "${name}"؟\nسيتمكن من دخول المنصة مرة أخرى.`)) return;

    try {
        await updateDoc(doc(db, "users", uid), {
            isBannedFromPlatform: false,
            unbannedAt: serverTimestamp(),
            unbannedBy: auth.currentUser.email
        });

        window.showToast?.('✅ تم إلغاء حظر العضو بنجاح', 'success');
        openBannedUsersDashboard(); // تحديث القائمة
    } catch (e) {
        console.error('Unban user error:', e);
        alert('فشل إلغاء الحظر: ' + e.message);
    }
};

// حظر مستخدم (للسوبر أدمن)
window.banUserFromPlatform = async (uid, name) => {
    const reason = prompt(`سبب حظر "${name}" (اختياري):`);
    if (reason === null) return; // ألغى المستخدم

    if (!confirm(`⚠️ تأكيد حظر "${name}"؟\n\nلن يتمكن من دخول المنصة نهائياً!`)) return;

    try {
        await updateDoc(doc(db, "users", uid), {
            isBannedFromPlatform: true,
            bannedAt: serverTimestamp(),
            bannedBy: auth.currentUser.email,
            banReason: reason || null
        });

        window.showToast?.('🚫 تم حظر العضو من المنصة', 'warning');
    } catch (e) {
        console.error('Ban user error:', e);
        alert('فشل الحظر: ' + e.message);
    }
};

// ============================================================
// حذف المستخدم نهائياً (Delete User Permanently)
// ============================================================
window.deleteUserPermanently = async (uid, name, email = '') => {
    // حماية: لا يمكن حذف الأونر
    if (email === SUPER_ADMIN_EMAIL) {
        alert('⛔ لا يمكن حذف مالك المنصة!');
        return;
    }

    // حماية: لا يمكن حذف أدمن آخر (للسوبر أدمن فقط - الأونر يقدر)
    const currentUser = auth.currentUser;
    const isOwner = currentUser?.email === SUPER_ADMIN_EMAIL;

    if (!isOwner && email) {
        try {
            const adminCheck = await getDoc(doc(db, "admins", email));
            if (adminCheck.exists()) {
                alert('⛔ لا يمكن حذف مشرف! فقط مالك المنصة يستطيع ذلك.');
                return;
            }
        } catch (e) { /* تجاهل */ }
    }

    // تأكيد مزدوج للحذف
    if (!confirm(`⚠️ تحذير خطير!\n\nأنت على وشك حذف "${name}" نهائياً.\n\nسيتم حذف:\n- بيانات التسجيل\n- جميع الدرجات\n- سجل التقدم\n- الحضور\n- الملاحظات\n- المتابعات\n\nهذا الإجراء لا يمكن التراجع عنه!`)) return;

    const confirmText = prompt('للتأكيد، اكتب "حذف":');
    if (confirmText !== 'حذف') {
        alert('تم إلغاء الحذف');
        return;
    }

    try {
        window.showToast?.('جاري حذف المستخدم...', 'info');

        // 1. حذف درجات المستخدم
        const scoresSnap = await getDocs(query(collection(db, "user_scores"), where("userId", "==", uid)));
        for (const d of scoresSnap.docs) {
            await deleteDoc(d.ref);
        }

        // 2. حذف سجل التقدم
        const progressSnap = await getDocs(query(collection(db, "user_progress"), where("userId", "==", uid)));
        for (const d of progressSnap.docs) {
            await deleteDoc(d.ref);
        }

        // 3. حذف الإشعارات
        const notifsSnap = await getDocs(query(collection(db, "notifications"), where("userId", "==", uid)));
        for (const d of notifsSnap.docs) {
            await deleteDoc(d.ref);
        }

        // 4. حذف المتابعات
        const followersSnap = await getDocs(query(collection(db, "follows"), where("followerId", "==", uid)));
        for (const d of followersSnap.docs) {
            await deleteDoc(d.ref);
        }
        const followingSnap = await getDocs(query(collection(db, "follows"), where("followingId", "==", uid)));
        for (const d of followingSnap.docs) {
            await deleteDoc(d.ref);
        }

        // 5. حذف جلسات الأجهزة
        const sessionsSnap = await getDocs(query(collection(db, "device_sessions"), where("userId", "==", uid)));
        for (const d of sessionsSnap.docs) {
            await deleteDoc(d.ref);
        }

        // 6. حذف محادثات الدعم
        try {
            const supportMsgs = await getDocs(collection(db, "support_chats", uid, "messages"));
            for (const d of supportMsgs.docs) {
                await deleteDoc(d.ref);
            }
            await deleteDoc(doc(db, "support_chats", uid));
        } catch (e) { /* قد لا يوجد */ }

        // 7. حذف ملاحظات المستخدم
        try {
            const notesSnap = await getDocs(collection(db, "users", uid, "notes"));
            for (const d of notesSnap.docs) {
                await deleteDoc(d.ref);
            }
        } catch (e) { /* قد لا يوجد */ }

        // 8. حذف المستخدم نفسه
        await deleteDoc(doc(db, "users", uid));

        await logAdminAction('delete_user', uid, name, `حذف نهائي: ${name} (${email})`);
        window.showToast?.(`✅ تم حذف "${name}" نهائياً من المنصة`, 'success');

        // تحديث القائمة
        window.openUsersView?.();

    } catch (e) {
        console.error('Delete user permanently error:', e);
        alert('فشل الحذف: ' + e.message);
    }
};

// ============================================================
// لوحة إرسال إشعارات للمنصة (Broadcast Notification Panel)
// ============================================================
export const openBroadcastNotificationPanel = async () => {
    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = '📢 إرسال إشعارات';
    const content = document.getElementById('admin-view-content');

    // جلب بيانات الهيكل
    let collegeOptions = '<option value="">-- كل الكليات --</option>';
    if (window.UNIVERSITY_STRUCTURE) {
        window.UNIVERSITY_STRUCTURE.forEach(col => {
            collegeOptions += `<option value="${col.id}">${col.name}</option>`;
        });
    }

    content.innerHTML = `
        <div class="max-w-2xl mx-auto">
            <div class="bg-gradient-to-r from-orange-500 to-red-500 p-6 rounded-2xl text-white mb-6 shadow-xl">
                <div class="flex items-center gap-3">
                    <div class="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                        <i class="fas fa-bullhorn text-3xl"></i>
                    </div>
                    <div>
                        <h3 class="text-2xl font-black">إرسال إشعار</h3>
                        <p class="opacity-80 text-sm">أرسل إشعارات للطلاب على أجهزتهم</p>
                    </div>
                </div>
            </div>
            
            <div class="bg-white dark:bg-surface-800 rounded-2xl shadow-lg p-6 space-y-6">
                <!-- نوع الإشعار -->
                <div>
                    <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">
                        <i class="fas fa-tag text-orange-500 mr-1"></i> نوع الإشعار
                    </label>
                    <select id="notif-type" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                        <option value="info">💡 معلومة</option>
                        <option value="announcement">📢 إعلان</option>
                        <option value="grade">📊 درجات</option>
                        <option value="exam">📝 امتحان</option>
                        <option value="warning">⚠️ تحذير</option>
                        <option value="urgent">🚨 عاجل</option>
                    </select>
                </div>
                
                <!-- العنوان -->
                <div>
                    <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">
                        <i class="fas fa-heading text-orange-500 mr-1"></i> عنوان الإشعار
                    </label>
                    <input type="text" id="notif-title" placeholder="اكتب عنوان واضح..." 
                           class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                </div>
                
                <!-- المحتوى -->
                <div>
                    <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">
                        <i class="fas fa-align-right text-orange-500 mr-1"></i> نص الإشعار
                    </label>
                    <textarea id="notif-message" rows="3" placeholder="اكتب محتوى الإشعار..."
                              class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white resize-none"></textarea>
                </div>
                
                <!-- المستهدفين -->
                <div class="bg-surface-50 dark:bg-surface-700/50 p-4 rounded-xl">
                    <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-3">
                        <i class="fas fa-users text-orange-500 mr-1"></i> إرسال إلى:
                    </label>
                    
                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <label class="flex items-center gap-2 p-3 bg-white dark:bg-surface-800 rounded-xl cursor-pointer border-2 border-transparent has-[:checked]:border-orange-500 transition">
                            <input type="radio" name="target" value="all" checked class="w-4 h-4 accent-orange-500">
                            <span class="text-sm font-bold dark:text-white">🌍 المنصة كلها</span>
                        </label>
                        <label class="flex items-center gap-2 p-3 bg-white dark:bg-surface-800 rounded-xl cursor-pointer border-2 border-transparent has-[:checked]:border-orange-500 transition">
                            <input type="radio" name="target" value="college" class="w-4 h-4 accent-orange-500">
                            <span class="text-sm font-bold dark:text-white">🏛️ كلية معينة</span>
                        </label>
                        <label class="flex items-center gap-2 p-3 bg-white dark:bg-surface-800 rounded-xl cursor-pointer border-2 border-transparent has-[:checked]:border-orange-500 transition">
                            <input type="radio" name="target" value="department" class="w-4 h-4 accent-orange-500">
                            <span class="text-sm font-bold dark:text-white">📚 قسم معين</span>
                        </label>
                        <label class="flex items-center gap-2 p-3 bg-white dark:bg-surface-800 rounded-xl cursor-pointer border-2 border-transparent has-[:checked]:border-orange-500 transition">
                            <input type="radio" name="target" value="student" class="w-4 h-4 accent-orange-500">
                            <span class="text-sm font-bold dark:text-white">👤 طالب معين</span>
                        </label>
                    </div>
                    
                    <!-- اختيار الكلية -->
                    <div id="college-select-wrap" class="hidden mb-3">
                        <select id="notif-college" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                            ${collegeOptions}
                        </select>
                    </div>
                    
                    <!-- اختيار القسم -->
                    <div id="dept-select-wrap" class="hidden mb-3">
                        <select id="notif-dept" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                            <option value="">-- اختر الكلية أولاً --</option>
                        </select>
                    </div>
                    
                    <!-- إدخال رقم الطالب -->
                    <div id="student-input-wrap" class="hidden">
                        <input type="text" id="notif-student-id" placeholder="أدخل الرقم الجامعي للطالب..."
                               class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-mono">
                    </div>
                </div>
                
                <!-- معاينة العدد -->
                <div id="target-count" class="bg-primary-50 dark:bg-primary-900/30 p-4 rounded-xl text-center">
                    <span class="text-primary-600 dark:text-primary-400 font-bold">سيصل الإشعار لجميع الطلاب في المنصة</span>
                </div>
                
                <!-- زر الإرسال -->
                <button id="send-broadcast-btn" onclick="window.sendBroadcastNotification()" 
                        class="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-4 rounded-2xl font-black text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition flex items-center justify-center gap-2">
                    <i class="fas fa-paper-plane"></i>
                    إرسال الإشعار
                </button>
            </div>
        </div>
    `;

    // Event listeners
    document.querySelectorAll('input[name="target"]').forEach(radio => {
        radio.onchange = () => {
            const val = radio.value;
            document.getElementById('college-select-wrap').classList.toggle('hidden', val !== 'college' && val !== 'department');
            document.getElementById('dept-select-wrap').classList.toggle('hidden', val !== 'department');
            document.getElementById('student-input-wrap').classList.toggle('hidden', val !== 'student');

            if (val === 'all') {
                document.getElementById('target-count').innerHTML = '<span class="text-primary-600 dark:text-primary-400 font-bold">سيصل الإشعار لجميع الطلاب في المنصة</span>';
            } else if (val === 'student') {
                document.getElementById('target-count').innerHTML = '<span class="text-primary-600 dark:text-primary-400 font-bold">سيصل الإشعار للطالب المحدد</span>';
            }
        };
    });

    // تحديث الأقسام عند اختيار الكلية
    document.getElementById('notif-college').onchange = (e) => {
        const collegeId = e.target.value;
        const deptSelect = document.getElementById('notif-dept');
        deptSelect.innerHTML = '<option value="">-- كل الأقسام --</option>';

        if (collegeId && window.UNIVERSITY_STRUCTURE) {
            const college = window.UNIVERSITY_STRUCTURE.find(c => c.id === collegeId);
            if (college?.departments) {
                college.departments.forEach(d => {
                    deptSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
                });
            }
        }

        document.getElementById('target-count').innerHTML = `<span class="text-accent-600 dark:text-accent-400 font-bold">سيصل الإشعار لطلاب الكلية المحددة</span>`;
    };

    document.getElementById('notif-dept').onchange = () => {
        document.getElementById('target-count').innerHTML = `<span class="text-primary-600 dark:text-primary-400 font-bold">سيصل الإشعار لطلاب القسم المحدد</span>`;
    };
};
window.openBroadcastNotificationPanel = openBroadcastNotificationPanel;

// إرسال الإشعار
window.sendBroadcastNotification = async () => {
    const type = document.getElementById('notif-type').value;
    const title = document.getElementById('notif-title').value.trim();
    const message = document.getElementById('notif-message').value.trim();
    const targetType = document.querySelector('input[name="target"]:checked')?.value || 'all';

    if (!title || !message) {
        return alert('⚠️ يرجى كتابة العنوان والمحتوى');
    }

    const btn = document.getElementById('send-broadcast-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
    btn.disabled = true;

    try {
        let usersQuery;

        if (targetType === 'all') {
            usersQuery = collection(db, "users");
        } else if (targetType === 'college') {
            const collegeId = document.getElementById('notif-college').value;
            if (!collegeId) { alert('⚠️ اختر الكلية'); btn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال الإشعار'; btn.disabled = false; return; }
            usersQuery = query(collection(db, "users"), where("collegeId", "==", collegeId));
        } else if (targetType === 'department') {
            const collegeId = document.getElementById('notif-college').value;
            const deptId = document.getElementById('notif-dept').value;
            if (!collegeId || !deptId) { alert('⚠️ اختر الكلية والقسم'); btn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال الإشعار'; btn.disabled = false; return; }
            usersQuery = query(collection(db, "users"), where("collegeId", "==", collegeId), where("departmentId", "==", deptId));
        } else if (targetType === 'student') {
            const studentId = document.getElementById('notif-student-id').value.trim();
            if (!studentId) { alert('⚠️ أدخل الرقم الجامعي'); btn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال الإشعار'; btn.disabled = false; return; }
            usersQuery = query(collection(db, "users"), where("studentId", "==", studentId));
        }

        const usersSnap = await getDocs(usersQuery);

        if (usersSnap.empty) {
            alert('❌ لا يوجد مستخدمين في النطاق المحدد');
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال الإشعار';
            btn.disabled = false;
            return;
        }

        const typeEmoji = { info: '💡', announcement: '📢', grade: '📊', exam: '📝', warning: '⚠️', urgent: '🚨' };
        let sentCount = 0;

        for (const userDoc of usersSnap.docs) {
            try {
                await addDoc(collection(db, "notifications"), {
                    userId: userDoc.id,
                    type: type,
                    title: `${typeEmoji[type] || '📢'} ${title}`,
                    message: message,
                    read: false,
                    createdAt: serverTimestamp(),
                    sentBy: auth.currentUser.email
                });
                sentCount++;
            } catch (e) { /* تجاهل */ }
        }

        window.showToast?.(`✅ تم إرسال الإشعار إلى ${sentCount} طالب`, 'success');
        await logAdminAction('broadcast_notification', '', '', `إشعار عام لـ ${sentCount} طالب: ${title}`);

        // مسح الحقول
        document.getElementById('notif-title').value = '';
        document.getElementById('notif-message').value = '';

    } catch (e) {
        console.error('Broadcast error:', e);
        alert('❌ فشل الإرسال: ' + e.message);
    }

    btn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال الإشعار';
    btn.disabled = false;
};

// ============================================================
// تعديل بياناتي الشخصية (Edit My Profile Data)
// ============================================================
window.editMyProfileData = async () => {
    const user = auth.currentUser;
    if (!user) return alert('يجب تسجيل الدخول');

    // جلب البيانات الحالية
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const data = userDoc.exists() ? userDoc.data() : {};

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            <div class="bg-gradient-to-r from-primary-600 to-primary-600 p-6 text-white text-center">
                <div class="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <i class="fas fa-user-edit text-3xl"></i>
                </div>
                <h2 class="text-xl font-black">تعديل بياناتي</h2>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-1">الاسم الرباعي</label>
                    <input type="text" id="edit-fullName" value="${data.fullName || data.displayName || ''}" 
                           class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                </div>
                <div>
                    <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-1">الرقم القومي</label>
                    <input type="text" id="edit-nationalId" value="${data.nationalId || ''}" 
                           class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-mono text-left" maxlength="14">
                </div>
                <div>
                    <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-1">الرقم الجامعي (Student ID)</label>
                    <input type="text" id="edit-studentId" value="${data.studentId || ''}" 
                           class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-mono text-left">
                </div>
                
                <div class="flex gap-3 pt-4">
                    <button id="save-profile-btn" class="flex-1 bg-gradient-to-r from-primary-600 to-primary-600 text-white py-3 rounded-xl font-bold hover:shadow-lg transition">
                        <i class="fas fa-save ml-1"></i> حفظ
                    </button>
                    <button onclick="this.closest('.fixed').remove()" class="px-6 bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300 py-3 rounded-xl font-bold hover:bg-surface-300 transition">
                        إلغاء
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('save-profile-btn').onclick = async () => {
        const fullName = document.getElementById('edit-fullName').value.trim();
        const nationalId = document.getElementById('edit-nationalId').value.trim();
        const studentId = document.getElementById('edit-studentId').value.trim();

        if (!fullName) return alert('⚠️ يرجى كتابة الاسم');

        try {
            await updateDoc(doc(db, "users", user.uid), {
                fullName,
                nationalId,
                studentId,
                updatedAt: serverTimestamp()
            });

            window.showToast?.('✅ تم حفظ البيانات بنجاح', 'success');
            modal.remove();

            // تحديث البروفايل إذا كان مفتوح
            if (window.location.hash.includes('profile')) {
                window.openProfile?.(user.uid);
            }
        } catch (e) {
            console.error('Save profile error:', e);
            alert('❌ فشل الحفظ: ' + e.message);
        }
    };
};

// ============================================================
// تعديل بيانات مستخدم كأدمن (Edit User Data As Admin)
// ============================================================
window.editUserDataAsAdmin = async (targetUid, displayName) => {
    const user = auth.currentUser;
    if (!user) return alert('يجب تسجيل الدخول');

    // التأكد من صلاحيات الأدمن
    const isOwner = user.email === SUPER_ADMIN_EMAIL;
    let hasPermission = isOwner;

    if (!isOwner) {
        try {
            const adminDoc = await getDoc(doc(db, "admins", user.email));
            hasPermission = adminDoc.exists() && (adminDoc.data().permissions?.superAdmin || adminDoc.data().permissions?.users);
        } catch (e) { hasPermission = false; }
    }

    if (!hasPermission) {
        return alert('⛔ ليس لديك صلاحية تعديل البيانات');
    }

    // جلب بيانات المستخدم المستهدف
    const userDoc = await getDoc(doc(db, "users", targetUid));
    const data = userDoc.exists() ? userDoc.data() : {};

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            <div class="bg-gradient-to-r from-yellow-500 to-orange-500 p-6 text-white text-center">
                <div class="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <i class="fas fa-user-edit text-3xl"></i>
                </div>
                <h2 class="text-xl font-black">تعديل بيانات</h2>
                <p class="opacity-80 text-sm">${displayName || 'المستخدم'}</p>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-1">الاسم الرباعي</label>
                    <input type="text" id="admin-edit-fullName" value="${data.fullName || data.displayName || ''}" 
                           class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white">
                </div>
                <div>
                    <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-1">الرقم القومي (14 رقم)</label>
                    <input type="text" id="admin-edit-nationalId" value="${data.nationalId || ''}" 
                           class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-mono text-left" maxlength="14">
                </div>
                <div>
                    <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-1">الرقم الجامعي (Student ID)</label>
                    <input type="text" id="admin-edit-studentId" value="${data.studentId || ''}" 
                           class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-mono text-left">
                </div>
                <div class="flex items-center gap-3 p-3 bg-primary-50 dark:bg-primary-900/30 rounded-xl">
                    <input type="checkbox" id="admin-edit-isVerified" ${data.isVerified ? 'checked' : ''} 
                           class="w-5 h-5 accent-primary-600 rounded">
                    <label for="admin-edit-isVerified" class="text-sm font-bold text-surface-600 dark:text-surface-300 cursor-pointer">
                        <i class="fas fa-check-circle text-primary-500 mr-1"></i> حساب موثق
                    </label>
                </div>
                
                <div class="flex gap-3 pt-4">
                    <button id="admin-save-user-btn" class="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition">
                        <i class="fas fa-save ml-1"></i> حفظ التعديلات
                    </button>
                    <button onclick="this.closest('.fixed').remove()" class="px-6 bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300 py-3 rounded-xl font-bold hover:bg-surface-300 transition">
                        إلغاء
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('admin-save-user-btn').onclick = async () => {
        const fullName = document.getElementById('admin-edit-fullName').value.trim();
        const nationalId = document.getElementById('admin-edit-nationalId').value.trim();
        const studentId = document.getElementById('admin-edit-studentId').value.trim();
        const isVerified = document.getElementById('admin-edit-isVerified').checked;

        if (!fullName) return alert('⚠️ يرجى كتابة الاسم');

        try {
            await updateDoc(doc(db, "users", targetUid), {
                fullName,
                displayName: fullName,
                nationalId,
                studentId,
                isVerified,
                updatedAt: serverTimestamp(),
                updatedBy: user.email
            });

            window.showToast?.('✅ تم حفظ التعديلات بنجاح', 'success');
            modal.remove();

            // تحديث البروفايل
            window.openProfile?.(targetUid);
        } catch (e) {
            console.error('Admin edit user error:', e);
            alert('❌ فشل الحفظ: ' + e.message);
        }
    };
};

// ============================================================
// سجل نشاط الأدمن — لوحة عرض (Owner فقط)
// ============================================================
window.openAdminActivityLog = async () => {
    const content = document.getElementById('admin-view-content');
    const title = document.getElementById('admin-view-title');
    title.textContent = '📋 سجل نشاط المشرفين';

    content.innerHTML = '<div class="text-center py-12"><i class="fas fa-spinner fa-spin text-4xl text-primary-500"></i></div>';

    try {
        const logsSnap = await getDocs(query(collection(db, "admin_logs"), orderBy("timestamp", "desc"), limit(200)));
        const logs = [];
        logsSnap.forEach(d => logs.push({ id: d.id, ...d.data() }));

        const actionLabels = {
            'edit_name': { icon: '✏️', label: 'تعديل اسم', color: 'blue' },
            'ban_user': { icon: '⛔', label: 'حظر طالب', color: 'red' },
            'unban_user': { icon: '✅', label: 'فك حظر', color: 'green' },
            'ban_chat': { icon: '🔇', label: 'حظر شات', color: 'orange' },
            'unban_chat': { icon: '🔊', label: 'فك حظر شات', color: 'green' },
            'delete_user': { icon: '🗑️', label: 'حذف طالب', color: 'red' },
            'delete_admin': { icon: '👤❌', label: 'حذف مشرف', color: 'red' },
            'update_admin': { icon: '🛡️', label: 'تحديث صلاحيات', color: 'purple' }
        };

        const timeAgo = (ts) => {
            if (!ts) return '';
            const d = ts.toDate ? ts.toDate() : new Date(ts);
            const diff = Math.floor((Date.now() - d) / 1000);
            if (diff < 60) return 'الآن';
            if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
            if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
            if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;
            return d.toLocaleDateString('ar-EG') + ' ' + d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        };

        let rows = '';
        logs.forEach(log => {
            const info = actionLabels[log.action] || { icon: '📝', label: log.action, color: 'gray' };
            rows += `
                <tr class="border-b dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition">
                    <td class="px-4 py-3">
                        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-${info.color}-100 text-${info.color}-700 dark:bg-${info.color}-900/30 dark:text-${info.color}-400">
                            ${info.icon} ${info.label}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-sm font-mono text-surface-600 dark:text-surface-400">${log.adminEmail}</td>
                    <td class="px-4 py-3 text-sm dark:text-surface-300">${log.details || '-'}</td>
                    <td class="px-4 py-3 text-xs text-surface-400">${timeAgo(log.timestamp)}</td>
                </tr>`;
        });

        content.innerHTML = `
            <div class="mb-4 flex items-center justify-between">
                <p class="text-sm text-surface-500">آخر ${logs.length} عملية</p>
                <button onclick="window.openUsersLogView()" class="text-sm text-primary-600 hover:underline"><i class="fas fa-arrow-right"></i> رجوع</button>
            </div>
            <div class="bg-white dark:bg-surface-800 rounded-2xl shadow border dark:border-surface-700 overflow-x-auto">
                <table class="w-full text-right" dir="rtl">
                    <thead class="bg-surface-50 dark:bg-surface-700">
                        <tr>
                            <th class="px-4 py-3 text-xs font-bold text-surface-500">العملية</th>
                            <th class="px-4 py-3 text-xs font-bold text-surface-500">المشرف</th>
                            <th class="px-4 py-3 text-xs font-bold text-surface-500">التفاصيل</th>
                            <th class="px-4 py-3 text-xs font-bold text-surface-500">الوقت</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="4" class="text-center py-8 text-surface-400">لا يوجد سجلات بعد</td></tr>'}</tbody>
                </table>
            </div>
        `;
    } catch (e) {
        console.error('Admin logs error:', e);
        content.innerHTML = `<div class="text-center py-12 text-red-500"><i class="fas fa-exclamation-triangle text-3xl mb-2"></i><p>خطأ في تحميل السجلات</p></div>`;
    }
};

// ============================================================
// تحسين #4: تحميل صلاحيات الأدمن عند التعديل
// ============================================================
window.editAdminPermissions = async (email) => {
    try {
        const adminSnap = await getDoc(doc(db, "admins", email));
        if (!adminSnap.exists()) return alert('❌ الأدمن غير موجود');

        const data = adminSnap.data();
        const p = data.permissions || {};

        // تعيين البريد في الفورم
        const emailInput = document.getElementById('admin-email');
        if (emailInput) {
            emailInput.value = email;
            emailInput.readOnly = true;
        }

        // تعيين الرتبة
        const roleSelect = document.getElementById('admin-role');
        if (roleSelect) roleSelect.value = data.role || 'custom';

        // تعيين النطاق
        const scopeCollege = document.getElementById('scope-college');
        const scopeDept = document.getElementById('scope-dept');
        if (scopeCollege && data.scope?.collegeId) scopeCollege.value = data.scope.collegeId;
        if (scopeDept && data.scope?.departmentId) scopeDept.value = data.scope.departmentId;

        // تحميل كل الصلاحيات في الـ checkboxes
        const permMap = {
            'p-cms': p.cms, 'p-quiz': p.quiz, 'p-users': p.users,
            'p-support': p.support, 'p-idReview': p.idReview, 'p-statistics': p.statistics,
            'p-reports': p.reports, 'p-broadcast': p.broadcast, 'p-exams': p.exams,
            'p-announcements': p.announcements, 'p-grades': p.grades,
            'p-bannedUsers': p.bannedUsers, 'p-deleteUsers': p.deleteUsers,
            'p-devices': p.devices, 'p-loginLogs': p.loginLogs, 'p-superAdmin': p.superAdmin
        };

        Object.entries(permMap).forEach(([id, val]) => {
            const cb = document.getElementById(id);
            if (cb) cb.checked = !!val;
        });

        // تحديث المواد المختارة
        if (data.allowedSections?.length) {
            currentSelectedScopes = new Set(data.allowedSections);
        }

        editingAdminEmail = email;

        // Scroll to form
        document.getElementById('admin-email')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.showToast?.(`📝 جاري تعديل صلاحيات ${email}`, 'info');

    } catch (e) {
        console.error('Edit admin error:', e);
        alert('❌ خطأ في تحميل البيانات');
    }
};

// ============================================================
// تحسين #6: تأكيد الصلاحيات الخطرة
// ============================================================
const setupDangerousPermissionConfirm = () => {
    const dangerous = ['p-bannedUsers', 'p-deleteUsers', 'p-devices', 'p-loginLogs', 'p-superAdmin'];
    const labels = {
        'p-bannedUsers': 'حظر الطلاب',
        'p-deleteUsers': 'حذف الطلاب نهائياً',
        'p-devices': 'عرض أجهزة الطلاب',
        'p-loginLogs': 'عرض سجل الدخول',
        'p-superAdmin': 'صلاحيات سوبر أدمن كاملة'
    };

    dangerous.forEach(id => {
        const cb = document.getElementById(id);
        if (cb) {
            cb.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const email = document.getElementById('admin-email')?.value || 'هذا المشرف';
                    if (!confirm(`⚠️ تحذير!\n\nأنت على وشك منح صلاحية "${labels[id]}" لـ ${email}.\n\nهذه صلاحية خطرة! هل أنت متأكد؟`)) {
                        e.target.checked = false;
                    }
                }
            });
        }
    });
};

// تفعيل تأكيد الصلاحيات الخطرة عند فتح إعدادات الأدمن
const origOpenAdminSettings = window.openAdminSettings;
if (origOpenAdminSettings) {
    window.openAdminSettings = async (...args) => {
        await origOpenAdminSettings(...args);
        setTimeout(setupDangerousPermissionConfirm, 200);
    };
}

// ============================================================
// تحسين #8: إشعار الأدمن الجديد
// ============================================================
const notifyNewAdmin = async (email, role, permissions) => {
    try {
        // البحث عن uid الأدمن الجديد
        const usersSnap = await getDocs(query(collection(db, "users"), where("email", "==", email), limit(1)));
        if (usersSnap.empty) return;

        const adminUid = usersSnap.docs[0].id;

        // إرسال إشعار
        const permNames = [];
        if (permissions.cms) permNames.push('محتوى');
        if (permissions.quiz) permNames.push('كويزات');
        if (permissions.users) permNames.push('طلاب');
        if (permissions.support) permNames.push('دعم');
        if (permissions.broadcast) permNames.push('إشعارات');
        if (permissions.grades) permNames.push('درجات');

        await addDoc(collection(db, "notifications"), {
            userId: adminUid,
            title: '🎉 تم تعيينك كمشرف!',
            body: `الصلاحيات: ${permNames.join('، ') || 'مشاهدة'}`,
            type: 'admin',
            read: false,
            createdAt: serverTimestamp()
        });
    } catch (e) { console.log('Notify admin error:', e); }
};

// ربط الإشعار بعملية حفظ الأدمن
const origSaveAdminBtn = document.getElementById('save-admin-btn');
// سيتم تفعيله داخل openAdminSettings
window._notifyNewAdmin = notifyNewAdmin;

// ============================================================
// تحسين #9: دعم انتهاء صلاحية الأدمن
// ============================================================
// يتم التحقق عند فتح لوحة الأدمن — لو المشرف منتهي يتم حذفه تلقائياً
const checkExpiredAdmins = async () => {
    try {
        const adminsSnap = await getDocs(collection(db, "admins"));
        const now = new Date();
        for (const adminDoc of adminsSnap.docs) {
            const data = adminDoc.data();
            if (data.expiresAt) {
                const expiry = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
                if (expiry < now) {
                    await deleteDoc(doc(db, "admins", adminDoc.id));
                    await logAdminAction('auto_expire_admin', '', adminDoc.id, `انتهاء صلاحية تلقائي: ${adminDoc.id}`);
                    console.log(`⏰ Admin expired: ${adminDoc.id}`);
                }
            }
        }
    } catch (e) { console.log('Expiry check error:', e); }
};

// تشغيل فحص انتهاء الصلاحية
setTimeout(checkExpiredAdmins, 5000);

// ============================================================
// إدارة الإعفاء من العلامة المائية (Watermark Exemptions)
// ============================================================
window.openWatermarkExemptions = async () => {
    const area = document.getElementById('admin-view-content');
    if (!area) return;

    area.innerHTML = `
        <div class="max-w-2xl mx-auto">
            <div class="flex items-center justify-between mb-6">
                <h2 class="text-2xl font-black dark:text-white flex items-center gap-3">
                    <div class="w-12 h-12 rounded-2xl bg-primary-500/20 flex items-center justify-center">
                        <i class="fas fa-eye-slash text-primary-500 text-xl"></i>
                    </div>
                    إعفاء من العلامة المائية
                </h2>
                <button onclick="window.openAdminPanel()" class="bg-surface-200 dark:bg-surface-700 px-4 py-2 rounded-xl font-bold hover:bg-surface-300 dark:hover:bg-surface-600 transition text-sm">
                    <i class="fas fa-arrow-right ml-1"></i> رجوع
                </button>
            </div>

            <div class="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-2xl p-4 mb-6">
                <p class="text-sm text-primary-700 dark:text-primary-300">
                    <i class="fas fa-info-circle ml-1"></i>
                    الإيميلات المضافة هنا لن تظهر لها العلامة المائية (Watermark) على المنصة.
                    <br>المالك معفى تلقائياً ولا يحتاج إضافة.
                </p>
            </div>

            <!-- إضافة إيميل جديد -->
            <div class="bg-white dark:bg-surface-800 rounded-2xl shadow-lg p-5 mb-6 border dark:border-surface-700">
                <h3 class="font-bold text-lg dark:text-white mb-4"><i class="fas fa-plus-circle text-primary-500 ml-2"></i>إضافة إيميل معفى</h3>
                <div class="flex gap-3">
                    <input type="email" id="wm-exempt-email" placeholder="example@gmail.com" 
                        class="flex-1 p-3 border dark:border-surface-600 rounded-xl bg-surface-50 dark:bg-surface-700 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm" dir="ltr">
                    <button onclick="window.addWatermarkExemption()" id="wm-add-btn"
                        class="bg-primary-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-primary-700 transition whitespace-nowrap">
                        <i class="fas fa-plus ml-1"></i> إضافة
                    </button>
                </div>
            </div>

            <!-- القائمة -->
            <div class="bg-white dark:bg-surface-800 rounded-2xl shadow-lg p-5 border dark:border-surface-700">
                <h3 class="font-bold text-lg dark:text-white mb-4"><i class="fas fa-list text-primary-500 ml-2"></i>الإيميلات المعفاة</h3>
                <div id="wm-exempt-list" class="space-y-2">
                    <p class="text-center text-surface-400 py-4"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</p>
                </div>
            </div>
        </div>
    `;

    await loadWatermarkExemptions();
};

async function loadWatermarkExemptions() {
    const listEl = document.getElementById('wm-exempt-list');
    if (!listEl) return;

    try {
        const docSnap = await getDoc(doc(db, 'system', 'watermark_exemptions'));
        const emails = docSnap.exists() ? (docSnap.data().emails || []) : [];

        if (emails.length === 0) {
            listEl.innerHTML = '<p class="text-center text-surface-400 py-6"><i class="fas fa-check-circle text-accent-400 ml-1"></i> لا يوجد إيميلات معفاة حالياً</p>';
            return;
        }

        listEl.innerHTML = emails.map((email, idx) => `
            <div class="flex items-center justify-between p-3 rounded-xl bg-surface-50 dark:bg-surface-700/50 hover:bg-surface-100 dark:hover:bg-surface-700 transition group">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <i class="fas fa-user-shield text-primary-500"></i>
                    </div>
                    <span class="font-mono text-sm dark:text-white" dir="ltr">${email}</span>
                </div>
                <button onclick="window.removeWatermarkExemption('${email}')" 
                    class="opacity-0 group-hover:opacity-100 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition">
                    <i class="fas fa-trash-alt ml-1"></i> حذف
                </button>
            </div>
        `).join('');
    } catch (e) {
        console.error('Load watermark exemptions error:', e);
        listEl.innerHTML = '<p class="text-center text-red-400 py-4">حدث خطأ في التحميل</p>';
    }
}

window.addWatermarkExemption = async () => {
    const input = document.getElementById('wm-exempt-email');
    const btn = document.getElementById('wm-add-btn');
    const email = input?.value?.trim().toLowerCase();

    if (!email || !email.includes('@')) {
        window.showToast?.('⚠️ أدخل بريد إلكتروني صحيح', 'warning');
        return;
    }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        const docRef = doc(db, 'system', 'watermark_exemptions');
        const docSnap = await getDoc(docRef);
        const emails = docSnap.exists() ? (docSnap.data().emails || []) : [];

        if (emails.includes(email)) {
            window.showToast?.('⚠️ هذا الإيميل مضاف بالفعل', 'warning');
            return;
        }

        emails.push(email);
        await setDoc(docRef, { emails, updatedAt: new Date() }, { merge: true });

        input.value = '';
        window.showToast?.(`✅ تم إضافة ${email} للقائمة المعفاة`, 'success');
        await loadWatermarkExemptions();
    } catch (e) {
        console.error('Add exemption error:', e);
        window.showToast?.('❌ فشل الإضافة: ' + e.message, 'error');
    } finally {
        btn.innerHTML = '<i class="fas fa-plus ml-1"></i> إضافة';
        btn.disabled = false;
    }
};

window.removeWatermarkExemption = async (email) => {
    if (!confirm(`هل تريد إزالة ${email} من القائمة المعفاة؟`)) return;

    try {
        const docRef = doc(db, 'system', 'watermark_exemptions');
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return;

        const emails = (docSnap.data().emails || []).filter(e => e !== email);
        await setDoc(docRef, { emails, updatedAt: new Date() }, { merge: true });

        window.showToast?.(`✅ تم إزالة ${email}`, 'success');
        await loadWatermarkExemptions();
    } catch (e) {
        console.error('Remove exemption error:', e);
        window.showToast?.('❌ فشل الحذف: ' + e.message, 'error');
    }
};
