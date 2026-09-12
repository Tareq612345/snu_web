// ============================================================
// auth.js - نظام المصادقة (محدث: الكارنيه + العلامة الزرقاء)
// ============================================================

import { auth, provider, db, SUPER_ADMIN_EMAIL } from './firebase.js';
import { checkRoute } from './events.js';
import { loadStudySections, setupNotificationListener, checkLiveSession, uploadToCloudinary } from './cms.js';
import { loadQuizQuestionsForUser } from './quiz.js';
import { UNIVERSITY_STRUCTURE, getStructureName } from './structure.js';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, serverTimestamp, increment, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { updateStreak, renderStreakWidget } from './features.js';

// دالة حساب الوقت النسبي (آخر ظهور)
const timeAgo = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'الآن';
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;
    return date.toLocaleDateString('ar-EG');
};
window._adminTimeAgo = timeAgo;

// ============================================================
// إشعار الـ Owner لما حد يرفع كارنيه
// ============================================================
const notifyOwnerAboutIdUpload = async (userName) => {
    try {
        await setDoc(doc(db, "system", "pendingIds"), {
            count: increment(1),
            lastUpload: serverTimestamp(),
            lastUploader: userName
        }, { merge: true });
    } catch (e) {
        console.log('ID notification error:', e);
    }
};
// ============================================================
// دالة تسجيل الخروج
// ============================================================
export const handleSignOut = async () => {
    if (!confirm("هل أنت متأكد من تسجيل الخروج؟")) return;
    try {
        const user = auth.currentUser;
        if (user) await updateDoc(doc(db, "users", user.uid), { isOnline: false, lastLogout: new Date(), lastSeen: serverTimestamp() });
        await signOut(auth);
        window.location.reload();
    } catch (e) { window.location.reload(); }
};
window.handleSignOut = handleSignOut;

// ============================================================
// 1. التحقق من الاسم (إجباري)
// ============================================================
const checkUserNameValidity = async (user) => {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    const currentName = snap.data().displayName || "";
    // التحقق من أن الاسم ليس فارغاً أو يحتوي على آثار التخريب القديم
    const isInvalid = !currentName || currentName.trim() === "" || currentName.includes("مسرب") || currentName.includes("Hacked");

    if (isInvalid) {
        document.getElementById('loading-screen').classList.add('hidden');
        const modal = document.getElementById('name-force-modal');
        const input = document.getElementById('force-name-input');
        const btn = document.getElementById('save-force-name-btn');

        modal.classList.remove('hidden');

        btn.onclick = async () => {
            const newName = input.value.trim();
            if (newName.length < 5) return alert(window.t?.('name-too-short') || "يرجى كتابة الاسم الثلاثي (5 حروف على الأقل).");

            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${window.t?.('saving') || 'جاري الحفظ...'}`;
            btn.disabled = true;

            try {
                await updateDoc(userRef, { displayName: newName });
                alert(window.t?.('name-updated') || "✅ تم تحديث اسمك بنجاح!");
                window.location.reload();
            } catch (e) {
                console.error(e);
                alert(window.t?.('error-try-again') || "حدث خطأ، حاول مرة أخرى.");
                btn.innerHTML = window.t?.('save-and-enter') || 'حفظ والدخول للمنصة 🚀';
                btn.disabled = false;
            }
        };
        return false; // أوقف التحميل
    }
    return true; // أكمل
};

// ============================================================
// 2. التحقق من الكارنيه (الميزة الجديدة - إجباري)
// ============================================================
const checkIdCard = async (user) => {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    const userData = snap.data();

    // استثناء: إذا كان هو مالك المنصة، لا تطلب منه كارنيه
    if (user.email === SUPER_ADMIN_EMAIL) return true;

    // التحقق هل الكارنيه مرفوض؟
    if (userData.idCardRejected) {
        document.getElementById('loading-screen').classList.add('hidden');
        const modal = document.getElementById('id-card-modal');
        const btn = document.getElementById('upload-id-btn');
        const input = document.getElementById('id-card-file');
        const modalContentDiv = modal.querySelector('.p-8.text-center');

        // إزالة أي rejection box قديم
        const oldRejectionBox = document.getElementById('rejection-reason-box');
        if (oldRejectionBox) oldRejectionBox.remove();

        // إنشاء صندوق سبب الرفض مع نموذج تعديل البيانات
        const rejectionBox = document.createElement('div');
        rejectionBox.id = 'rejection-reason-box';
        rejectionBox.className = 'mb-4 bg-red-50 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-700 rounded-2xl p-4 text-right relative';
        rejectionBox.innerHTML = `
            <div class="flex items-center justify-center gap-2 mb-3">
                <i class="fas fa-exclamation-triangle text-red-500 text-xl"></i>
                <span class="font-bold text-red-600 dark:text-red-400">تم رفض الطلب السابق</span>
            </div>
            <div class="bg-white dark:bg-gray-800 px-4 py-2 rounded-xl text-red-700 dark:text-red-300 font-bold text-sm border border-red-200 dark:border-red-600 mb-4 text-center">
                ${userData.idCardRejectionReason || 'يرجى تصحيح البيانات ورفع صورة أوضح'}
            </div>
            
            <p class="text-gray-600 dark:text-gray-400 text-sm mb-3 text-center">يمكنك تعديل بياناتك قبل إعادة الإرسال:</p>
            
            <div class="space-y-3 mb-4">
                <div>
                    <label class="block text-sm font-bold mb-1 text-gray-700 dark:text-gray-300">الاسم الرباعي</label>
                    <input type="text" id="reject-fullname" value="${userData.fullName || userData.displayName || ''}" 
                           class="w-full p-3 border rounded-xl dark:bg-gray-700 dark:text-white text-right" placeholder="الاسم الرباعي كما في البطاقة">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-1 text-gray-700 dark:text-gray-300">الرقم القومي</label>
                    <input type="text" id="reject-nationalid" value="${userData.nationalId || ''}" maxlength="14"
                           class="w-full p-3 border rounded-xl dark:bg-gray-700 dark:text-white font-mono text-center" placeholder="14 رقم"
                           oninput="this.value = this.value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^0-9]/g, '')">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-1 text-gray-700 dark:text-gray-300">الرقم الجامعي</label>
                    <input type="text" id="reject-studentid" value="${userData.studentId || ''}" maxlength="9"
                           class="w-full p-3 border rounded-xl dark:bg-gray-700 dark:text-white font-mono text-center" placeholder="9 أرقام"
                           oninput="this.value = this.value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^0-9]/g, '')">
                </div>
            </div>
            
            <p class="text-gray-500 text-xs text-center">ارفع صورة جديدة واضحة للكارنيه</p>
        `;

        // إضافة في بداية محتوى الـ modal
        if (modalContentDiv) {
            modalContentDiv.insertBefore(rejectionBox, modalContentDiv.firstChild);
        }

        // إظهار الـ modal
        modal.classList.remove('hidden');

        // تفعيل الزر مؤقتاً إذا كان معطل (سيتفعل عند اختيار صورة)
        // لكن نحتاج نربط الـ onclick بشكل صحيح

        // حفظ الـ handler الأصلي للزر
        const originalOnClick = btn.onclick;

        btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!input.files || !input.files[0]) {
                alert(window.t?.('select-id-first') || "يرجى اختيار صورة الكارنيه أولاً");
                return;
            }

            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الرفع...';
            btn.disabled = true;

            try {
                // رفع الصورة لـ Cloudinary
                const url = await uploadToCloudinary(input.files[0]);

                // جمع البيانات المعدلة من النموذج
                const newFullName = document.getElementById('reject-fullname')?.value?.trim() || userData.fullName;
                const newNationalId = document.getElementById('reject-nationalid')?.value?.trim() || userData.nationalId;
                const newStudentId = document.getElementById('reject-studentid')?.value?.trim() || userData.studentId;

                // تحديث بيانات الطالب - إزالة حالة الرفض + تحديث البيانات
                await updateDoc(userRef, {
                    idCardImage: url,
                    idCardUploadedAt: new Date(),
                    isVerified: false,
                    idCardRejected: false,
                    idCardRejectionReason: null,
                    fullName: newFullName,
                    displayName: newFullName,
                    nationalId: newNationalId,
                    studentId: newStudentId
                });

                alert(window.t?.('id-uploaded') || "✅ تم رفع الهوية بنجاح. سيتم مراجعتها من قبل الإدارة.");
                notifyOwnerAboutIdUpload(user.displayName || user.email);
                window.location.reload();
            } catch (err) {
                console.error(err);
                alert((window.t?.('upload-failed') || "فشل الرفع") + ": " + err.message);
                btn.innerHTML = '<i class="fas fa-upload"></i> رفع وتفعيل';
                btn.disabled = false;
            }
        };

        return false;
    }

    // التحقق هل حقل الصورة موجود؟
    if (!userData.idCardImage) {
        document.getElementById('loading-screen').classList.add('hidden');
        const modal = document.getElementById('id-card-modal');
        const btn = document.getElementById('upload-id-btn');
        const input = document.getElementById('id-card-file');

        modal.classList.remove('hidden');

        btn.onclick = async () => {
            if (!input.files || !input.files[0]) return alert(window.t?.('select-id-first') || "يرجى اختيار صورة الكارنيه أولاً");

            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${window.t?.('uploading-verifying') || 'جاري الرفع والتحقق...'}`;
            btn.disabled = true;

            try {
                // رفع الصورة لـ Cloudinary
                const url = await uploadToCloudinary(input.files[0]);

                // تحديث بيانات الطالب
                await updateDoc(userRef, {
                    idCardImage: url,
                    idCardUploadedAt: new Date(),
                    isVerified: false // الافتراضي غير موثق حتى يراجعه الأدمن
                });

                alert(window.t?.('id-uploaded') || "✅ تم رفع الهوية بنجاح. سيتم مراجعتها من قبل الإدارة.");
                notifyOwnerAboutIdUpload(user.displayName || user.email);
                window.location.reload();
            } catch (e) {
                console.error(e);
                alert((window.t?.('upload-failed') || "فشل الرفع") + ": " + e.message);
                btn.innerHTML = `<i class="fas fa-upload"></i> ${window.t?.('upload-id-activate') || 'رفع الكارنيه وتفعيل الحساب'}`;
                btn.disabled = false;
            }
        };
        return false; // أوقف التحميل، المستخدم عالق هنا حتى يرفع الصورة
    }
    return true; // أكمل
};

// ============================================================
// 2.5 التحقق من التوثيق (تخزين الحالة بدون حظر)
// ============================================================
const checkVerificationStatus = async (user) => {
    // استثناء السوبر أدمن
    if (user.email === SUPER_ADMIN_EMAIL) {
        window.isUserVerified = true;
        return true;
    }

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    const userData = snap.data();

    // تخزين حالة التوثيق للاستخدام في أماكن أخرى
    window.isUserVerified = userData.isVerified === true;

    // إذا كان غير موثق - نظهر بانر تحذيري بدلاً من الحظر الكامل
    if (!window.isUserVerified) {
        // إضافة بانر تنبيه (يظهر مرة واحدة)
        if (!document.getElementById('verification-warning-banner')) {
            const banner = document.createElement('div');
            banner.id = 'verification-warning-banner';
            banner.className = 'fixed top-0 left-0 right-0 z-[500] bg-gradient-to-r from-orange-500 to-amber-500 text-white py-3 px-4 text-center shadow-lg animate-slide-down';
            banner.innerHTML = `
                <div class="max-w-4xl mx-auto flex items-center justify-center gap-3 flex-wrap">
                    <i class="fas fa-hourglass-half animate-pulse"></i>
                    <span class="font-bold text-sm">حسابك في انتظار التوثيق - بعض المحتوى محظور حتى يتم قبول الهوية</span>
                    <button onclick="this.parentElement.parentElement.classList.add('hidden')" class="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-xs font-bold transition">
                        <i class="fas fa-times"></i> إخفاء
                    </button>
                </div>
            `;
            document.body.appendChild(banner);

            // إضافة padding للـ body
            document.body.style.paddingTop = '48px';
        }
    }

    // إزالة أي شاشة انتظار قديمة
    const pendingScreen = document.getElementById('verification-pending-screen');
    if (pendingScreen) pendingScreen.remove();

    return true; // السماح بالدخول دائماً
};

// ============================================================
// 3. التحقق من اختيار الكلية والقسم
// ============================================================
const checkUserCollegeSelection = async (user) => {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists() || !snap.data().collegeId || !snap.data().departmentId) {
        document.getElementById('loading-screen').classList.add('hidden');
        showCollegeSelectionModal(user.uid);
        return false;
    }
    return true;
};

const showCollegeSelectionModal = (userId) => {
    const modal = document.getElementById('college-selector-modal');
    const colSelect = document.getElementById('modal-college-select');
    const deptSelect = document.getElementById('modal-dept-select');
    const deptWrapper = document.getElementById('modal-dept-wrapper');
    const saveBtn = document.getElementById('save-college-selection');
    if (!modal) return;
    modal.classList.remove('hidden');

    // ملء الكليات
    colSelect.innerHTML = '<option value="">-- اختر الكلية --</option>';
    UNIVERSITY_STRUCTURE.forEach(col => {
        colSelect.innerHTML += `<option value="${col.id}">${col.name}</option>`;
    });

    colSelect.onchange = () => {
        const colId = colSelect.value;
        deptSelect.innerHTML = '<option value="">-- اختر القسم --</option>';
        if (!colId) { deptWrapper.classList.add('hidden'); return; }
        const selectedCol = UNIVERSITY_STRUCTURE.find(c => c.id === colId);
        if (selectedCol?.departments?.length > 0) {
            selectedCol.departments.forEach(dept => deptSelect.innerHTML += `<option value="${dept.id}">${dept.name}</option>`);
            deptWrapper.classList.remove('hidden');
        } else { deptWrapper.classList.add('hidden'); }
    };

    saveBtn.onclick = async () => {
        const colId = colSelect.value;
        const deptId = deptSelect.value;
        const nationalIdInput = document.getElementById('modal-national-id');
        const studentIdInput = document.getElementById('modal-student-id');
        const fullNameInput = document.getElementById('modal-full-name');

        const nationalId = nationalIdInput?.value?.trim() || '';
        const studentId = studentIdInput?.value?.trim() || '';
        const fullName = fullNameInput?.value?.trim() || '';

        // التحقق من الكلية والقسم
        if (!colId) return alert(window.t?.('select-college-required') || "يرجى اختيار الكلية");
        if (!deptWrapper.classList.contains('hidden') && !deptId) return alert(window.t?.('select-department-required') || "يرجى اختيار القسم");

        // التحقق من الاسم الرباعي (على الأقل كلمتين)
        if (fullName.split(' ').filter(w => w.length > 1).length < 2) {
            fullNameInput.classList.add('ring-2', 'ring-red-500');
            return alert("يرجى إدخال الاسم الرباعي كما هو مدوّن في بطاقة الهوية");
        }
        fullNameInput.classList.remove('ring-2', 'ring-red-500');

        // التحقق من الرقم القومي (14 رقم)
        if (!/^\d{14}$/.test(nationalId)) {
            nationalIdInput.classList.add('ring-2', 'ring-red-500');
            return alert("يرجى إدخال الرقم القومي بشكل صحيح");
        }
        nationalIdInput.classList.remove('ring-2', 'ring-red-500');

        // التحقق من الرقم الجامعي (9 أرقام)
        if (!/^\d{9}$/.test(studentId)) {
            studentIdInput.classList.add('ring-2', 'ring-red-500');
            return alert("يرجى إدخال الرقم الجامعي بشكل صحيح");
        }
        studentIdInput.classList.remove('ring-2', 'ring-red-500');

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i> جاري الحفظ...';

        try {
            await updateDoc(doc(db, "users", userId), {
                collegeId: colId,
                departmentId: deptId || 'all',
                nationalId: nationalId,
                studentId: studentId,
                fullName: fullName,
                displayName: fullName // الاسم يُحدّث تلقائياً
            });
            window.location.reload();
        } catch (error) {
            alert(window.t?.('error-occurred') || "حدث خطأ.");
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'حفظ ومتابعة 🚀';
        }
    };
};

// ============================================================
// تحميل البروفايل (مع العلامة الزرقاء)
// ============================================================
export const loadUserProfile = async (targetUserId) => {
    ['home-screen', 'study-sections-container', 'subsection-viewer', 'quiz-section', 'leaderboard-section', 'scores-section', 'assignments-section', 'admin-view-area', 'profile-section', 'admin-settings-section'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });

    document.getElementById('profile-section').classList.remove('hidden');
    const container = document.getElementById('profile-section');
    container.innerHTML = '<div class="text-center p-10"><i class="fas fa-spinner fa-spin text-3xl text-blue-600"></i></div>';

    const currentUser = auth.currentUser;
    const isOwner = currentUser && currentUser.uid === targetUserId;

    try {
        const userDoc = await getDoc(doc(db, "users", targetUserId));
        if (!userDoc.exists()) { container.innerHTML = '<p class="text-center">المستخدم غير موجود.</p>'; return; }

        const userData = userDoc.data();
        const structNames = getStructureName(userData.collegeId, userData.departmentId);
        const isVerified = userData.isVerified === true; // التحقق من التوثيق

        const scoresSnap = await getDocs(query(collection(db, "user_scores"), where("userId", "==", targetUserId)));
        let totalScore = 0; scoresSnap.forEach(d => totalScore += (d.data().score || 0));

        let badgesHTML = '';
        if (userData.badges && userData.badges.length > 0) {
            badgesHTML = userData.badges.map(b => `<span title="${b.title}" class="text-3xl mx-1">${b.icon}</span>`).join('');
        }

        // التحقق من صلاحيات الأدمن للمستخدم الحالي
        const isAdmin = currentUser && await checkAdminStatus(currentUser);

        // الألوان المتاحة للثيم
        const themeColors = [
            { id: 'indigo', gradient: 'from-blue-500 to-indigo-600', color: '#14b8a6' },
            { id: 'blue', gradient: 'from-blue-500 to-indigo-500', color: '#3b82f6' },
            { id: 'green', gradient: 'from-green-500 to-emerald-500', color: '#22c55e' },
            { id: 'pink', gradient: 'from-pink-500 to-rose-500', color: '#ec4899' },
            { id: 'orange', gradient: 'from-orange-500 to-red-500', color: '#f97316' },
            { id: 'purple', gradient: 'from-indigo-600 to-pink-500', color: '#9333ea' }
        ];
        const userTheme = themeColors.find(t => t.id === userData.profileTheme) || themeColors[0];
        const coverImage = userData.coverPhoto || '';

        // نظام المتابعة - جلب البيانات
        let followersCount = 0;
        let followingCount = 0;
        let isFollowing = false;
        let isFollowedBack = false;

        try {
            // عدد المتابعين (الناس اللي متابعاه)
            const followersSnap = await getDocs(query(collection(db, "follows"), where("followingId", "==", targetUserId)));
            followersCount = followersSnap.size;

            // عدد المتابَعين (الناس اللي بيتابعهم)
            const followingSnap = await getDocs(query(collection(db, "follows"), where("followerId", "==", targetUserId)));
            followingCount = followingSnap.size;

            // هل أنا متابعه؟
            if (currentUser && !isOwner) {
                const followDocSnap = await getDocs(query(collection(db, "follows"),
                    where("followerId", "==", currentUser.uid),
                    where("followingId", "==", targetUserId)));
                isFollowing = !followDocSnap.empty;

                // هل هو متابعني؟ (لعرض "رد المتابعة")
                const followBackSnap = await getDocs(query(collection(db, "follows"),
                    where("followerId", "==", targetUserId),
                    where("followingId", "==", currentUser.uid)));
                isFollowedBack = !followBackSnap.empty;
            }
        } catch (e) {
            console.warn('Follow data error:', e);
        }

        container.innerHTML = `
            <div class="max-w-4xl mx-auto pb-20 animate-fade-in">
                <!-- Cover Photo Section -->
                <div class="relative h-48 md:h-64 rounded-t-3xl overflow-hidden group">
                    ${coverImage ? `
                        <img src="${coverImage}" class="w-full h-full object-cover">
                    ` : `
                        <div class="w-full h-full bg-gradient-to-r ${userTheme.gradient}"></div>
                    `}
                    
                    <!-- Overlay Pattern -->
                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                    
                    ${isOwner ? `
                    <!-- Cover Edit Button -->
                    <button onclick="document.getElementById('cover-upload').click()" class="absolute top-4 left-4 bg-white/20 backdrop-blur text-white px-4 py-2 rounded-full text-sm font-bold hover:bg-white/30 transition flex items-center gap-2">
                        <i class="fas fa-camera"></i>
                        <span class="hidden md:inline">تغيير الغلاف</span>
                    </button>
                    <input type="file" id="cover-upload" class="hidden" accept="image/*">
                    ` : ''}
                    
                    ${isAdmin ? `
                    <!-- Admin Edit Data Button -->
                    <button onclick="window.editUserDataAsAdmin('${targetUserId}', '${userData.displayName?.replace(/'/g, "\\'") || ''}')" 
                            class="absolute top-4 right-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-4 py-2 rounded-full text-sm font-bold hover:from-yellow-600 hover:to-orange-600 transition flex items-center gap-2 shadow-lg">
                        <i class="fas fa-user-edit"></i>
                        <span class="hidden md:inline">تعديل البيانات</span>
                    </button>
                    ` : ''}
                    
                    <!-- Profile Avatar -->
                    <div class="absolute bottom-0 right-6 md:right-10">
                        <div class="relative group/avatar">
                            <img src="${userData.photoURL || 'https://ui-avatars.com/api/?name=' + userData.displayName}" 
                                class="w-28 h-28 md:w-36 md:h-36 rounded-full border-4 border-white dark:border-gray-800 shadow-2xl bg-white object-cover">
                            ${isOwner ? `
                            <div class="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition cursor-pointer" onclick="document.getElementById('profile-upload').click()">
                                <i class="fas fa-camera text-white text-2xl"></i>
                            </div>
                            <input type="file" id="profile-upload" class="hidden" accept="image/*">
                            ` : ''}
                            ${isVerified ? `
                            <div class="absolute bottom-1 right-1 bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center border-2 border-white shadow">
                                <i class="fas fa-check text-xs"></i>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <!-- Name & Role Badge (Over Cover) -->
                    <div class="absolute bottom-4 right-44 md:right-56 text-white">
                        <h2 class="text-2xl md:text-3xl font-black flex items-center gap-2 drop-shadow-lg">
                            ${userData.displayName}
                            ${userData.email === SUPER_ADMIN_EMAIL ? '<i class="fas fa-crown text-yellow-400"></i>' : ''}
                        </h2>
                        ${(isOwner || (currentUser && currentUser.email === SUPER_ADMIN_EMAIL)) ? `<p class="text-white/70 text-sm font-mono">${userData.email}</p>` : ''}
                        ${userData.isOnline ? '<p class="text-green-300 text-xs font-bold flex items-center gap-1 mt-1"><span class="w-2 h-2 bg-green-400 rounded-full inline-block animate-pulse"></span> متصل الآن</p>' : (userData.lastSeen ? `<p class="text-white/50 text-xs mt-1">آخر ظهور: ${timeAgo(userData.lastSeen)}</p>` : '')}
                    </div>
                </div>
                
                <!-- Main Profile Content -->
                <div class="bg-white dark:bg-gray-800 rounded-b-3xl shadow-xl pt-20 md:pt-8 md:pr-56 px-6 pb-8">
                    <div class="mt-2 mb-6 inline-block bg-blue-50 dark:bg-gray-700 px-6 py-3 rounded-xl">
                        <div class="text-blue-800 dark:text-blue-300 font-bold mb-1">${structNames.colName}</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400 border-t dark:border-gray-600 pt-1">${structNames.deptName}</div>
                    </div>
                    <div class="flex justify-center mb-6">${badgesHTML}</div>
                    
                    <!-- Follow Stats & Button -->
                    <div class="flex items-center justify-between flex-wrap gap-4 mb-6 p-4 bg-gradient-to-r from-blue-50 to-blue-50 dark:from-blue-900/20 dark:to-blue-900/20 rounded-2xl">
                        <div class="flex gap-6">
                            <button onclick="window.showFollowList('${targetUserId}', 'followers')" class="text-center hover:scale-105 transition cursor-pointer">
                                <div class="text-2xl font-black text-blue-600 dark:text-blue-400">${followersCount}</div>
                                <div class="text-xs text-gray-500 font-bold">متابعين</div>
                            </button>
                            <button onclick="window.showFollowList('${targetUserId}', 'following')" class="text-center hover:scale-105 transition cursor-pointer">
                                <div class="text-2xl font-black text-indigo-600 dark:text-indigo-400">${followingCount}</div>
                                <div class="text-xs text-gray-500 font-bold">يتابع</div>
                            </button>
                        </div>
                        
                        ${!isOwner && currentUser ? `
                        <div class="flex items-center gap-2">
                            ${isFollowedBack && !isFollowing ? '<span class="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 px-2 py-1 rounded-full font-bold">يتابعك</span>' : ''}
                            <button id="follow-btn" onclick="window.toggleFollow('${targetUserId}', ${isFollowing})" 
                                class="${isFollowing
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 hover:text-red-600'
                    : 'bg-gradient-to-r from-blue-600 to-blue-600 text-white hover:from-blue-700 hover:to-blue-700'} 
                                px-6 py-2 rounded-xl font-bold text-sm transition shadow-lg flex items-center gap-2">
                                <i class="fas ${isFollowing ? 'fa-user-check' : 'fa-user-plus'}"></i>
                                ${isFollowing ? 'تتابعه ✓' : (isFollowedBack ? 'تابعه' : 'متابعة')}
                            </button>
                            <button onclick="window.showReportUserModal('${targetUserId}', '${userData.displayName?.replace(/'/g, "\\'") || 'مستخدم'}')" 
                                class="w-10 h-10 bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-red-100 hover:text-red-600 rounded-xl transition flex items-center justify-center" title="إبلاغ">
                                <i class="fas fa-flag"></i>
                            </button>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl">
                            <div class="text-3xl font-bold text-blue-600">${totalScore}</div>
                            <div class="text-xs text-gray-500 font-bold mt-1">النقاط</div>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl">
                            <div class="text-3xl font-bold text-orange-500">${userData.currentStreak || 0}</div>
                            <div class="text-xs text-gray-500 font-bold mt-1">🔥 Streak</div>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl">
                            <div class="text-3xl font-bold text-green-500">${userData.bestStreak || 0}</div>
                            <div class="text-xs text-gray-500 font-bold mt-1">أفضل Streak</div>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl">
                            <div class="text-3xl font-bold text-indigo-500">${userData.totalXp || 0}</div>
                            <div class="text-xs text-gray-500 font-bold mt-1">XP</div>
                        </div>
                    </div>
                    
                    ${(isOwner || (currentUser && currentUser.email === SUPER_ADMIN_EMAIL)) && (userData.fullName || userData.nationalId || userData.studentId) ? `
                    <!-- بيانات الطالب الرسمية -->
                    <div class="mb-8 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-6 rounded-2xl border border-blue-200 dark:border-blue-800">
                        <h3 class="font-bold text-blue-800 dark:text-blue-300 mb-4 flex items-center gap-2 text-lg">
                            <i class="fas fa-id-card"></i> البيانات الرسمية
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="bg-white dark:bg-gray-800 p-4 rounded-xl border border-blue-100 dark:border-blue-700">
                                <div class="text-xs text-gray-500 mb-1 font-bold">الاسم الرباعي</div>
                                <div class="text-lg font-black text-blue-700 dark:text-blue-400">${userData.fullName || '-'}</div>
                            </div>
                            <div class="bg-white dark:bg-gray-800 p-4 rounded-xl border border-blue-100 dark:border-blue-700">
                                <div class="text-xs text-gray-500 mb-1 font-bold">الرقم القومي</div>
                                <div class="text-lg font-mono font-black text-blue-700 dark:text-blue-400 direction-ltr">${userData.nationalId || '-'}</div>
                            </div>
                            <div class="bg-white dark:bg-gray-800 p-4 rounded-xl border border-blue-100 dark:border-blue-700">
                                <div class="text-xs text-gray-500 mb-1 font-bold">الرقم الجامعي</div>
                                <div class="text-lg font-mono font-black text-blue-700 dark:text-blue-400">${userData.studentId || '-'}</div>
                            </div>
                        </div>
                    </div>
                    ` : ''}
                    
                    ${(isOwner || (currentUser && currentUser.email === SUPER_ADMIN_EMAIL)) ? `
                    <!-- سجل الدرجات -->
                    <div class="mb-8 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-6 rounded-2xl border border-green-200 dark:border-green-800">
                        <h3 class="font-bold text-green-800 dark:text-green-300 mb-4 flex items-center gap-2 text-lg">
                            <i class="fas fa-graduation-cap"></i> ${isOwner ? 'سجل درجاتي' : 'سجل درجات الطالب'}
                        </h3>
                        
                        <!-- تبويبات -->
                        <div class="flex gap-2 mb-4 flex-wrap">
                            <button id="grades-tab-final" class="py-2 px-4 rounded-xl font-bold text-sm bg-green-600 text-white shadow-lg transition">الفاينل 📊</button>
                            <button id="grades-tab-quizzes" class="py-2 px-4 rounded-xl font-bold text-sm bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition">الاختبارات</button>
                            <button id="grades-tab-assignments" class="py-2 px-4 rounded-xl font-bold text-sm bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition">الواجبات</button>
                        </div>
                        
                        <!-- محتوى الفاينل -->
                        <div id="grades-content-final">
                            <div class="space-y-2 max-h-64 overflow-y-auto" id="grades-final-list">
                                <p class="text-center text-gray-500 py-4"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</p>
                            </div>
                        </div>
                        
                        <!-- محتوى الاختبارات -->
                        <div id="grades-content-quizzes" class="hidden">
                            <div class="space-y-2 max-h-64 overflow-y-auto" id="grades-quizzes-list">
                                <p class="text-center text-gray-500 py-4"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</p>
                            </div>
                        </div>
                        
                        <!-- محتوى الواجبات -->
                        <div id="grades-content-assignments" class="hidden">
                            <div class="space-y-2 max-h-64 overflow-y-auto" id="grades-assignments-list">
                                <p class="text-center text-gray-500 py-4"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</p>
                            </div>
                        </div>
                    </div>
                    ` : ''}
                    
                    ${isOwner ? `
                    <!-- طلاب قد تعرفهم -->
                    <div class="mb-8 bg-gradient-to-br from-blue-50 to-pink-50 dark:from-indigo-900/20 dark:to-pink-900/20 p-6 rounded-2xl border border-blue-200 dark:border-indigo-800">
                        <h3 class="font-bold text-indigo-800 dark:text-blue-300 mb-4 flex items-center gap-2 text-lg">
                            <i class="fas fa-user-friends"></i> طلاب قد تعرفهم
                        </h3>
                        <div id="suggested-users-list" class="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <p class="col-span-full text-center text-gray-400 py-4"><i class="fas fa-spinner fa-spin"></i> جاري البحث...</p>
                        </div>
                    </div>
                    ` : ''}
                    ${isAdmin && !isOwner ? `
                    <div class="mb-6 bg-gradient-to-br from-blue-50 to-pink-50 dark:from-indigo-900/20 dark:to-pink-900/20 p-5 rounded-2xl border border-blue-200 dark:border-indigo-800">
                        <h3 class="font-bold text-indigo-800 dark:text-blue-300 mb-4 flex items-center gap-2">
                            <i class="fas fa-user-shield"></i> أدوات الأدمن
                        </h3>
                        <div class="flex flex-wrap items-center gap-3">
                            <span class="${isVerified ? 'text-green-600 bg-green-100 dark:bg-green-900/30' : 'text-orange-500 bg-orange-100 dark:bg-orange-900/30'} font-bold text-sm flex items-center gap-2 px-4 py-2 rounded-full">
                                <i class="fas ${isVerified ? 'fa-check-circle' : 'fa-clock'}"></i>
                                ${isVerified ? 'موثق ✓' : 'غير موثق'}
                            </span>
                            ${isVerified ? `
                                <button onclick="window.verifyUser('${targetUserId}', false)" class="bg-red-500 text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-red-600 transition shadow-lg flex items-center gap-2">
                                    <i class="fas fa-times-circle"></i> إلغاء التوثيق
                                </button>
                            ` : `
                                <button onclick="window.verifyUser('${targetUserId}', true)" class="bg-green-500 text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-green-600 transition shadow-lg flex items-center gap-2">
                                    <i class="fas fa-check-circle"></i> توثيق الآن
                                </button>
                                ${userData.idCardImage ? `
                                <button onclick="window.rejectIdCard('${targetUserId}', '${userData.displayName?.replace(/'/g, "\\'") || 'الطالب'}')" class="bg-orange-500 text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-orange-600 transition shadow-lg flex items-center gap-2">
                                    <i class="fas fa-ban"></i> رفض الكارنيه
                                </button>
                                ` : ''}
                            `}
                            <button onclick="window.adminMessageUser('${targetUserId}', '${userData.displayName}')" class="bg-pink-500 text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-pink-600 transition shadow-lg flex items-center gap-2">
                                <i class="fas fa-envelope"></i> مراسلة
                            </button>
                            <button onclick="window.adminRemoveUserPhoto('${targetUserId}', '${userData.displayName?.replace(/'/g, "\\\\'")}')" class="bg-gray-500 text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-gray-600 transition shadow-lg flex items-center gap-2">
                                <i class="fas fa-user-slash"></i> إخفاء صورة البروفايل
                            </button>
                        </div>
                    </div>
                    ` : ''}
                    
                    ${/* قسم الكارنيه - للأدمن فقط */ ''}
                    ${isAdmin && userData.idCardImage ? `
                    <div class="mb-8 bg-gradient-to-br from-blue-50 to-blue-50 dark:from-blue-900/20 dark:to-blue-900/20 p-6 rounded-2xl border border-blue-200 dark:border-blue-800">
                        <h3 class="font-bold text-blue-800 dark:text-blue-300 mb-4 flex items-center gap-2">
                            <i class="fas fa-id-card"></i> صورة الكارنيه
                        </h3>
                        <div class="relative group cursor-pointer" onclick="window.open('${userData.idCardImage}', '_blank')">
                            <img src="${userData.idCardImage}" class="w-full max-h-64 object-contain rounded-xl border dark:border-gray-700">
                            <div class="absolute inset-0 bg-black/30 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                <span class="bg-white/90 px-4 py-2 rounded-full font-bold text-sm"><i class="fas fa-expand-alt"></i> تكبير</span>
                            </div>
                        </div>
                    </div>
                    ` : ''}
                    
                    ${isOwner ? `
                        <div class="border-t dark:border-gray-700 pt-6 text-right bg-gray-50 dark:bg-gray-700/30 p-6 rounded-2xl">
                            <h3 class="font-bold text-gray-700 dark:text-white mb-6 text-lg"><i class="fas fa-palette"></i> تخصيص البروفايل</h3>
                            
                            <!-- اختيار لون الثيم -->
                            <div class="mb-6">
                                <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-3 block">لون الغلاف:</label>
                                <div id="theme-picker" class="flex flex-wrap gap-3">
                                    ${themeColors.map(t => `
                                        <button onclick="window.setProfileTheme('${t.id}')" 
                                            class="w-10 h-10 rounded-full bg-gradient-to-r ${t.gradient} ${userData.profileTheme === t.id ? 'ring-4 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800' : ''} hover:scale-110 transition shadow-lg" 
                                            title="${t.id}">
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">الاسم الظاهر:</label>
                            <input type="text" id="edit-name" value="${userData.displayName}" class="w-full p-3 mb-4 border rounded-xl dark:bg-gray-800 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500">
                            
                            <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">نبذة شخصية:</label>
                            <textarea id="edit-bio" class="w-full p-3 border rounded-xl dark:bg-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" rows="3" placeholder="اكتب شيئاً عن نفسك...">${userData.bio || ''}</textarea>
                            
                            <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-between">
                                <span class="text-xs font-bold text-blue-800 dark:text-blue-300 flex items-center gap-2">
                                    <i class="fas fa-id-card"></i> حالة التوثيق
                                </span>
                                ${isVerified
                    ? '<span class="text-green-600 font-bold text-sm flex items-center gap-1 bg-green-100 dark:bg-green-900/30 px-3 py-1 rounded-full"><i class="fas fa-check-circle"></i> موثق</span>'
                    : '<span class="text-orange-500 font-bold text-sm flex items-center gap-1 bg-orange-100 dark:bg-orange-900/30 px-3 py-1 rounded-full"><i class="fas fa-clock"></i> قيد المراجعة</span>'}
                            </div>

                            <button id="save-profile-btn" class="mt-6 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 rounded-2xl font-bold hover:shadow-xl hover:shadow-blue-500/30 transition text-lg flex items-center justify-center gap-2">
                                <i class="fas fa-save"></i> حفظ التغييرات
                            </button>
                        </div>
                    ` : `
                        <div class="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl">
                            <p class="text-gray-600 dark:text-gray-300 italic">"${userData.bio || 'لا توجد نبذة شخصية.'}"</p>
                        </div>
                    `}
                </div>
            </div>
        `;

        if (isOwner) {
            // رفع صورة الشخصية
            document.getElementById('profile-upload').onchange = async (e) => {
                if (e.target.files.length > 0) {
                    try {
                        window.showToast?.(window.t?.('uploading-photo') || "جاري رفع الصورة...", "success");
                        const url = await uploadToCloudinary(e.target.files[0]);
                        await updateDoc(doc(db, "users", targetUserId), { photoURL: url });
                        loadUserProfile(targetUserId);
                    } catch (err) { alert((window.t?.('photo-upload-failed') || "فشل رفع الصورة") + ": " + err.message); }
                }
            };

            // رفع صورة الغلاف
            document.getElementById('cover-upload').onchange = async (e) => {
                if (e.target.files.length > 0) {
                    try {
                        window.showToast?.(window.t?.('uploading-cover') || "جاري رفع صورة الغلاف...", "success");
                        const url = await uploadToCloudinary(e.target.files[0]);
                        await updateDoc(doc(db, "users", targetUserId), { coverPhoto: url });
                        loadUserProfile(targetUserId);
                    } catch (err) { alert((window.t?.('cover-upload-failed') || "فشل رفع صورة الغلاف") + ": " + err.message); }
                }
            };

            // تغيير لون الثيم
            window.setProfileTheme = async (themeId) => {
                try {
                    await updateDoc(doc(db, "users", targetUserId), { profileTheme: themeId });
                    window.showToast?.(window.t?.('theme-changed') || "✅ تم تغيير لون الثيم", "success");
                    loadUserProfile(targetUserId);
                } catch (err) {
                    console.error(err);
                }
            };

            document.getElementById('save-profile-btn').onclick = async () => {
                const newName = document.getElementById('edit-name').value.trim();
                const newBio = document.getElementById('edit-bio').value.trim();

                if (!newName) return alert(window.t?.('name-cannot-be-empty') || "⚠️ لا يمكن ترك الاسم فارغاً!");

                const btn = document.getElementById('save-profile-btn');
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${window.t?.('saving') || 'جاري الحفظ...'}`;
                btn.disabled = true;

                try {
                    await updateDoc(doc(db, "users", targetUserId), {
                        displayName: newName,
                        bio: newBio
                    });
                    window.showToast?.(window.t?.('profile-updated') || "✅ تم تحديث بياناتك بنجاح", "success");
                    loadUserProfile(targetUserId);
                } catch (e) {
                    console.error(e);
                    alert((window.t?.('save-error') || "❌ حدث خطأ أثناء الحفظ") + ": " + e.message);
                    btn.innerHTML = `<i class="fas fa-save"></i> ${window.t?.('save-changes') || 'حفظ التغييرات'}`;
                    btn.disabled = false;
                }
            };
        }

        // تحميل سجل الدرجات (للمالك والأدمن)
        if (isOwner || isAdmin) {
            const loadGradesLog = async () => {
                // تحميل درجات الاختبارات
                const quizzesList = document.getElementById('grades-quizzes-list');
                try {
                    const quizzesSnap = await getDocs(query(collection(db, "user_scores"), where("userId", "==", targetUserId)));
                    if (quizzesSnap.empty) {
                        quizzesList.innerHTML = '<p class="text-center text-gray-400 py-4"><i class="fas fa-clipboard-list"></i> لا توجد اختبارات بعد</p>';
                    } else {
                        const quizData = [];
                        quizzesSnap.forEach(d => quizData.push({ id: d.id, ...d.data() }));
                        quizData.sort((a, b) => (b.date?.toDate?.() || 0) - (a.date?.toDate?.() || 0));

                        quizzesList.innerHTML = quizData.map(q => {
                            const dateStr = q.date?.toDate ? q.date.toDate().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }) : '';
                            const scoreColor = q.score >= 80 ? 'text-green-600 bg-green-100' : q.score >= 50 ? 'text-yellow-600 bg-yellow-100' : 'text-red-600 bg-red-100';
                            const hasDetails = q.examDetails && q.examDetails.length > 0;
                            return `
                                <div class="flex items-center justify-between bg-white dark:bg-gray-700 p-3 rounded-xl shadow-sm">
                                    <div class="flex-1">
                                        <p class="font-bold text-gray-800 dark:text-white text-sm">${q.quizTitle || 'اختبار'}</p>
                                        <p class="text-xs text-gray-400">${dateStr} • ${q.correct || 0}/${q.questionsCount || '?'} صحيح</p>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        ${hasDetails ? `<button onclick="window.showExamReview('${q.id}')" class="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg font-bold hover:bg-blue-200 transition"><i class="fas fa-eye"></i> مراجعة</button>` : ''}
                                        <span class="font-black text-lg ${scoreColor} px-3 py-1 rounded-full">${q.score}%</span>
                                    </div>
                                </div>
                            `;
                        }).join('');

                        // Store quiz data for review modal
                        window.storedExamData = quizData;
                    }
                } catch (e) {
                    console.error('Grades load error:', e);
                    quizzesList.innerHTML = '<p class="text-center text-red-400 py-4">حدث خطأ</p>';
                }

                // تحميل درجات الواجبات
                const assignmentsList = document.getElementById('grades-assignments-list');
                try {
                    const assignSnap = await getDocs(query(collection(db, "submissions"), where("userId", "==", targetUserId)));
                    if (assignSnap.empty) {
                        assignmentsList.innerHTML = '<p class="text-center text-gray-400 py-4"><i class="fas fa-file-alt"></i> لا توجد واجبات مسلمة بعد</p>';
                    } else {
                        const assignData = [];
                        assignSnap.forEach(d => assignData.push({ id: d.id, ...d.data() }));
                        assignData.sort((a, b) => (b.submittedAt?.toDate?.() || 0) - (a.submittedAt?.toDate?.() || 0));

                        assignmentsList.innerHTML = assignData.map(a => {
                            const dateStr = a.submittedAt?.toDate ? a.submittedAt.toDate().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }) : '';
                            const hasGrade = a.grade !== undefined && a.grade !== null;
                            const gradeColor = hasGrade ? (a.grade >= 80 ? 'text-green-600 bg-green-100' : a.grade >= 50 ? 'text-yellow-600 bg-yellow-100' : 'text-red-600 bg-red-100') : 'text-gray-500 bg-gray-100';
                            const gradeText = hasGrade ? `${a.grade}%` : 'قيد التصحيح';
                            return `
                                <div class="flex items-center justify-between bg-white dark:bg-gray-700 p-3 rounded-xl shadow-sm">
                                    <div class="flex-1">
                                        <p class="font-bold text-gray-800 dark:text-white text-sm">${a.assignmentTitle || 'واجب'}</p>
                                        <p class="text-xs text-gray-400">${dateStr}</p>
                                    </div>
                                    <div class="text-left">
                                        <span class="font-black text-sm ${gradeColor} px-3 py-1 rounded-full">${gradeText}</span>
                                    </div>
                                </div>
                            `;
                        }).join('');
                    }
                } catch (e) {
                    console.error('Assignments load error:', e);
                    assignmentsList.innerHTML = '<p class="text-center text-red-400 py-4">حدث خطأ</p>';
                }
            };

            // تشغيل تحميل الدرجات
            loadGradesLog();
            loadFinalGrades(); // تحميل درجات الفاينل

            // دالة تحميل درجات الفاينل
            async function loadFinalGrades() {
                const finalList = document.getElementById('grades-final-list');
                if (!finalList) return;

                try {
                    const gradesSnap = await getDocs(query(collection(db, "final_grades"), where("userId", "==", targetUserId)));

                    if (gradesSnap.empty) {
                        finalList.innerHTML = '<p class="text-center text-gray-500 py-4"><i class="fas fa-inbox opacity-50"></i> لا توجد درجات فاينل مسجلة</p>';
                        return;
                    }

                    let html = '';
                    gradesSnap.forEach(d => {
                        const g = d.data();
                        const percent = Math.round((g.score / g.maxScore) * 100);
                        const color = percent >= 85 ? 'bg-green-100 border-green-300' : percent >= 60 ? 'bg-yellow-100 border-yellow-300' : 'bg-red-100 border-red-300';
                        const textColor = percent >= 85 ? 'text-green-700' : percent >= 60 ? 'text-yellow-700' : 'text-red-700';

                        // التقدير
                        const getLetterGrade = (p) => {
                            if (p >= 90) return { grade: 'ممتاز', icon: '🌟', bg: 'bg-green-600' };
                            if (p >= 80) return { grade: 'جيد جداً', icon: '⭐', bg: 'bg-blue-600' };
                            if (p >= 70) return { grade: 'جيد', icon: '👍', bg: 'bg-indigo-600' };
                            if (p >= 60) return { grade: 'مقبول', icon: '✓', bg: 'bg-yellow-600' };
                            return { grade: 'راسب', icon: '✗', bg: 'bg-red-600' };
                        };
                        const letterGrade = getLetterGrade(percent);

                        html += `
                            <div class="flex justify-between items-center p-3 ${color} border rounded-xl">
                                <div class="font-bold text-gray-800">${g.subject}</div>
                                <div class="flex items-center gap-2">
                                    <span class="${letterGrade.bg} text-white px-2 py-1 rounded-lg text-xs font-bold">${letterGrade.icon} ${letterGrade.grade}</span>
                                    <span class="font-mono font-bold ${textColor}">${g.score}/${g.maxScore}</span>
                                    <span class="px-2 py-1 ${textColor} bg-white rounded-lg font-bold text-xs">${percent}%</span>
                                </div>
                            </div>
                        `;
                    });

                    finalList.innerHTML = html;
                } catch (e) {
                    console.error('Load final grades error:', e);
                    finalList.innerHTML = '<p class="text-center text-red-500 py-4">فشل تحميل الدرجات</p>';
                }
            }

            // تبويبات سجل الدرجات - Final
            document.getElementById('grades-tab-final')?.addEventListener('click', () => {
                document.getElementById('grades-tab-final').className = 'py-2 px-4 rounded-xl font-bold text-sm bg-green-600 text-white shadow-lg transition';
                document.getElementById('grades-tab-quizzes').className = 'py-2 px-4 rounded-xl font-bold text-sm bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition';
                document.getElementById('grades-tab-assignments').className = 'py-2 px-4 rounded-xl font-bold text-sm bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition';
                document.getElementById('grades-content-final').classList.remove('hidden');
                document.getElementById('grades-content-quizzes').classList.add('hidden');
                document.getElementById('grades-content-assignments').classList.add('hidden');
            });

            // تبويبات Quizzes
            document.getElementById('grades-tab-quizzes')?.addEventListener('click', () => {
                document.getElementById('grades-tab-quizzes').className = 'py-2 px-4 rounded-xl font-bold text-sm bg-green-600 text-white shadow-lg transition';
                document.getElementById('grades-tab-final').className = 'py-2 px-4 rounded-xl font-bold text-sm bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition';
                document.getElementById('grades-tab-assignments').className = 'py-2 px-4 rounded-xl font-bold text-sm bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition';
                document.getElementById('grades-content-quizzes').classList.remove('hidden');
                document.getElementById('grades-content-final').classList.add('hidden');
                document.getElementById('grades-content-assignments').classList.add('hidden');
            });

            // تبويبات Assignments
            document.getElementById('grades-tab-assignments')?.addEventListener('click', () => {
                document.getElementById('grades-tab-assignments').className = 'py-2 px-4 rounded-xl font-bold text-sm bg-green-600 text-white shadow-lg transition';
                document.getElementById('grades-tab-final').className = 'py-2 px-4 rounded-xl font-bold text-sm bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition';
                document.getElementById('grades-tab-quizzes').className = 'py-2 px-4 rounded-xl font-bold text-sm bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition';
                document.getElementById('grades-content-assignments').classList.remove('hidden');
                document.getElementById('grades-content-final').classList.add('hidden');
                document.getElementById('grades-content-quizzes').classList.add('hidden');
            });
        }

        // تحميل الاقتراحات (طلاب قد تعرفهم)
        if (isOwner) {
            const loadSuggestedUsers = async () => {
                const suggestList = document.getElementById('suggested-users-list');
                if (!suggestList) return;

                try {
                    // جلب من أتابعهم
                    const myFollowingSnap = await getDocs(query(collection(db, "follows"), where("followerId", "==", currentUser.uid)));
                    const followingIds = new Set();
                    myFollowingSnap.forEach(d => followingIds.add(d.data().followingId));

                    // جلب المستخدمين
                    const usersSnap = await getDocs(collection(db, "users"));
                    const candidates = [];

                    usersSnap.forEach(d => {
                        if (d.id === currentUser.uid) return; // استبعاد نفسي
                        if (followingIds.has(d.id)) return; // استبعاد اللي متابعهم

                        const u = d.data();
                        let score = 0;

                        // نفس القسم = +3 نقاط
                        if (u.departmentId === userData.departmentId) score += 3;
                        // نفس الكلية = +2 نقاط
                        if (u.collegeId === userData.collegeId) score += 2;
                        // مستخدم نشط (لديه صورة) = +1 نقطة
                        if (u.photoURL) score += 1;

                        if (score > 0) {
                            candidates.push({ uid: d.id, score, ...u });
                        }
                    });

                    // ترتيب حسب النقاط
                    candidates.sort((a, b) => b.score - a.score);
                    const suggestions = candidates.slice(0, 5);

                    if (suggestions.length === 0) {
                        suggestList.innerHTML = '<p class="col-span-full text-center text-gray-400 py-4"><i class="fas fa-check-circle text-green-500"></i> أنت متابع للجميع!</p>';
                        return;
                    }

                    suggestList.innerHTML = suggestions.map(u => `
                        <div class="bg-white dark:bg-gray-700 p-3 rounded-xl shadow-sm text-center hover:shadow-lg transition">
                            <img src="${u.photoURL || 'https://ui-avatars.com/api/?background=random&name=' + (u.displayName || 'U')}" class="w-14 h-14 rounded-full mx-auto mb-2 border-2 border-blue-200 dark:border-indigo-700 cursor-pointer" onclick="window.location.hash='profile/${u.uid}'">
                            <p class="font-bold text-sm dark:text-white truncate">${u.displayName || 'مستخدم'}</p>
                            <p class="text-xs text-gray-400 mb-2">${u.collegeId || ''}</p>
                            <button onclick="window.quickFollow('${u.uid}', this)" class="w-full bg-blue-600 text-white text-xs py-1.5 rounded-lg font-bold hover:bg-blue-700 transition">
                                <i class="fas fa-user-plus"></i> متابعة
                            </button>
                        </div>
                    `).join('');

                } catch (e) {
                    console.error('Suggestions error:', e);
                    suggestList.innerHTML = '<p class="col-span-full text-center text-red-400">حدث خطأ</p>';
                }
            };

            // دالة متابعة سريعة
            window.quickFollow = async (targetId, btn) => {
                const user = auth.currentUser;
                if (!user) return;

                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                btn.disabled = true;

                try {
                    await addDoc(collection(db, "follows"), {
                        followerId: user.uid,
                        followerName: user.displayName || 'مستخدم',
                        followerPhoto: user.photoURL || '',
                        followingId: targetId,
                        createdAt: new Date()
                    });

                    btn.innerHTML = '<i class="fas fa-check"></i> تمت المتابعة';
                    btn.className = 'w-full bg-green-600 text-white text-xs py-1.5 rounded-lg font-bold';

                    // إعادة تحميل الاقتراحات بعد 1.5 ثانية
                    setTimeout(() => loadSuggestedUsers(), 1500);

                } catch (e) {
                    console.error('Quick follow error:', e);
                    btn.innerHTML = '<i class="fas fa-user-plus"></i> متابعة';
                    btn.disabled = false;
                }
            };

            loadSuggestedUsers();
        }

        // دالة مراجعة الامتحان
        window.showExamReview = (examId) => {
            const examData = window.storedExamData?.find(e => e.id === examId);
            if (!examData || !examData.examDetails) {
                alert(window.t?.('no-exam-details') || 'لا توجد تفاصيل للامتحان');
                return;
            }

            const questionsHtml = examData.examDetails.map((q, idx) => {
                const isCorrect = q.isCorrect;
                const bgColor = isCorrect ? 'bg-green-50 dark:bg-green-900/20 border-green-500' : 'bg-red-50 dark:bg-red-900/20 border-red-500';
                const icon = isCorrect ? '✅' : '❌';

                return `
                    <div class="p-4 rounded-xl border-r-4 ${bgColor} mb-3">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-xl">${icon}</span>
                            <span class="font-bold text-gray-700 dark:text-white">س${idx + 1}</span>
                        </div>
                        <p class="text-gray-800 dark:text-gray-200 mb-3 font-medium">${q.questionText}</p>
                        
                        <div class="space-y-2">
                            ${q.options?.map(opt => {
                    let optClass = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
                    let label = '';
                    if (opt === q.correctAnswer) {
                        optClass = 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-bold';
                        label = '<i class="fas fa-check-circle text-green-500 mr-1"></i>';
                    }
                    if (opt === q.userAnswer && !q.isCorrect) {
                        optClass = 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 line-through';
                        label = '<i class="fas fa-times-circle text-red-500 mr-1"></i>';
                    }
                    if (opt === q.userAnswer && q.isCorrect) {
                        label = '<i class="fas fa-check-circle text-green-500 mr-1"></i>';
                    }
                    return `<div class="p-2 rounded-lg text-sm ${optClass}">${label}${opt}</div>`;
                }).join('') || ''}
                        </div>
                        
                        ${!isCorrect ? `
                            <div class="mt-3 text-xs text-gray-500 dark:text-gray-400">
                                <span class="text-red-500">إجابتك: ${q.userAnswer || 'لم تجب'}</span>
                                <span class="text-green-500 mr-3">الصحيحة: ${q.correctAnswer}</span>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');

            const modal = document.createElement('div');
            modal.id = 'exam-review-modal';
            modal.className = 'fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4 backdrop-blur-sm';
            modal.innerHTML = `
                <div class="bg-white dark:bg-gray-800 w-full max-w-2xl max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl">
                    <div class="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-5 flex justify-between items-center">
                        <div>
                            <h2 class="text-xl font-black">${examData.quizTitle || 'مراجعة الامتحان'}</h2>
                            <p class="text-blue-200 text-sm">${examData.correct || 0} / ${examData.questionsCount || '?'} صحيح • ${examData.score}%</p>
                        </div>
                        <button onclick="document.getElementById('exam-review-modal').remove()" class="w-10 h-10 bg-white/20 rounded-full hover:bg-white/30 transition flex items-center justify-center">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="p-5 overflow-y-auto max-h-[60vh] custom-scrollbar">
                        ${questionsHtml}
                    </div>
                    <div class="p-4 bg-gray-50 dark:bg-gray-900 border-t dark:border-gray-700">
                        <button onclick="document.getElementById('exam-review-modal').remove()" class="w-full bg-gray-600 text-white py-3 rounded-xl font-bold hover:bg-gray-700 transition">
                            إغلاق
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        };

        // دالة المتابعة/إلغاء المتابعة
        window.toggleFollow = async (targetId, currentlyFollowing) => {
            const user = auth.currentUser;
            if (!user) { alert(window.t?.('login-required') || 'يجب تسجيل الدخول'); return; }

            const btn = document.getElementById('follow-btn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }

            try {
                if (currentlyFollowing) {
                    // إلغاء المتابعة
                    const q = query(collection(db, "follows"),
                        where("followerId", "==", user.uid),
                        where("followingId", "==", targetId));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        await deleteDoc(snap.docs[0].ref);
                    }
                } else {
                    // متابعة جديدة
                    await addDoc(collection(db, "follows"), {
                        followerId: user.uid,
                        followerName: user.displayName || (window.t?.('user') || 'مستخدم'),
                        followerPhoto: user.photoURL || '',
                        followingId: targetId,
                        createdAt: new Date()
                    });
                }

                // إعادة تحميل البروفايل
                loadUserProfile(targetId);

            } catch (error) {
                console.error('Follow error:', error);
                alert((window.t?.('error-occurred') || 'حدث خطأ') + ': ' + error.message);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = currentlyFollowing ? (window.t?.('following') || 'متابَع') : (window.t?.('follow') || 'متابعة');
                }
            }
        };

        // عرض قائمة المتابعين/المتابَعين
        window.showFollowList = async (userId, type) => {
            const title = type === 'followers' ? 'المتابعين' : 'المتابَعين';

            // إنشاء Modal
            const modal = document.createElement('div');
            modal.id = 'follow-list-modal';
            modal.className = 'fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4 backdrop-blur-sm';
            modal.innerHTML = `
                <div class="bg-white dark:bg-gray-800 w-full max-w-md max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl">
                    <div class="bg-gradient-to-r from-blue-600 to-blue-600 text-white p-4 flex justify-between items-center">
                        <h2 class="text-lg font-black">${title}</h2>
                        <button onclick="document.getElementById('follow-list-modal').remove()" class="w-8 h-8 bg-white/20 rounded-full hover:bg-white/30 transition flex items-center justify-center">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="p-4 overflow-y-auto max-h-[60vh]" id="follow-list-content">
                        <p class="text-center text-gray-400"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</p>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            try {
                let q;
                if (type === 'followers') {
                    // الناس اللي متابعاه
                    q = query(collection(db, "follows"), where("followingId", "==", userId));
                } else {
                    // الناس اللي بيتابعهم
                    q = query(collection(db, "follows"), where("followerId", "==", userId));
                }

                const snap = await getDocs(q);
                const content = document.getElementById('follow-list-content');

                if (snap.empty) {
                    content.innerHTML = '<p class="text-center text-gray-400 py-8"><i class="fas fa-users"></i> لا يوجد ${title} بعد</p>';
                    return;
                }

                // جلب بيانات المستخدمين
                const usersList = [];
                for (const d of snap.docs) {
                    const followData = d.data();
                    const targetUid = type === 'followers' ? followData.followerId : followData.followingId;

                    try {
                        const userDoc = await getDoc(doc(db, "users", targetUid));
                        if (userDoc.exists()) {
                            usersList.push({ uid: targetUid, ...userDoc.data() });
                        }
                    } catch (e) {
                        console.warn('User fetch error:', e);
                    }
                }

                content.innerHTML = usersList.map(u => `
                    <div class="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition cursor-pointer" onclick="document.getElementById('follow-list-modal').remove(); window.location.hash='profile/${u.uid}';">
                        <div class="flex items-center gap-3">
                            <img src="${u.photoURL || 'https://ui-avatars.com/api/?background=random&name=' + (u.displayName || 'User')}" class="w-12 h-12 rounded-full border-2 border-white shadow">
                            <div>
                                <p class="font-bold dark:text-white">${u.displayName || 'مستخدم'}</p>
                                <p class="text-xs text-gray-400">${u.collegeId || ''}</p>
                            </div>
                        </div>
                        <i class="fas fa-chevron-left text-gray-300"></i>
                    </div>
                `).join('');

            } catch (error) {
                console.error('Follow list error:', error);
                document.getElementById('follow-list-content').innerHTML = '<p class="text-center text-red-400">حدث خطأ</p>';
            }
        };
    } catch (e) { console.error(e); }
};

const saveUserLog = async (user) => {
    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        // التحقق من الحظر
        if (userSnap.exists() && (userSnap.data().isBanned === true || userSnap.data().isBannedFromPlatform === true)) {
            alert(window.t?.('account-banned') || "⛔ تم حظر حسابك من قبل الإدارة.");
            await signOut(auth);
            window.location.reload();
            return false;
        }

        // ========================
        // نظام تتبع الأجهزة (2 جهاز كحد أقصى)
        // ========================
        const sessionId = localStorage.getItem('sessionId') || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('sessionId', sessionId);

        // معلومات الجهاز
        const deviceInfo = {
            browser: navigator.userAgent.includes('Chrome') ? 'Chrome' :
                navigator.userAgent.includes('Firefox') ? 'Firefox' :
                    navigator.userAgent.includes('Safari') ? 'Safari' : 'Unknown',
            os: navigator.platform,
            screen: `${window.screen.width}x${window.screen.height}`,
            language: navigator.language
        };

        // التحقق من عدد الأجهزة النشطة
        const sessionsSnap = await getDocs(query(
            collection(db, "device_sessions"),
            where("userId", "==", user.uid)
        ));

        let existingSession = null;
        const activeSessions = [];
        sessionsSnap.forEach(d => {
            if (d.id === sessionId) {
                existingSession = d;
            } else {
                activeSessions.push({ id: d.id, ...d.data() });
            }
        });

        // لو مش موجود ولديه بالفعل جهازين
        if (!existingSession && activeSessions.length >= 2) {
            const confirmLogout = confirm(`⚠️ لديك ${activeSessions.length} أجهزة مسجلة بالفعل.\n\nالحد الأقصى هو جهازين.\n\nهل تريد تسجيل الخروج من أقدم جهاز والمتابعة؟`);

            if (confirmLogout) {
                // حذف أقدم جلسة
                const oldest = activeSessions.sort((a, b) => (a.lastActive?.toDate?.() || 0) - (b.lastActive?.toDate?.() || 0))[0];
                await deleteDoc(doc(db, "device_sessions", oldest.id));
            } else {
                await signOut(auth);
                return false;
            }
        }

        // تسجيل/تحديث الجلسة الحالية
        await setDoc(doc(db, "device_sessions", sessionId), {
            userId: user.uid,
            userName: user.displayName || user.email,
            userPhoto: user.photoURL || '',
            deviceInfo,
            lastActive: serverTimestamp(),
            createdAt: existingSession ? existingSession.data()?.createdAt : serverTimestamp()
        }, { merge: true });

        // تسجيل في سجل الدخول (للأدمن)
        await addDoc(collection(db, "login_logs"), {
            userId: user.uid,
            userName: user.displayName || user.email,
            userEmail: user.email,
            sessionId,
            deviceInfo,
            timestamp: serverTimestamp(),
            action: existingSession ? 'session_refresh' : 'new_login'
        });

        // تحديث البيانات
        const updateData = {
            uid: user.uid,
            email: user.email,
            lastLogin: new Date(),
            lastSeen: serverTimestamp(),
            isOnline: true,
            activeDevices: activeSessions.length + (existingSession ? 0 : 1)
        };

        if (!userSnap.exists()) {
            updateData.displayName = user.displayName || "";
            updateData.photoURL = user.photoURL || "";
        } else {
            // استعادة صورة جوجل تلقائياً لو الصورة فاضية في قاعدة البيانات
            const existingData = userSnap.data();
            if (!existingData.photoURL && user.photoURL) {
                updateData.photoURL = user.photoURL;
            }
        }

        await setDoc(userRef, updateData, { merge: true });

        // تشغيل نظام التواجد (Heartbeat) - تحديث كل 5 دقائق
        startPresenceHeartbeat(user.uid);

        return true;
    } catch (e) {
        console.error('saveUserLog error:', e);
        return false;
    }
};

// ============================================================
// نظام التواجد (Heartbeat)
// ============================================================
let presenceInterval = null;
const startPresenceHeartbeat = (uid) => {
    if (presenceInterval) clearInterval(presenceInterval);

    // تحديث أول مرة فوراً
    updatePresence(uid);

    // ثم كل 5 دقائق
    presenceInterval = setInterval(() => {
        updatePresence(uid);
    }, 5 * 60 * 1000); // 5 minutes
};

const updatePresence = async (uid) => {
    try {
        if (!auth.currentUser) {
            if (presenceInterval) clearInterval(presenceInterval);
            return;
        }
        await updateDoc(doc(db, "users", uid), {
            lastSeen: serverTimestamp(),
            isOnline: true
        });
    } catch (e) { console.log('Presence update error (ignore):', e); }
};

export const checkAdminStatus = async (user) => {
    if (!user) return null;

    // المالك يمتلك كل الصلاحيات
    if (user.email === SUPER_ADMIN_EMAIL) {
        return {
            isOwner: true,
            isSuperAdmin: true,
            role: 'owner',
            level: 100,
            cms: true, quiz: true, users: true, settings: true, broadcast: true, support: true, posts: true
        };
    }

    try {
        const docSnap = await getDoc(doc(db, "admins", user.email));
        if (docSnap.exists()) {
            const data = docSnap.data();
            return {
                isOwner: false,
                isSuperAdmin: data.role === 'super_admin',
                role: data.role,
                level: data.level || 0,
                scope: data.scope,
                allowedSections: data.allowedSections || [],
                ...data.permissions
            };
        }
    } catch (e) { console.log('Admin check error:', e); }
    return null;
};

export const handleSignIn = async () => {
    try {
        document.getElementById('loading-screen').classList.remove('hidden');
        await signInWithPopup(auth, provider);
    } catch (e) {
        alert((window.t?.('failed') || "فشل") + ": " + e.message);
        document.getElementById('loading-screen').classList.add('hidden');
    }
};

// ============================================================
// المستمع الرئيسي لحالة الدخول (Main Auth Listener)
// ============================================================
export const setupAuthListener = () => {
    const loadingScreen = document.getElementById('loading-screen');
    const authScreen = document.getElementById('auth-screen');
    const appContent = document.getElementById('app-content');
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = handleSignOut;

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // تحديد الأونر لإعفائه من حماية Screenshots
            window._isOwner = (user.email === SUPER_ADMIN_EMAIL);
            if (window._isOwner) document.body.style.userSelect = 'auto';
            try {
                // 1. تسجيل الدخول في القاعدة
                const allowed = await saveUserLog(user);
                if (!allowed) { if (loadingScreen) loadingScreen.classList.add('hidden'); return; }

                // 1.5 التحقق من الحظر من المنصة
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists() && userDoc.data().isBannedFromPlatform === true) {
                    alert(window.t?.('banned-from-platform') || '⛔ تم حظرك من المنصة. تواصل مع الإدارة لمزيد من المعلومات.');
                    await signOut(auth);
                    if (loadingScreen) loadingScreen.classList.add('hidden');
                    return;
                }

                // 2. التحقق الإجباري من الاسم
                const hasValidName = await checkUserNameValidity(user);
                if (!hasValidName) return;

                // 3. اختيار الكلية والقسم + البيانات الشخصية (أولاً)
                const hasSelectedCollege = await checkUserCollegeSelection(user);
                if (!hasSelectedCollege) return;

                // 4. رفع الكارنيه (بعد ملء البيانات)
                const hasIdCard = await checkIdCard(user);
                if (!hasIdCard) return;

                // 5. التحقق من التوثيق (حظر غير الموثقين)
                const isVerified = await checkVerificationStatus(user);
                if (!isVerified) return;

                // 5. تحميل صلاحيات الأدمن والواجهة
                const adminPerms = await checkAdminStatus(user);
                if (authScreen) authScreen.classList.add('hidden');
                if (appContent) appContent.classList.remove('hidden');

                // Fetch user data from Firestore for custom photoURL
                const headerImg = document.getElementById('header-user-img');
                if (headerImg) {
                    try {
                        const userDataSnap = await getDoc(doc(db, "users", user.uid));
                        const userData = userDataSnap.exists() ? userDataSnap.data() : {};
                        headerImg.src = userData.photoURL || user.photoURL || 'https://ui-avatars.com/api/?background=random&name=' + user.displayName;
                    } catch (e) {
                        headerImg.src = user.photoURL || 'https://ui-avatars.com/api/?background=random&name=' + user.displayName;
                    }
                }

                // 🔒 Watermark ديناميكي — الأونر والمعفيون معفيون
                if (!window._isOwner) {
                    let isExempt = false;
                    try {
                        const wmData = await getDoc(doc(db, "system", "watermark_exemptions"));
                        if (wmData.exists()) {
                            const exemptEmails = wmData.data().emails || [];
                            if (exemptEmails.includes(user.email?.toLowerCase())) {
                                isExempt = true;
                            }
                        }
                    } catch (e) {
                        console.error('Check watermark exemption error:', e);
                    }

                    if (!isExempt) {
                        const wmName = user.displayName || user.email;
                        const userDataWM = await getDoc(doc(db, "users", user.uid));
                        const studentId = userDataWM.exists() ? (userDataWM.data().studentId || '') : '';
                        const wmText = studentId ? `${wmName} — ${studentId}` : wmName;

                        // إزالة أي watermark قديم
                        document.getElementById('_wm_overlay')?.remove();

                        const wmDiv = document.createElement('div');
                        wmDiv.id = '_wm_overlay';
                        wmDiv.style.cssText = `
                        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                        pointer-events: none; z-index: 99999;
                        overflow: hidden;
                        opacity: 0.12;
                    `;

                        const wmColor = () => document.body.classList.contains('dark') ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)';

                        // إنشاء نمط متكرر بزاوية
                        const buildWM = () => {
                            let html = '<div style="position:absolute; top:-50%; left:-50%; width:200%; height:200%; transform: rotate(-30deg);">';
                            for (let i = 0; i < 40; i++) {
                                html += `<div style="
                                font-size: 14px; font-weight: 700;
                                color: ${wmColor()}; white-space: nowrap;
                                padding: 40px 60px;
                                font-family: sans-serif;
                                letter-spacing: 2px;
                            ">${wmText} &nbsp;&nbsp;&nbsp; ${wmText} &nbsp;&nbsp;&nbsp; ${wmText} &nbsp;&nbsp;&nbsp; ${wmText} &nbsp;&nbsp;&nbsp; ${wmText}</div>`;
                            }
                            html += '</div>';
                            return html;
                        };

                        wmDiv.innerHTML = buildWM();
                        document.body.appendChild(wmDiv);

                        // تحديث اللون عند تبديل Dark Mode
                        const darkObserver = new MutationObserver(() => {
                            if (document.getElementById('_wm_overlay')) {
                                wmDiv.innerHTML = buildWM();
                            }
                        });
                        darkObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

                        // حماية ضد الحذف من DevTools
                        const wmObserver = new MutationObserver(() => {
                            if (!document.getElementById('_wm_overlay')) {
                                document.body.appendChild(wmDiv);
                            }
                        });
                        wmObserver.observe(document.body, { childList: true });

                        // إعادة الـ watermark عند الدخول/الخروج من Fullscreen
                        document.addEventListener('fullscreenchange', () => {
                            const fsEl = document.fullscreenElement;
                            if (fsEl) {
                                // دخول fullscreen — ننسخ watermark جوه الـ fullscreen element
                                const fsWM = wmDiv.cloneNode(true);
                                fsWM.id = '_wm_fs';
                                fsEl.appendChild(fsWM);
                            } else {
                                // خروج من fullscreen — نشيل النسخة
                                document.getElementById('_wm_fs')?.remove();
                            }
                        });
                    }
                }

                setupNotificationListener(user.uid);
                try { import('./support.js').then(m => m.setupSupportSystem()); } catch (e) { }
                checkLiveSession();

                const adminSidebarLinks = document.getElementById('admin-sidebar-links');
                const adminPanel = document.getElementById('admin-view-area');

                if (adminPerms) {
                    if (adminPanel) adminPanel.classList.remove('hidden');
                    if (adminSidebarLinks) adminSidebarLinks.classList.remove('hidden');
                    window.currentUserPermissions = adminPerms;
                } else {
                    if (adminPanel) adminPanel.classList.add('hidden');
                    if (adminSidebarLinks) adminSidebarLinks.classList.add('hidden');
                    window.currentUserPermissions = null;
                }

                await loadStudySections();
                await loadQuizQuestionsForUser();

                // تحديث الـ Streak وعرض الـ Widget
                await updateStreak(user.uid);
                await renderStreakWidget('streak-widget', user.uid);

                checkRoute();

            } catch (error) {
                console.error("Auth Error:", error);
                alert(window.t?.('data-loading-error') || "حدث خطأ في تحميل البيانات.");
            } finally {
                // إبقاء شاشة التحميل إذا كانت إحدى النوافذ الإجبارية مفتوحة
                if (!document.getElementById('name-force-modal').classList.contains('hidden') || !document.getElementById('id-card-modal').classList.contains('hidden')) {
                    // Do nothing, let user interact with modal
                } else if (loadingScreen) {
                    setTimeout(() => loadingScreen.classList.add('hidden'), 500);
                }
            }
        } else {
            // حالة عدم تسجيل الدخول
            window._isOwner = false;
            if (loadingScreen) loadingScreen.classList.add('hidden');
            if (authScreen) authScreen.classList.remove('hidden');
            if (appContent) appContent.classList.add('hidden');

            const loginBtn = document.getElementById('auth-button');
            if (loginBtn) loginBtn.onclick = handleSignIn;
            window.location.hash = 'home';
        }
    });
};