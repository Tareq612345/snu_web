// ============================================================
// social.js - البروفايل والمتابعة والحظر
// ============================================================

import { db, auth, SUPER_ADMIN_EMAIL } from './firebase.js';
import {
    doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection,
    query, orderBy, limit, onSnapshot, addDoc, deleteDoc, serverTimestamp, getDocs, setDoc, where
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ============================================================
// فتح بروفايل يوزر
// ============================================================
window.openUserProfile = async (uid) => {
    if (!uid) return;

    const currentUser = auth.currentUser;
    if (!currentUser) return window.showToast?.('سجل دخول الأول');

    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (!userDoc.exists()) return window.showToast?.('المستخدم مش موجود');

        const data = userDoc.data();
        const isMe = currentUser.uid === uid;
        const isAdmin = await checkIfAdmin();

        // جيب بيانات المتابعة
        const myDoc = await getDoc(doc(db, "users", currentUser.uid));
        const myData = myDoc.exists() ? myDoc.data() : {};

        const isFollowing = (myData.following || []).includes(uid);
        const isBlocked = (myData.blockedUsers || []).includes(uid);
        const followersCount = (data.followers || []).length;
        const followingCount = (data.following || []).length;

        // Level info
        const levelInfo = window.getLevelInfo?.(data.xp || 0) || { level: 1, name: 'مبتدئ', badge: '🌱' };

        const modal = document.createElement('div');
        modal.id = 'user-profile-modal';
        modal.className = 'fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center animate-fade-in p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-surface-800 rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
                <!-- Header -->
                <div class="relative bg-gradient-to-br from-primary-500 to-primary-600 h-32 rounded-t-3xl">
                    <button onclick="document.getElementById('user-profile-modal').remove()" class="absolute top-4 left-4 text-white/80 hover:text-white text-2xl">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Avatar -->
                <div class="flex justify-center -mt-16">
                    <img src="${data.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(data.displayName || 'User')}" 
                         class="w-32 h-32 rounded-full border-4 border-white dark:border-surface-800 shadow-xl object-cover bg-white dark:bg-surface-700">
                </div>
                
                <!-- Info -->
                <div class="p-6 text-center">
                    <h2 class="text-2xl font-black dark:text-white flex items-center justify-center gap-2">
                        ${data.displayName || 'مستخدم'}
                        ${data.isVerified ? '<i class="fas fa-check-circle text-primary-500"></i>' : ''}
                    </h2>
                    
                    <p class="text-surface-500 dark:text-surface-400 text-sm mt-1">${data.email || ''}</p>
                    
                    <!-- Level Badge -->
                    <div class="mt-3 inline-flex items-center gap-2 bg-gradient-to-r from-primary-50 to-primary-50 dark:from-primary-900/40 dark:to-primary-900/40 border border-primary-100 dark:border-primary-800 px-4 py-2 rounded-full shadow-sm">
                        <span class="text-2xl drop-shadow-sm">${levelInfo.badge}</span>
                        <span class="font-bold text-primary-700 dark:text-primary-300">المستوى ${levelInfo.level} - ${levelInfo.name}</span>
                    </div>
                    
                    <p class="text-sm text-surface-400 mt-1 font-mono tracking-wider">${data.xp || 0} XP</p>
                    
                    <!-- College Info -->
                    <div class="mt-4 bg-surface-50 dark:bg-surface-700/50 rounded-2xl p-4 border border-surface-100 dark:border-surface-700">
                        <p class="text-sm text-surface-600 dark:text-surface-300">
                            <i class="fas fa-university text-primary-500 ml-2"></i>
                            ${data.collegeName || data.collegeId || 'غير محدد'}
                        </p>
                        <p class="text-sm text-surface-600 dark:text-surface-300 mt-2">
                            <i class="fas fa-book text-primary-500 ml-2"></i>
                            ${data.departmentName || data.departmentId || 'غير محدد'}
                        </p>
                        <p class="text-sm text-surface-600 dark:text-surface-300 mt-2">
                            <i class="fas fa-layer-group text-accent-500 ml-2"></i>
                            الفرقة ${data.year || 'غير محدد'}
                        </p>
                    </div>
                    
                    <!-- Stats -->
                    <div class="flex justify-center gap-8 mt-4">
                        <div class="text-center p-2 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-700/50 transition">
                            <p class="text-2xl font-black text-primary-600 dark:text-primary-400">${followersCount}</p>
                            <p class="text-xs text-surface-500 dark:text-surface-400">متابع</p>
                        </div>
                        <div class="text-center p-2 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-700/50 transition">
                            <p class="text-2xl font-black text-primary-600 dark:text-primary-400">${followingCount}</p>
                            <p class="text-xs text-surface-500 dark:text-surface-400">يتابع</p>
                        </div>
                    </div>
                    
                    <!-- ID Card (Admin Only) -->
                    ${isAdmin && data.idCardImage ? `
                        <div class="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-xl border border-yellow-200 dark:border-yellow-700">
                            <p class="text-xs text-yellow-600 dark:text-yellow-400 mb-2"><i class="fas fa-id-card ml-1"></i> الكارنيه (للأدمن فقط)</p>
                            <img src="${data.idCardImage}" class="rounded-lg max-h-40 mx-auto cursor-pointer" onclick="window.open('${data.idCardImage}')">
                        </div>
                    ` : ''}
                    
                    <!-- Action Buttons -->
                    ${!isMe ? `
                        <div class="flex gap-3 mt-6">
                            <button onclick="window.toggleFollow('${uid}')" id="follow-btn-${uid}"
                                class="flex-1 py-3 rounded-xl font-bold transition ${isFollowing
                    ? 'bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300'
                    : 'bg-primary-600 text-white hover:bg-primary-700'}">
                                <i class="fas fa-${isFollowing ? 'user-minus' : 'user-plus'} ml-2"></i>
                                ${isFollowing ? 'إلغاء المتابعة' : 'متابعة'}
                            </button>
                            
                            <button onclick="window.openDMFromProfile('${uid}', '${data.displayName}')" 
                                class="flex-1 py-3 rounded-xl bg-accent-600 text-white font-bold hover:bg-accent-700 transition">
                                <i class="fas fa-comment ml-2"></i>
                                مراسلة
                            </button>
                        </div>
                        
                        <button onclick="window.toggleBlock('${uid}')" id="block-btn-${uid}"
                            class="mt-3 w-full py-2 rounded-xl text-sm font-bold transition ${isBlocked
                    ? 'bg-red-100 text-red-600 dark:bg-red-900/30'
                    : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400'}">
                            <i class="fas fa-${isBlocked ? 'unlock' : 'ban'} ml-2"></i>
                            ${isBlocked ? 'إلغاء الحظر' : 'حظر المراسلة'}
                        </button>
                    ` : `
                        <button onclick="window.location.hash='profile'" class="mt-6 w-full py-3 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 transition">
                            <i class="fas fa-edit ml-2"></i>
                            تعديل بروفايلي
                        </button>
                    `}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    } catch (err) {
        console.error('Profile error:', err);
        alert('حصل خطأ في تحميل البروفايل');
    }
};

// ============================================================
// متابعة / إلغاء متابعة
// ============================================================
window.toggleFollow = async (targetUid) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const myRef = doc(db, "users", user.uid);
        const targetRef = doc(db, "users", targetUid);

        const myDoc = await getDoc(myRef);
        const myData = myDoc.data() || {};

        // التحقق من التوثيق - فقط الموثقين يقدروا يتابعوا (الأونر معفي)
        if (user.email !== SUPER_ADMIN_EMAIL && myData.isVerified !== true) {
            return window.showToast?.('⚠️ يجب توثيق حسابك أولاً لتتمكن من متابعة المستخدمين.\n\nقم برفع صورة الكارنيه من صفحة الملف الشخصي.');
        }

        const isFollowing = (myData.following || []).includes(targetUid);

        if (isFollowing) {
            // الغاء المتابعة
            await updateDoc(myRef, { following: arrayRemove(targetUid) });
            await updateDoc(targetRef, { followers: arrayRemove(user.uid) });

            updateFollowButton(targetUid, false);
            window.showToast?.('تم إلغاء المتابعة', 'info');
        } else {
            // متابعة
            await updateDoc(myRef, { following: arrayUnion(targetUid) });
            await updateDoc(targetRef, { followers: arrayUnion(user.uid) });

            updateFollowButton(targetUid, true);
            window.showToast?.('تمت المتابعة ✅', 'success');
        }
    } catch (err) {
        console.error('Follow error:', err);
    }
};

const updateFollowButton = (uid, isFollowing) => {
    const btn = document.getElementById(`follow-btn-${uid}`);
    if (btn) {
        btn.innerHTML = `<i class="fas fa-${isFollowing ? 'user-minus' : 'user-plus'} ml-2"></i>${isFollowing ? 'إلغاء المتابعة' : 'متابعة'}`;
        btn.className = `flex-1 py-3 rounded-xl font-bold transition ${isFollowing
            ? 'bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300'
            : 'bg-primary-600 text-white hover:bg-primary-700'}`;
    }
};

// ============================================================
// حظر / إلغاء حظر (المراسلة فقط)
// ============================================================
window.toggleBlock = async (targetUid) => {
    const user = auth.currentUser;
    if (!user) return;

    // منع حظر الأونر (SUPER_ADMIN)
    try {
        const targetDoc = await getDoc(doc(db, "users", targetUid));
        if (targetDoc.exists() && targetDoc.data().email === SUPER_ADMIN_EMAIL) {
            return window.showToast?.('⛔ لا يمكنك حظر مالك المنصة!');
        }
    } catch (e) { }

    if (!confirm('هل أنت متأكد؟')) return;

    try {
        const myRef = doc(db, "users", user.uid);
        const myDoc = await getDoc(myRef);
        const isBlocked = (myDoc.data()?.blockedUsers || []).includes(targetUid);

        if (isBlocked) {
            await updateDoc(myRef, { blockedUsers: arrayRemove(targetUid) });
            updateBlockButton(targetUid, false);
            window.showToast?.('تم إلغاء الحظر', 'info');
        } else {
            await updateDoc(myRef, { blockedUsers: arrayUnion(targetUid) });
            updateBlockButton(targetUid, true);
            window.showToast?.('تم حظر المستخدم من المراسلة', 'warning');
        }
    } catch (err) {
        console.error('Block error:', err);
    }
};

const updateBlockButton = (uid, isBlocked) => {
    const btn = document.getElementById(`block-btn-${uid}`);
    if (btn) {
        btn.innerHTML = `<i class="fas fa-${isBlocked ? 'unlock' : 'ban'} ml-2"></i>${isBlocked ? 'إلغاء الحظر' : 'حظر المراسلة'}`;
        btn.className = `mt-3 w-full py-2 rounded-xl text-sm font-bold transition ${isBlocked
            ? 'bg-red-100 text-red-600 dark:bg-red-900/30'
            : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400'}`;
    }
};

// ============================================================
// فتح DM من البروفايل
// ============================================================
window.openDMFromProfile = async (targetUid, targetName) => {
    document.getElementById('user-profile-modal')?.remove();

    // نتأكد إن مش محظور (الأونر معفي من الحظر)
    const targetDoc = await getDoc(doc(db, "users", targetUid));
    const targetData = targetDoc.data() || {};

    // SUPER_ADMIN bypass - الأونر يقدر يراسل أي حد
    if (auth.currentUser?.email !== SUPER_ADMIN_EMAIL) {
        if ((targetData.blockedUsers || []).includes(auth.currentUser?.uid)) {
            return window.showToast?.('لا يمكنك مراسلة هذا المستخدم');
        }
    }

    // فتح الـ DM
    window.openDirectMessage?.(targetUid, targetName, targetData.photoURL);
};

// ============================================================
// هل أنا أدمن؟
// ============================================================
// SUPER_ADMIN_EMAIL imported from firebase.js

const checkIfAdmin = async () => {
    const user = auth.currentUser;
    if (!user) return false;

    // Super Admin دايما أدمن
    if (user.email === SUPER_ADMIN_EMAIL) return true;

    try {
        const adminDoc = await getDoc(doc(db, "admins", user.email));
        return adminDoc.exists();
    } catch {
        return false;
    }
};

// ============================================================
// Feed - بوستات الأدمن
// ============================================================
window.renderAdminFeed = async (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    // اظهر زرار النشر للأدمن فقط
    const isAdmin = await checkIfAdmin();
    const createBtn = document.getElementById('create-post-btn');
    if (createBtn && isAdmin) {
        createBtn.classList.remove('hidden');
    }

    container.innerHTML = '<div class="text-center p-10"><i class="fas fa-spinner fa-spin text-3xl text-primary-500"></i></div>';

    try {
        const q = query(collection(db, "admin_posts"), orderBy("createdAt", "desc"), limit(20));

        onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                container.innerHTML = '<div class="text-center p-10 text-surface-400"><i class="fas fa-newspaper text-4xl mb-3"></i><p>لا توجد منشورات حالياً</p></div>';
                return;
            }

            container.innerHTML = '';
            snapshot.forEach(docSnap => {
                const post = docSnap.data();
                const postId = docSnap.id;
                const time = post.createdAt?.toDate?.()?.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) || '';
                const likesCount = (post.likes || []).length;
                const isLiked = (post.likes || []).includes(auth.currentUser?.uid);

                let mediaHtml = '';
                if (post.mediaUrl) {
                    if (post.mediaType === 'video') {
                        mediaHtml = `<video src="${post.mediaUrl}" controls class="w-full rounded-xl mt-3 max-h-80"></video>`;
                    } else if (post.mediaType === 'image') {
                        mediaHtml = `<img src="${post.mediaUrl}" class="w-full rounded-xl mt-3 max-h-96 object-cover cursor-pointer" onclick="window.open('${post.mediaUrl}')">`;
                    }
                }

                // لينكات
                // تنظيف المحتوى من XSS أولاً ثم تحويل اللينكات
                let safeContent = window.sanitizeHTML?.(post.content) || post.content || '';
                let contentHtml = safeContent.replace(
                    /(https?:\/\/[^\s]+)/g,
                    '<a href="$1" target="_blank" class="text-primary-600 hover:underline">$1</a>'
                );

                const commentsCount = post.commentsCount || 0;

                container.innerHTML += `
                    <div class="bg-white dark:bg-surface-800 rounded-2xl shadow-lg p-5 mb-4 border border-surface-100 dark:border-surface-700">
                        <div class="flex items-center gap-3 mb-3">
                            <img src="${post.authorPhoto || 'https://ui-avatars.com/api/?name=Admin'}" class="w-12 h-12 rounded-full object-cover border-2 border-primary-200">
                            <div>
                                <p class="font-bold dark:text-white flex items-center gap-2">
                                    ${window.sanitizeHTML?.(post.authorName) || 'الإدارة'}
                                    <span class="bg-primary-100 text-primary-700 text-[10px] px-2 py-0.5 rounded-full">أدمن</span>
                                </p>
                                <p class="text-xs text-surface-400">${time}</p>
                            </div>
                        </div>
                        
                        <p class="text-surface-700 dark:text-surface-300 whitespace-pre-wrap leading-relaxed">${contentHtml}</p>
                        ${mediaHtml}
                        
                        <div class="flex items-center gap-6 mt-4 pt-3 border-t border-surface-100 dark:border-surface-700">
                            <button onclick="window.togglePostLike('${postId}')" class="flex items-center gap-2 ${isLiked ? 'text-red-500' : 'text-surface-400'} hover:text-red-500 transition">
                                <i class="fas fa-heart"></i>
                                <span>${likesCount}</span>
                            </button>
                            <button onclick="window.openPostComments('${postId}')" class="flex items-center gap-2 text-surface-400 hover:text-primary-500 transition">
                                <i class="fas fa-comment"></i>
                                <span>${commentsCount}</span>
                            </button>
                        </div>
                    </div>
                `;
            });
        });
    } catch (err) {
        console.error('Feed error:', err);
        container.innerHTML = '<p class="text-center text-red-500">خطأ في تحميل المنشورات</p>';
    }
};

// لايك على بوست
window.togglePostLike = async (postId) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const postRef = doc(db, "admin_posts", postId);
        const postDoc = await getDoc(postRef);
        const likes = postDoc.data()?.likes || [];

        if (likes.includes(user.uid)) {
            await updateDoc(postRef, { likes: arrayRemove(user.uid) });
        } else {
            await updateDoc(postRef, { likes: arrayUnion(user.uid) });
        }
    } catch (err) {
        console.error('Like error:', err);
    }
};

// ============================================================
// أدمن: إضافة بوست
// ============================================================
window.openCreatePostModal = async () => {
    // جيب الكليات والأقسام
    const { UNIVERSITY_STRUCTURE } = await import('./structure.js');

    let collegesOptions = '';
    let departmentsOptions = '';

    UNIVERSITY_STRUCTURE.forEach(c => {
        collegesOptions += `<option value="${c.id}">${c.name}</option>`;
        c.departments.forEach(d => {
            departmentsOptions += `<option value="${d.id}" data-college="${c.id}">${c.name} - ${d.name}</option>`;
        });
    });

    const modal = document.createElement('div');
    modal.id = 'create-post-modal';
    modal.className = 'fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center animate-fade-in p-4 overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-3xl w-full max-w-lg shadow-2xl my-4">
            <div class="p-6 border-b dark:border-surface-700">
                <h3 class="text-xl font-black dark:text-white">📝 منشور جديد</h3>
            </div>
            
            <div class="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                <textarea id="post-content" placeholder="اكتب منشورك هنا..." rows="4" 
                    class="w-full p-4 border dark:border-surface-600 rounded-xl resize-none dark:bg-surface-700 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"></textarea>
                
                <!-- Target Audience -->
                <div class="bg-surface-50 dark:bg-surface-700/50 p-4 rounded-xl">
                    <label class="text-sm font-bold dark:text-white mb-2 block">🎯 الجمهور المستهدف:</label>
                    <select id="post-target-type" onchange="window.updatePostTargetOptions()" class="w-full p-3 border dark:border-surface-600 rounded-xl dark:bg-surface-700 dark:text-white mb-2">
                        <option value="all">📢 كل الجامعة</option>
                        <option value="colleges">🏛️ كليات معينة</option>
                        <option value="departments">📚 أقسام معينة</option>
                    </select>
                    
                    <div id="target-colleges-container" class="hidden">
                        <select id="post-target-colleges" multiple class="w-full p-3 border dark:border-surface-600 rounded-xl dark:bg-surface-700 dark:text-white" size="4">
                            ${collegesOptions}
                        </select>
                        <p class="text-xs text-surface-400 mt-1">اضغط Ctrl للاختيار المتعدد</p>
                    </div>
                    
                    <div id="target-departments-container" class="hidden">
                        <select id="post-target-departments" multiple class="w-full p-3 border dark:border-surface-600 rounded-xl dark:bg-surface-700 dark:text-white" size="4">
                            ${departmentsOptions}
                        </select>
                        <p class="text-xs text-surface-400 mt-1">اضغط Ctrl للاختيار المتعدد</p>
                    </div>
                </div>
                
                <div class="flex gap-3">
                    <label class="flex-1 cursor-pointer">
                        <input type="file" id="post-media" accept="image/*,video/*" class="hidden" onchange="window.previewPostMedia(this)">
                        <div class="flex items-center justify-center gap-2 p-3 border-2 border-dashed dark:border-surface-600 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-700 transition">
                            <i class="fas fa-image text-primary-500"></i>
                            <span class="text-sm text-surface-500">صورة أو فيديو</span>
                        </div>
                    </label>
                </div>
                
                <div id="post-media-preview" class="hidden">
                    <div class="relative inline-block">
                        <img id="post-preview-img" class="max-h-40 rounded-xl">
                        <video id="post-preview-video" class="max-h-40 rounded-xl hidden" controls></video>
                        <button onclick="window.clearPostMedia()" class="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full text-xs">×</button>
                    </div>
                </div>
            </div>
            
            <div class="p-6 border-t dark:border-surface-700 flex gap-3">
                <button onclick="document.getElementById('create-post-modal').remove()" class="flex-1 py-3 rounded-xl bg-surface-100 dark:bg-surface-700 font-bold dark:text-white">إلغاء</button>
                <button onclick="window.submitPost()" id="submit-post-btn" class="flex-1 py-3 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700">نشر</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};

window.updatePostTargetOptions = () => {
    const type = document.getElementById('post-target-type').value;
    document.getElementById('target-colleges-container').classList.toggle('hidden', type !== 'colleges');
    document.getElementById('target-departments-container').classList.toggle('hidden', type !== 'departments');
};

window.previewPostMedia = (input) => {
    const file = input.files?.[0];
    if (!file) return;

    const preview = document.getElementById('post-media-preview');
    const img = document.getElementById('post-preview-img');
    const video = document.getElementById('post-preview-video');

    preview.classList.remove('hidden');

    if (file.type.startsWith('video/')) {
        img.classList.add('hidden');
        video.classList.remove('hidden');
        video.src = URL.createObjectURL(file);
    } else {
        video.classList.add('hidden');
        img.classList.remove('hidden');
        img.src = URL.createObjectURL(file);
    }
};

window.clearPostMedia = () => {
    document.getElementById('post-media').value = '';
    document.getElementById('post-media-preview').classList.add('hidden');
};

window.submitPost = async () => {
    const content = document.getElementById('post-content').value.trim();
    const fileInput = document.getElementById('post-media');
    const file = fileInput?.files?.[0];
    const btn = document.getElementById('submit-post-btn');

    // Get target
    const targetType = document.getElementById('post-target-type').value;
    let target = { type: 'all', collegeIds: [], departmentIds: [] };

    if (targetType === 'colleges') {
        const select = document.getElementById('post-target-colleges');
        target.type = 'colleges';
        target.collegeIds = Array.from(select.selectedOptions).map(o => o.value);
        if (target.collegeIds.length === 0) return window.showToast?.('اختر كلية واحدة على الأقل');
    } else if (targetType === 'departments') {
        const select = document.getElementById('post-target-departments');
        target.type = 'departments';
        target.departmentIds = Array.from(select.selectedOptions).map(o => o.value);
        if (target.departmentIds.length === 0) return window.showToast?.('اختر قسم واحد على الأقل');
    }

    if (!content && !file) return window.showToast?.('اكتب شيء أو أضف صورة');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const user = auth.currentUser;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data() || {};

        let mediaUrl = null;
        let mediaType = null;

        if (file) {
            const { uploadToCloudinary } = await import('./cms.js');
            mediaUrl = await uploadToCloudinary(file);
            mediaType = file.type.startsWith('video/') ? 'video' : 'image';
        }

        const postRef = await addDoc(collection(db, "admin_posts"), {
            authorId: user.uid,
            authorName: userData.displayName || user.displayName || 'الإدارة',
            authorPhoto: userData.photoURL || user.photoURL,
            content: content,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            likes: [],
            commentsCount: 0,
            target: target,
            createdAt: serverTimestamp()
        });

        // إرسال إشعار للمستخدمين
        await notifyUsersAboutPost(postRef.id, content.slice(0, 50), target);

        document.getElementById('create-post-modal').remove();
        window.showToast?.('تم النشر ✅', 'success');
        updateFeedBadge();

    } catch (err) {
        console.error('Post error:', err);
        alert('حصل خطأ: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'نشر';
    }
};

// ============================================================
// إشعار المستخدمين بالبوست الجديد
// ============================================================
const notifyUsersAboutPost = async (postId, preview, target) => {
    try {
        // 1. حفظ في system/lastPost للـ badge
        await updateDoc(doc(db, "system", "feed"), {
            lastPostId: postId,
            lastPostTime: serverTimestamp()
        }).catch(() => {
            setDoc(doc(db, "system", "feed"), {
                lastPostId: postId,
                lastPostTime: serverTimestamp()
            });
        });

        // 2. إرسال push notifications للمستخدمين (client-side)
        // حفظ الإشعار في queue لتتعالج بواسطة الـ users عند فتح التطبيق
        await setDoc(doc(db, "notifications_broadcast", postId), {
            title: '📢 منشور جديد من الإدارة',
            body: preview || 'لديك منشور جديد',
            type: 'post',
            target: target,
            url: '/#posts',
            createdAt: serverTimestamp(),
            read: []
        });

        console.log('📬 Notification saved for broadcast');
    } catch (err) {
        console.log('Notify error:', err);
    }
};

// ============================================================
// Badge للمنشورات الجديدة
// ============================================================
const updateFeedBadge = async () => {
    const badge = document.getElementById('feed-badge');
    if (!badge) return;

    try {
        const user = auth.currentUser;
        if (!user) return;

        const userDoc = await getDoc(doc(db, "users", user.uid));
        const lastSeen = userDoc.data()?.lastSeenFeed?.toMillis?.() || 0;

        // عد المنشورات الجديدة بعد آخر مشاهدة
        const postsQuery = query(
            collection(db, "admin_posts"),
            orderBy("createdAt", "desc"),
            limit(20)
        );
        const postsSnap = await getDocs(postsQuery);
        let newCount = 0;
        postsSnap.forEach(d => {
            const postTime = d.data().createdAt?.toMillis?.() || 0;
            if (postTime > lastSeen) newCount++;
        });

        if (newCount > 0) {
            badge.classList.remove('hidden');
            badge.textContent = newCount > 9 ? '9+' : newCount;
        } else {
            badge.classList.add('hidden');
        }
    } catch (err) {
        console.log('Badge error:', err);
    }
};

// تحديث آخر وقت شوفت الفيد
window.markFeedAsSeen = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        await updateDoc(doc(db, "users", user.uid), {
            lastSeenFeed: serverTimestamp()
        });
        document.getElementById('feed-badge')?.classList.add('hidden');
    } catch (err) {
        console.log('Mark seen error:', err);
    }
};

// ============================================================
// Badge للكارنيهات المعلقة (للأدمن فقط)
// ============================================================
const updateIdCardsBadge = async () => {
    const badge = document.getElementById('id-cards-badge');
    if (!badge) return;

    try {
        const user = auth.currentUser;
        if (!user) return;

        // التحقق من صلاحيات الأدمن
        const isAdmin = user.email === SUPER_ADMIN_EMAIL || (await getDoc(doc(db, "admins", user.email))).exists();
        if (!isAdmin) return;

        // عد الكارنيهات المعلقة
        const pendingQuery = query(
            collection(db, "users"),
            where("idCardImage", "!=", null),
            where("isVerified", "==", false),
            limit(50)
        );
        const pendingSnap = await getDocs(pendingQuery);
        const pendingCount = pendingSnap.size;

        if (pendingCount > 0) {
            badge.classList.remove('hidden');
            badge.textContent = pendingCount > 9 ? '9+' : pendingCount;
        } else {
            badge.classList.add('hidden');
        }
    } catch (err) {
        console.log('ID Cards Badge error:', err);
    }
};

// تحديث الـ badges عند تحميل الصفحة
setTimeout(() => {
    updateFeedBadge();
    updateIdCardsBadge();
}, 2000);

// تصدير للاستخدام الخارجي
window.updateFeedBadge = updateFeedBadge;
window.updateIdCardsBadge = updateIdCardsBadge;

// ============================================================
// التعليقات
// ============================================================
window.openPostComments = async (postId) => {
    const modal = document.createElement('div');
    modal.id = 'comments-modal';
    modal.className = 'fixed inset-0 bg-black/60 z-[9999] flex items-end md:items-center justify-center animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 w-full md:max-w-lg md:rounded-3xl rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col">
            <div class="p-4 border-b dark:border-surface-700 flex justify-between items-center">
                <h3 class="font-bold dark:text-white">💬 التعليقات</h3>
                <button onclick="document.getElementById('comments-modal').remove()" class="text-surface-400 hover:text-surface-600">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div id="comments-list" class="flex-1 overflow-y-auto p-4 space-y-3">
                <div class="text-center text-surface-400"><i class="fas fa-spinner fa-spin"></i></div>
            </div>
            <div class="p-4 border-t dark:border-surface-700 flex gap-2">
                <input id="comment-input" type="text" placeholder="اكتب تعليقك..." 
                    class="flex-1 p-3 border dark:border-surface-600 rounded-xl dark:bg-surface-700 dark:text-white outline-none"
                    onkeypress="if(event.key==='Enter')window.submitComment('${postId}')">
                <button onclick="window.submitComment('${postId}')" class="bg-primary-600 text-white px-4 rounded-xl hover:bg-primary-700">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const isAdmin = await checkIfAdmin();
    loadPostComments(postId, isAdmin);
};

const loadPostComments = (postId, isAdmin) => {
    const container = document.getElementById('comments-list');

    const q = query(
        collection(db, "admin_posts", postId, "comments"),
        orderBy("createdAt", "asc"),
        limit(50)
    );

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center text-surface-400 py-6">لا توجد تعليقات بعد</p>';
            return;
        }

        container.innerHTML = '';
        snapshot.forEach(docSnap => {
            const c = docSnap.data();
            const commentId = docSnap.id;
            const time = c.createdAt?.toDate?.()?.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) || '';
            const isMe = auth.currentUser?.uid === c.userId;
            const canEdit = isMe || isAdmin;

            let actionBtns = '';
            if (canEdit) {
                // Remove encoded html from payload if needed, we'll decode on the way back to avoid syntax errors
                actionBtns = `
                    <div class="absolute left-2 top-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        ${isMe ? `<button onclick="window.editComment('${postId}', '${commentId}', '${encodeURIComponent(c.text)}')" class="text-surface-400 hover:text-primary-500 text-xs"><i class="fas fa-edit"></i></button>` : ''}
                        <button onclick="window.deleteComment('${postId}', '${commentId}')" class="text-surface-400 hover:text-red-500 text-xs"><i class="fas fa-trash"></i></button>
                    </div>
                `;
            }

            container.innerHTML += `
                <div class="flex gap-3 mb-2">
                    <img src="${c.userPhoto || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(c.userName)}" 
                         class="w-8 h-8 rounded-full object-cover">
                    <div class="flex-1 bg-surface-100 dark:bg-surface-700 rounded-2xl p-3 relative group">
                        ${actionBtns}
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-sm font-bold dark:text-white line-clamp-1">${window.sanitizeHTML?.(c.userName) || c.userName}</span>
                            <span class="text-[10px] text-surface-400">${time}</span>
                        </div>
                        <p class="text-sm dark:text-surface-300 pl-10 whitespace-pre-wrap">${window.sanitizeHTML?.(c.text) || c.text}</p>
                    </div>
                </div>
            `;
        });
        container.scrollTop = container.scrollHeight;
    });
};

window.submitComment = async (postId) => {
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text) return;

    const user = auth.currentUser;
    if (!user) return;

    input.value = '';

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data() || {};

        await addDoc(collection(db, "admin_posts", postId, "comments"), {
            userId: user.uid,
            userName: userData.displayName || user.displayName || 'مستخدم',
            userPhoto: userData.photoURL || user.photoURL,
            text: text,
            createdAt: serverTimestamp()
        });

        // تحديث عداد التعليقات
        const postRef = doc(db, "admin_posts", postId);
        await updateDoc(postRef, {
            commentsCount: (await getDoc(postRef)).data()?.commentsCount + 1 || 1
        });
    } catch (err) {
        console.error('Comment error:', err);
    }
};

window.deleteComment = async (postId, commentId) => {
    if (!confirm('هل أنت متأكد من حذف هذا التعليق؟')) return;
    try {
        await deleteDoc(doc(db, "admin_posts", postId, "comments", commentId));
        // تقليل عداد التعليقات
        const postRef = doc(db, "admin_posts", postId);
        const pdoc = await getDoc(postRef);
        if (pdoc.exists()) {
            const currentCount = pdoc.data().commentsCount || 0;
            await updateDoc(postRef, {
                commentsCount: Math.max(0, currentCount - 1)
            });
        }
        window.showToast?.('تم حذف التعليق', 'info');
    } catch (err) {
        console.error('Delete comm err:', err);
    }
};

window.editComment = async (postId, commentId, encodedText) => {
    const oldText = decodeURIComponent(encodedText);
    const newText = prompt('تعديل التعليق:', oldText);
    if (newText && newText.trim() !== oldText) {
        try {
            await updateDoc(doc(db, "admin_posts", postId, "comments", commentId), {
                text: newText.trim()
            });
            window.showToast?.('تم التعديل ✅', 'success');
        } catch (err) {
            console.error('Edit comm err:', err);
        }
    }
};

// Initialize badge on load
auth.onAuthStateChanged?.((user) => {
    if (user) setTimeout(updateFeedBadge, 2000);
});

