// ============================================================
// support.js - نظام الدعم الفني المباشر (تم نقل الزر للقائمة)
// ============================================================

import { db, auth, SUPER_ADMIN_EMAIL } from './firebase.js';
import { getStructureName } from './structure.js';
import { uploadToCloudinary } from './cms.js';
import {
    collection, addDoc, query, orderBy, onSnapshot, doc, setDoc,
    deleteDoc, getDocs, serverTimestamp, writeBatch, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- متغيرات الحالة ---
let currentChatUnsubscribe = null;
let activeAdminTargetId = null; // المعرف الخاص بالطالب الذي يتحدث معه الأدمن حالياً

// ============================================================
// 1. تهيئة النظام (للطلاب والمشرفين)
// ============================================================
export const setupSupportSystem = async () => {
    const user = auth.currentUser;
    if (!user) return;

    let isSupportStaff = user.email === SUPER_ADMIN_EMAIL;

    if (!isSupportStaff) {
        try {
            const adminSnap = await getDoc(doc(db, "admins", user.email));
            if (adminSnap.exists()) {
                const perms = adminSnap.data().permissions;
                if (perms && perms.support) isSupportStaff = true;
            }
        } catch (e) { console.error("Error checking support permissions:", e); }
    }

    if (!isSupportStaff) {
        createStudentUI();
        listenForUnreadMessages(user.uid); // استماع للرسائل غير المقروءة لتفعيل النقطة الحمراء
    }
};

// ============================================================
// 2. واجهة الطالب (Student UI) - (بدون زر عائم)
// ============================================================
const createStudentUI = () => {
    if (document.getElementById('support-window')) return;

    // الزر الآن في القائمة الجانبية (sidebar) بدلاً من زر عائم

    const win = document.createElement('div');
    win.id = 'support-window';
    win.className = "hidden fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 md:w-96 h-[500px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col z-[350] border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300";

    win.innerHTML = `
        <div class="bg-blue-600 p-4 text-white flex justify-between items-center shadow-md">
            <div>
                <h3 class="font-bold text-lg">${window.t?.('technical-support') || 'الدعم الفني'} 🛠️</h3>
                <p class="text-xs text-blue-100 opacity-90">${window.t?.('we-are-here-to-help') || 'نحن هنا لمساعدتك'}</p>
            </div>
            <button onclick="window.toggleSupportChat()" class="hover:bg-blue-700 p-2 rounded-full transition"><i class="fas fa-times"></i></button>
        </div>
        
        <div id="support-msgs" class="flex-1 p-4 overflow-y-auto bg-gray-50 dark:bg-gray-900 space-y-3 custom-scrollbar">
            <div class="text-center text-gray-400 mt-10 text-sm">
                <i class="fas fa-comments text-4xl mb-2 opacity-50"></i>
                <p>${window.t?.('describe-issue') || 'مرحباً بك. صف مشكلتك وسنقوم بالرد عليك.'}</p>
            </div>
        </div>
        
        <div class="p-3 bg-white dark:bg-gray-800 border-t dark:border-gray-700">
            <div id="preview-box" class="hidden mb-2 relative w-fit p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <img id="img-preview" class="h-16 rounded border border-gray-300">
                <button onclick="window.clearImg()" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-sm hover:bg-red-600"><i class="fas fa-times"></i></button>
            </div>

            <div class="flex gap-2 items-center">
                <input type="file" id="support-file" class="hidden" accept="image/*" onchange="window.previewImg(this)">
                <button onclick="document.getElementById('support-file').click()" class="text-gray-400 hover:text-blue-600 transition p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" title="${window.t?.('attach-image') || 'إرفاق صورة'}"><i class="fas fa-image text-xl"></i></button>
                
                <input type="text" id="support-input" placeholder="${window.t?.('write-message') || 'اكتب رسالتك...'}" class="flex-grow p-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
                
                <button id="send-support" class="bg-blue-600 text-white p-2.5 rounded-xl w-10 h-10 flex items-center justify-center hover:bg-blue-700 shadow-md transition transform active:scale-95"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    `;

    document.body.appendChild(win);

    // دالة الفتح والإغلاق العامة
    window.toggleSupportChat = () => {
        win.classList.toggle('hidden');
        if (!win.classList.contains('hidden')) {
            // إخفاء النقطة الحمراء من القائمة الجانبية عند الفتح
            document.getElementById('support-badge-sidebar')?.classList.add('hidden');
            loadMessages(auth.currentUser.uid, 'support-msgs');

            // تحديث حالة القراءة في الداتابيز
            updateDoc(doc(db, "support_chats", auth.currentUser.uid), { hasUnreadUser: false }).catch(() => { });
        }
    };

    document.getElementById('send-support').onclick = () => sendMsg('student');
    document.getElementById('support-input').onkeypress = (e) => { if (e.key === 'Enter') sendMsg('student'); };
};

// مراقبة الرسائل الجديدة لوضع النقطة الحمراء في القائمة
const listenForUnreadMessages = (uid) => {
    onSnapshot(doc(db, "support_chats", uid), (docSnap) => {
        const badge = document.getElementById('support-badge-sidebar');
        if (docSnap.exists() && docSnap.data().hasUnreadUser && badge) {
            badge.classList.remove('hidden');
        } else if (badge) {
            badge.classList.add('hidden');
        }
    });
};

// ============================================================
// 3. دوال مساعدة للصور
// ============================================================
window.previewImg = (input) => {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('img-preview').src = e.target.result;
            document.getElementById('preview-box').classList.remove('hidden');
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.clearImg = () => {
    document.getElementById('support-file').value = '';
    document.getElementById('preview-box').classList.add('hidden');
};

// ============================================================
// 4. دالة الإرسال الرئيسية
// ============================================================
const sendMsg = async (role) => {
    const user = auth.currentUser;
    if (!user) return;

    const input = document.getElementById(role === 'student' ? 'support-input' : 'admin-support-input');
    const fileIn = document.getElementById(role === 'student' ? 'support-file' : 'admin-support-img');
    const btn = document.getElementById(role === 'student' ? 'send-support' : 'admin-send-btn');

    const text = input.value.trim();
    const file = fileIn ? fileIn.files[0] : null;

    if (!text && !file) return;

    const targetId = role === 'student' ? user.uid : activeAdminTargetId;
    if (!targetId) return;

    const originalBtnContent = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        let imageUrl = null;
        if (file) imageUrl = await uploadToCloudinary(file);

        // إضافة الرسالة
        await addDoc(collection(db, "support_chats", targetId, "messages"), {
            text,
            imageUrl,
            senderId: user.uid,
            createdAt: serverTimestamp(),
            isStaff: role === 'admin'
        });

        const updateData = {
            lastMessage: file ? (text ? '📎 ' + text : '📎 ' + (window.t?.('attached-image') || 'صورة مرفقة')) : text,
            lastUpdated: serverTimestamp()
        };

        if (role === 'student') {
            updateData.hasUnreadAdmin = true;
            updateData.userName = user.displayName;
            updateData.userPhoto = user.photoURL;
            try {
                const uDoc = await getDoc(doc(db, "users", user.uid));
                if (uDoc.exists()) {
                    updateData.collegeId = uDoc.data().collegeId;
                    updateData.departmentId = uDoc.data().departmentId;
                    updateData.email = user.email;
                }
            } catch (e) { }
        } else {
            updateData.hasUnreadUser = true;
        }

        await setDoc(doc(db, "support_chats", targetId), updateData, { merge: true });

        input.value = '';
        if (fileIn) {
            fileIn.value = '';
            if (role === 'student') window.clearImg();
            else window.clearAdminSupportImg?.();
        }

    } catch (e) {
        console.error(e);
        alert((window.t?.('send-failed') || "فشل الإرسال") + ": " + e.message);
    } finally {
        btn.innerHTML = originalBtnContent;
        btn.disabled = false;
        input.focus();
    }
};

// ============================================================
// 5. واجهة الأدمن (Admin Dashboard)
// ============================================================
export const openAdminSupportDashboard = async () => {
    const user = auth.currentUser;
    let hasAccess = user.email === SUPER_ADMIN_EMAIL;
    if (!hasAccess) {
        const adminSnap = await getDoc(doc(db, "admins", user.email));
        if (adminSnap.exists() && adminSnap.data().permissions?.support) hasAccess = true;
    }

    if (!hasAccess) return alert(window.t?.('no-access') || "⛔ ليس لديك صلاحية الوصول.");

    const area = document.getElementById('admin-view-area');
    area.classList.remove('hidden');

    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'leaderboard-section', 'assignments-section', 'profile-section', 'admin-settings-section'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });

    document.getElementById('admin-view-title').textContent = `🎧 ${window.t?.('support-dashboard') || 'لوحة الدعم الفني والتذاكر'}`;

    const content = document.getElementById('admin-view-content');
    content.innerHTML = `
        <div class="flex flex-col lg:flex-row h-[600px] gap-6 bg-gray-100 dark:bg-gray-900 rounded-3xl p-4 shadow-inner border dark:border-gray-700">
            <div class="w-full lg:w-1/3 bg-white dark:bg-gray-800 rounded-2xl shadow-lg flex flex-col overflow-hidden border dark:border-gray-700">
                <div class="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <h3 class="font-bold dark:text-white">${window.t?.('active-tickets') || 'التذاكر النشطة'}</h3>
                </div>
                <div id="tickets-list" class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                    <div class="text-center p-10 text-gray-400"><i class="fas fa-spinner fa-spin"></i> ${window.t?.('loading') || 'جاري التحميل...'}</div>
                </div>
            </div>

            <div class="w-full lg:w-2/3 bg-white dark:bg-gray-800 rounded-2xl shadow-lg flex flex-col relative overflow-hidden border dark:border-gray-700">
                <div class="p-4 border-b dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 flex justify-between items-center">
                    <div>
                        <div class="font-bold dark:text-white text-lg" id="chat-header">اختر محادثة</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400" id="chat-subheader">...</div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="window.openSupportUserProfile()" id="view-profile-btn" class="hidden text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 p-2 rounded-lg transition" title="عرض البروفايل"><i class="fas fa-user"></i></button>
                        <button onclick="window.deleteEntireChat()" id="del-chat-btn" class="hidden text-red-500 hover:bg-red-50 p-2 rounded-lg transition" title="حذف المحادثة"><i class="fas fa-trash"></i></button>
                    </div>
                </div>

                <div id="admin-chat-msgs" class="flex-1 p-6 overflow-y-auto bg-gray-50 dark:bg-gray-900 space-y-3 custom-scrollbar">
                    <div class="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                        <i class="fas fa-inbox text-6xl mb-4"></i>
                        <p>${window.t?.('select-student') || 'حدد طالباً من القائمة لعرض المشكلة والرد عليها'}</p>
                    </div>
                </div>

                <div class="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800 hidden" id="admin-input-area">
                    <!-- صورة معاينة -->
                    <div id="admin-img-preview-wrap" class="hidden mb-2 relative inline-block">
                        <img id="admin-img-preview" class="h-20 rounded-xl border">
                        <button onclick="window.clearAdminSupportImg()" class="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-xs">&times;</button>
                    </div>
                    <div class="flex gap-3">
                        <label class="flex items-center justify-center w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition text-gray-500">
                            <i class="fas fa-image"></i>
                            <input type="file" id="admin-support-img" accept="image/*" class="hidden" onchange="window.previewAdminSupportImg(this)">
                        </label>
                        <input type="text" id="admin-support-input" class="flex-grow p-3 rounded-xl border bg-gray-100 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold" placeholder="${window.t?.('write-reply') || 'اكتب الرد هنا...'}">
                        <button id="admin-send-btn" class="bg-blue-600 text-white px-6 rounded-xl font-bold hover:bg-blue-700 shadow-lg transition">${window.t?.('btn-send') || 'إرسال'}</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    onSnapshot(query(collection(db, "support_chats"), orderBy("lastUpdated", "desc")), (snap) => {
        const list = document.getElementById('tickets-list');
        list.innerHTML = '';

        if (snap.empty) {
            list.innerHTML = `<div class="text-center p-10 text-gray-400">${window.t?.('no-tickets') || 'لا توجد تذاكر حالياً.'}</div>`;
            return;
        }

        snap.forEach(d => {
            const t = d.data();
            const names = getStructureName(t.collegeId, t.departmentId) || { colName: 'غير محدد', deptName: '' };
            const fullInfo = names.colName !== 'غير محدد' ? names.colName : (t.email || 'مستخدم');

            let timeStr = '';
            if (t.lastUpdated) {
                const date = t.lastUpdated.toDate();
                timeStr = date.getDate() === new Date().getDate()
                    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : date.toLocaleDateString();
            }

            list.innerHTML += `
                <div onclick="window.loadAdminChat('${d.id}', '${t.userName}', '${fullInfo}')" class="p-3 rounded-xl border border-transparent cursor-pointer transition flex items-center gap-3 ${activeAdminTargetId === d.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700 border-b dark:border-b-gray-700'}">
                    <div class="relative">
                        <img src="${t.userPhoto || 'https://ui-avatars.com/api/?background=random&name=' + t.userName}" class="w-10 h-10 rounded-full object-cover shadow-sm">
                        ${t.hasUnreadAdmin ? '<span class="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full animate-pulse"></span>' : ''}
                    </div>
                    <div class="flex-grow min-w-0">
                        <div class="flex justify-between items-center">
                            <h4 class="font-bold dark:text-white text-sm truncate">${t.userName || 'مستخدم'}</h4>
                            <span class="text-[10px] text-gray-400">${timeStr}</span>
                        </div>
                        <div class="text-[10px] text-blue-500 font-bold truncate mb-0.5">${fullInfo}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 truncate">${t.lastMessage || '...'}</div>
                    </div>
                </div>`;
        });
    });

    document.getElementById('admin-send-btn').onclick = () => sendMsg('admin');
    document.getElementById('admin-support-input').onkeypress = (e) => { if (e.key === 'Enter') sendMsg('admin'); };
};

// ============================================================
// 6. تحميل المحادثة للأدمن
// ============================================================
window.loadAdminChat = (uid, name, info) => {
    activeAdminTargetId = uid;
    document.getElementById('chat-header').textContent = name;
    document.getElementById('chat-subheader').textContent = info;
    document.getElementById('admin-input-area').classList.remove('hidden');
    document.getElementById('del-chat-btn').classList.remove('hidden');
    document.getElementById('view-profile-btn').classList.remove('hidden');
    loadMessages(uid, 'admin-chat-msgs');
    updateDoc(doc(db, "support_chats", uid), { hasUnreadAdmin: false }).catch(e => console.log(e));
};

// فتح بروفايل المستخدم من الدعم الفني
window.openSupportUserProfile = () => {
    if (activeAdminTargetId) {
        window.location.hash = `#profile/${activeAdminTargetId}`;
    }
};

// معاينة الصورة في الأدمن
window.previewAdminSupportImg = (input) => {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('admin-img-preview').src = e.target.result;
            document.getElementById('admin-img-preview-wrap').classList.remove('hidden');
        };
        reader.readAsDataURL(input.files[0]);
    }
};

// مسح الصورة
window.clearAdminSupportImg = () => {
    document.getElementById('admin-support-img').value = '';
    document.getElementById('admin-img-preview-wrap').classList.add('hidden');
};

// ============================================================
// 7. دالة تحميل الرسائل المشتركة
// ============================================================
const loadMessages = (uid, containerId) => {
    const box = document.getElementById(containerId);
    if (!box) return;

    if (currentChatUnsubscribe) currentChatUnsubscribe();

    const q = query(collection(db, "support_chats", uid, "messages"), orderBy("createdAt", "asc"));

    // تحديد السياق: هل هذا صندوق الأدمن أم الطالب؟
    const isAdminView = containerId === 'admin-chat-msgs';

    currentChatUnsubscribe = onSnapshot(q, (snap) => {
        box.innerHTML = '';

        if (snap.empty) {
            box.innerHTML = `<div class="text-center p-10 text-gray-400 text-sm">${window.t?.('chat-start') || 'بداية المحادثة.'}</div>`;
            return;
        }

        snap.forEach(d => {
            const m = d.data();
            let isMe = false;

            if (isAdminView) {
                isMe = m.isStaff === true;
            } else {
                isMe = !m.isStaff;
            }

            const imgHtml = m.imageUrl ? `
                <div class="mb-2">
                    <img src="${m.imageUrl}" loading="lazy" class="max-w-[200px] max-h-[200px] rounded-lg cursor-pointer hover:opacity-90 border-2 border-white/20" onclick="window.open('${m.imageUrl}', '_blank')">
                </div>` : '';

            const time = m.createdAt ? m.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...';

            const bubbleClass = isMe
                ? 'bg-blue-600 text-white rounded-br-none'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-bl-none';

            const alignment = isMe ? 'justify-end' : 'justify-start';

            let senderLabel = '';
            if (isAdminView && !isMe) {
                senderLabel = '';
            } else if (!isAdminView && !isMe) {
                senderLabel = `<span class="block text-[10px] text-blue-600 font-bold mb-1">${window.t?.('technical-support') || 'الدعم الفني'} 🎧</span>`;
            }

            box.innerHTML += `
                <div class="flex ${alignment} mb-3 animate-fade-in">
                    <div class="${bubbleClass} px-4 py-3 rounded-2xl text-sm max-w-[85%] shadow-sm relative group">
                        ${senderLabel}
                        ${imgHtml}
                        <p class="whitespace-pre-wrap leading-relaxed">${window.sanitizeHTML?.(m.text) || ''}</p>
                        <span class="text-[9px] block mt-1 opacity-60 text-right ${isMe ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}">${time}</span>
                    </div>
                </div>`;
        });

        box.scrollTop = box.scrollHeight;
    });
};

// ============================================================
// 8. حذف المحادثة
// ============================================================
window.deleteEntireChat = async () => {
    if (!activeAdminTargetId) return;
    if (!confirm(window.t?.('delete-chat-warning') || "⚠️ تحذير: حذف المحادثة لا يمكن التراجع عنه!")) return;

    const btn = document.getElementById('del-chat-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const msgs = await getDocs(collection(db, "support_chats", activeAdminTargetId, "messages"));
        const batch = writeBatch(db);
        msgs.forEach(m => batch.delete(m.ref));
        batch.delete(doc(db, "support_chats", activeAdminTargetId));
        await batch.commit();

        document.getElementById('admin-chat-msgs').innerHTML = '';
        document.getElementById('admin-input-area').classList.add('hidden');
        document.getElementById('del-chat-btn').classList.add('hidden');
        document.getElementById('chat-header').textContent = 'تم الحذف';
        activeAdminTargetId = null;

    } catch (e) { console.error(e); alert(window.t?.('error') || "خطأ"); }
    finally { btn.innerHTML = '<i class="fas fa-trash"></i>'; }
};