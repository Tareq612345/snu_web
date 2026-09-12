// ============================================================
// features.js - ميزات إضافية للمنصة (Streaks, Bookmarks, Notes)
// ============================================================

import { db, auth } from './firebase.js';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs, query, where, orderBy, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ============================================================
// 1. نظام الـ Streaks (النشاط اليومي)
// ============================================================

// تحديث الـ streak عند الدخول
export const updateStreak = async (userId) => {
    if (!userId) return;

    try {
        const userRef = doc(db, "users", userId);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) return;

        const userData = userDoc.data();
        const today = new Date().toDateString();
        const lastLogin = userData.lastStreakDate || '';
        const currentStreak = userData.currentStreak || 0;
        const bestStreak = userData.bestStreak || 0;

        let newStreak = currentStreak;

        // التحقق من آخر تسجيل دخول
        if (lastLogin === today) {
            // نفس اليوم - لا تغيير
            return;
        } else {
            const lastDate = lastLogin ? new Date(lastLogin) : new Date(0);
            const todayDate = new Date(today);
            const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                // اليوم التالي - زيادة الـ streak
                newStreak = currentStreak + 1;
            } else if (diffDays > 1) {
                // فاتت أيام - إعادة الـ streak
                newStreak = 1;
            } else {
                newStreak = 1;
            }
        }

        // تحديث البيانات
        const newBest = Math.max(newStreak, bestStreak);

        await updateDoc(userRef, {
            currentStreak: newStreak,
            bestStreak: newBest,
            lastStreakDate: today,
            totalXp: (userData.totalXp || 0) + 5 // +5 XP يومياً
        });

        // إشعار عند الوصول لـ streaks مميزة
        if (newStreak === 7) {
            window.showToast?.(window.t?.('streak-week') || "🔥 أسبوع كامل! حافظ على نشاطك", "success");
        } else if (newStreak === 30) {
            window.showToast?.(window.t?.('streak-month') || "🏆 شهر كامل من النشاط! أنت بطل", "success");
        } else if (newStreak > currentStreak && newStreak > 1) {
            window.showToast?.(`🔥 ${newStreak} ${window.t?.('consecutive-days') || 'أيام متتالية'}!`, "success");
        }

        console.log(`✅ Streak updated: ${newStreak} days (Best: ${newBest})`);

    } catch (e) {
        console.error("Streak Update Error:", e);
    }
};

// عرض الـ streak widget في الصفحة الرئيسية
export const renderStreakWidget = async (containerId, userId) => {
    const container = document.getElementById(containerId);
    if (!container || !userId) return;

    try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (!userDoc.exists()) return;

        const data = userDoc.data();
        const streak = data.currentStreak || 0;
        const best = data.bestStreak || 0;
        const xp = data.totalXp || 0;

        // أيقونة حسب مستوى الـ streak
        let fireIcon = '🔥';
        let bgColor = 'from-orange-500 to-red-500';

        if (streak >= 30) {
            fireIcon = '💎';
            bgColor = 'from-indigo-500 to-pink-500';
        } else if (streak >= 7) {
            fireIcon = '⚡';
            bgColor = 'from-yellow-500 to-orange-500';
        }

        container.innerHTML = `
            <div class="bg-gradient-to-br ${bgColor} rounded-3xl p-5 text-white shadow-xl animate-fade-in relative overflow-hidden group cursor-pointer hover:scale-[1.02] transition-transform">
                <!-- خلفية متحركة -->
                <div class="absolute inset-0 opacity-20">
                    <div class="absolute top-2 right-4 text-6xl animate-bounce-slow">${fireIcon}</div>
                </div>
                
                <div class="relative z-10">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-lg font-black flex items-center gap-2">
                            ${fireIcon} ${window.t?.('daily-activity') || 'نشاطك اليومي'}
                        </h3>
                        <span class="text-xs bg-white/20 px-3 py-1 rounded-full font-bold">
                            ${window.t?.('best-day') || 'أفضل'}: ${best} ${window.t?.('days') || 'يوم'}
                        </span>
                    </div>
                    
                    <div class="flex items-center gap-6">
                        <div class="text-center">
                            <div class="text-5xl font-black">${streak}</div>
                            <div class="text-xs opacity-80 mt-1">${window.t?.('day-streak') || 'يوم متتالي'}</div>
                        </div>
                        
                        <div class="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                            <div class="h-full bg-white rounded-full transition-all duration-500" style="width: ${Math.min((streak / 30) * 100, 100)}%"></div>
                        </div>
                        
                        <div class="text-center">
                            <div class="text-2xl font-black">${xp}</div>
                            <div class="text-xs opacity-80">XP</div>
                        </div>
                    </div>
                    
                    ${streak === 0 ? `
                        <p class="text-xs mt-3 opacity-80 text-center">
                            ${window.t?.('start-today-rewards') || 'ابدأ اليوم واحصل على مكافآت يومية!'} 🎯
                        </p>
                    ` : ''}
                </div>
            </div>
        `;

    } catch (e) {
        console.error("Render Streak Error:", e);
    }
};

// ============================================================
// 2. نظام المفضلة (Bookmarks)
// ============================================================

export const toggleBookmark = async (userId, itemId, itemType, itemData) => {
    if (!userId || !itemId) return;

    try {
        const bookmarkRef = doc(db, `users/${userId}/bookmarks`, itemId);
        const bookmarkDoc = await getDoc(bookmarkRef);

        if (bookmarkDoc.exists()) {
            // إزالة من المفضلة
            await deleteDoc(bookmarkRef);
            window.showToast?.(window.t?.('removed-from-favorites') || "تم الإزالة من المفضلة", "success");
            return false;
        } else {
            // إضافة للمفضلة
            await setDoc(bookmarkRef, {
                itemId,
                itemType, // 'lesson', 'quiz', 'section'
                ...itemData,
                addedAt: new Date()
            });
            window.showToast?.(window.t?.('added-to-favorites') || "❤️ تم الإضافة للمفضلة", "success");
            return true;
        }

    } catch (e) {
        console.error("Bookmark Error:", e);
        window.showToast?.(window.t?.('error') || "حدث خطأ", "error");
    }
};

export const getBookmarks = async (userId) => {
    if (!userId) return [];

    try {
        const bookmarksRef = collection(db, `users/${userId}/bookmarks`);
        const snap = await getDocs(query(bookmarksRef, orderBy("addedAt", "desc"), limit(50)));

        const bookmarks = [];
        snap.forEach(doc => bookmarks.push({ id: doc.id, ...doc.data() }));

        return bookmarks;

    } catch (e) {
        console.error("Get Bookmarks Error:", e);
        return [];
    }
};

export const isBookmarked = async (userId, itemId) => {
    if (!userId || !itemId) return false;

    try {
        const bookmarkRef = doc(db, `users/${userId}/bookmarks`, itemId);
        const bookmarkDoc = await getDoc(bookmarkRef);
        return bookmarkDoc.exists();
    } catch (e) {
        return false;
    }
};

// ============================================================
// 3. نظام الملاحظات الشخصية (Notes)
// ============================================================

export const saveNote = async (userId, lessonId, noteContent) => {
    if (!userId || !lessonId) return;

    try {
        const noteRef = doc(db, `users/${userId}/notes`, lessonId);

        if (noteContent.trim() === '') {
            await deleteDoc(noteRef);
            window.showToast?.(window.t?.('note-deleted') || "تم حذف الملاحظة", "success");
        } else {
            await setDoc(noteRef, {
                lessonId,
                content: noteContent,
                updatedAt: new Date()
            });
            window.showToast?.(window.t?.('note-saved') || "📝 تم حفظ الملاحظة", "success");
        }

    } catch (e) {
        console.error("Save Note Error:", e);
        window.showToast?.(window.t?.('save-error') || "حدث خطأ في الحفظ", "error");
    }
};

export const getNote = async (userId, lessonId) => {
    if (!userId || !lessonId) return '';

    try {
        const noteRef = doc(db, `users/${userId}/notes`, lessonId);
        const noteDoc = await getDoc(noteRef);

        return noteDoc.exists() ? noteDoc.data().content : '';

    } catch (e) {
        console.error("Get Note Error:", e);
        return '';
    }
};

export const getAllNotes = async (userId) => {
    if (!userId) return [];

    try {
        const notesRef = collection(db, `users/${userId}/notes`);
        const snap = await getDocs(query(notesRef, orderBy("updatedAt", "desc"), limit(50)));

        const notes = [];
        snap.forEach(doc => notes.push({ id: doc.id, ...doc.data() }));

        return notes;

    } catch (e) {
        console.error("Get All Notes Error:", e);
        return [];
    }
};

// ============================================================
// 4. نظام الأهداف الأسبوعية (Weekly Goals)
// ============================================================

export const setWeeklyGoal = async (userId, goalData) => {
    if (!userId) return;

    try {
        const weekStart = getWeekStart();
        const goalRef = doc(db, `users/${userId}/goals`, weekStart);

        await setDoc(goalRef, {
            ...goalData,
            weekStart,
            createdAt: new Date(),
            progress: 0
        });

        window.showToast?.(window.t?.('goal-set') || "✅ تم تحديد هدف الأسبوع", "success");

    } catch (e) {
        console.error("Set Goal Error:", e);
    }
};

export const updateGoalProgress = async (userId, progressDelta) => {
    if (!userId) return;

    try {
        const weekStart = getWeekStart();
        const goalRef = doc(db, `users/${userId}/goals`, weekStart);
        const goalDoc = await getDoc(goalRef);

        if (goalDoc.exists()) {
            const current = goalDoc.data().progress || 0;
            const target = goalDoc.data().target || 100;
            const newProgress = Math.min(current + progressDelta, target);

            await updateDoc(goalRef, { progress: newProgress });

            if (newProgress >= target && current < target) {
                window.showToast?.(window.t?.('goal-achieved') || "🎉 أحسنت! أنجزت هدف الأسبوع", "success");
            }
        }

    } catch (e) {
        console.error("Update Goal Error:", e);
    }
};

const getWeekStart = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day;
    return new Date(now.setDate(diff)).toISOString().split('T')[0];
};

// ============================================================
// 5. لوحات التحكم (Panels)
// ============================================================

// لوحة الملاحظات
window.openNotesPanel = async () => {
    const user = auth.currentUser;
    if (!user) return alert(window.t?.('please-login') || "يرجى تسجيل الدخول أولاً");

    const notes = await getAllNotes(user.uid);

    const modal = document.createElement('div');
    modal.id = 'notes-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl animate-scale-in">
            <div class="bg-gradient-to-r from-indigo-600 to-pink-600 p-5 text-white flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <i class="fas fa-sticky-note text-2xl"></i>
                    <div>
                        <h3 class="font-bold text-lg">${window.t?.('my-notes') || 'ملاحظاتي'}</h3>
                        <p class="text-xs opacity-70">${notes.length} ${window.t?.('note') || 'ملاحظة'}</p>
                    </div>
                </div>
                <button onclick="this.closest('#notes-modal').remove()" class="hover:bg-white/20 p-2 rounded-full transition"><i class="fas fa-times"></i></button>
            </div>
            
            <div class="p-4 bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                <div class="flex gap-2">
                    <input type="text" id="note-lesson-id" placeholder="${window.t?.('lesson-id-optional') || 'معرف الدرس (اختياري)'}" class="flex-1 p-2 rounded-lg bg-white dark:bg-gray-700 text-sm border dark:border-gray-600 dark:text-white">
                    <button onclick="document.getElementById('new-note-area').classList.toggle('hidden')" class="bg-indigo-600 text-white px-4 rounded-lg font-bold text-sm hover:bg-indigo-700 transition">
                        <i class="fas fa-plus"></i> ${window.t?.('new') || 'جديد'}
                    </button>
                </div>
                <div id="new-note-area" class="hidden mt-3">
                    <textarea id="new-note-text" class="w-full p-3 border rounded-xl dark:bg-gray-700 dark:text-white dark:border-gray-600 text-sm" rows="3" placeholder="${window.t?.('write-note-here') || 'اكتب ملاحظتك هنا...'}"></textarea>
                    <button onclick="window.saveNewNote()" class="mt-2 w-full bg-gradient-to-r from-indigo-600 to-pink-600 text-white py-2 rounded-xl font-bold text-sm hover:shadow-lg transition">
                        <i class="fas fa-save"></i> ${window.t?.('save-note') || 'حفظ الملاحظة'}
                    </button>
                </div>
            </div>
            
            <div class="p-4 overflow-y-auto max-h-96">
                ${notes.length === 0 ? `
                    <div class="text-center py-10 text-gray-400">
                        <i class="fas fa-sticky-note text-4xl mb-2 opacity-30"></i>
                        <p>${window.t?.('no-notes-yet') || 'لا توجد ملاحظات بعد'}</p>
                    </div>
                ` : notes.map(n => `
                    <div class="bg-white dark:bg-gray-700 p-3 rounded-xl mb-2 border dark:border-gray-600 shadow-sm group">
                        <div class="flex justify-between items-start">
                            <p class="text-sm dark:text-white">${n.content}</p>
                            <button onclick="window.deleteNote('${n.id}')" class="text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100">
                                <i class="fas fa-trash text-xs"></i>
                            </button>
                        </div>
                        <p class="text-[10px] text-gray-400 mt-1">${n.lessonId || (window.t?.('general-note') || 'ملاحظة عامة')} • ${new Date(n.createdAt?.toDate?.() || n.createdAt).toLocaleDateString(window.t?.('locale') || 'ar-EG')}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
};

window.saveNewNote = async () => {
    const lessonId = document.getElementById('note-lesson-id').value.trim() || 'general';
    const content = document.getElementById('new-note-text').value.trim();
    if (!content) return;

    await saveNote(auth.currentUser.uid, lessonId, content);
    document.getElementById('notes-modal').remove();
    window.openNotesPanel();
};

// لوحة الأهداف
window.openGoalsPanel = async () => {
    const user = auth.currentUser;
    if (!user) return alert(window.t?.('please-login') || "يرجى تسجيل الدخول أولاً");

    const weekStart = getWeekStart();
    const goalDoc = await getDoc(doc(db, `users/${user.uid}/goals`, weekStart));
    const goalData = goalDoc.exists() ? goalDoc.data() : { target: 100, progress: 0, label: window.t?.('complete-100-xp') || 'إتمام 100 XP' };
    const progress = Math.round((goalData.progress / goalData.target) * 100) || 0;

    const modal = document.createElement('div');
    modal.id = 'goals-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-in">
            <div class="bg-gradient-to-r from-green-600 to-emerald-600 p-5 text-white">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="font-bold text-xl">🎯 ${window.t?.('weekly-goal') || 'هدف الأسبوع'}</h3>
                        <p class="text-xs opacity-70">${window.t?.('week') || 'أسبوع'} ${weekStart}</p>
                    </div>
                    <button onclick="this.closest('#goals-modal').remove()" class="hover:bg-white/20 p-2 rounded-full transition"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="mt-6 flex items-center justify-center">
                    <div class="relative w-32 h-32">
                        <svg class="w-full h-full transform -rotate-90">
                            <circle cx="64" cy="64" r="56" stroke="rgba(255,255,255,0.2)" stroke-width="12" fill="transparent"/>
                            <circle cx="64" cy="64" r="56" stroke="white" stroke-width="12" fill="transparent"
                                stroke-dasharray="${2 * Math.PI * 56}" 
                                stroke-dashoffset="${2 * Math.PI * 56 * (1 - progress / 100)}"
                                stroke-linecap="round" class="transition-all duration-1000"/>
                        </svg>
                        <span class="absolute inset-0 flex items-center justify-center text-3xl font-black">${progress}%</span>
                    </div>
                </div>
                
                <p class="text-center mt-4 font-bold text-lg">${goalData.label}</p>
                <p class="text-center text-sm opacity-70">${goalData.progress} / ${goalData.target}</p>
            </div>
            
            <div class="p-5">
                <p class="text-sm font-bold dark:text-white mb-3">${window.t?.('change-goal') || 'تغيير الهدف'}:</p>
                <div class="flex gap-2">
                    <input type="number" id="goal-target" value="${goalData.target}" min="10" max="1000" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:text-white dark:border-gray-600 text-center font-bold">
                    <input type="text" id="goal-label" value="${goalData.label}" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:text-white dark:border-gray-600 text-sm">
                </div>
                <button onclick="window.saveNewGoal()" class="mt-3 w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition">
                    <i class="fas fa-save"></i> ${window.t?.('btn-save') || 'حفظ'}
                </button>
            </div>
        </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
};

window.saveNewGoal = async () => {
    const target = parseInt(document.getElementById('goal-target').value) || 100;
    const label = document.getElementById('goal-label').value || (window.t?.('my-weekly-goal') || 'هدفي الأسبوعي');
    await setWeeklyGoal(auth.currentUser.uid, target, label);
    document.getElementById('goals-modal').remove();
    window.showToast?.(window.t?.('goal-saved') || "✅ تم حفظ الهدف", "success");
};

// لوحة المفضلة
window.openBookmarksPanel = async () => {
    const user = auth.currentUser;
    if (!user) return alert(window.t?.('please-login') || "يرجى تسجيل الدخول أولاً");

    const bookmarks = await getBookmarks(user.uid);

    const modal = document.createElement('div');
    modal.id = 'bookmarks-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl animate-scale-in">
            <div class="bg-gradient-to-r from-pink-600 to-rose-600 p-5 text-white flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <i class="fas fa-heart text-2xl"></i>
                    <div>
                        <h3 class="font-bold text-lg">${window.t?.('favorites') || 'المفضلة'}</h3>
                        <p class="text-xs opacity-70">${bookmarks.length} ${window.t?.('saved-items') || 'عنصر محفوظ'}</p>
                    </div>
                </div>
                <button onclick="this.closest('#bookmarks-modal').remove()" class="hover:bg-white/20 p-2 rounded-full transition"><i class="fas fa-times"></i></button>
            </div>
            
            <div class="p-4 overflow-y-auto max-h-96">
                ${bookmarks.length === 0 ? `
                    <div class="text-center py-10 text-gray-400">
                        <i class="fas fa-heart text-4xl mb-2 opacity-30"></i>
                        <p>${window.t?.('no-favorites') || 'لا توجد عناصر في المفضلة'}</p>
                        <p class="text-xs mt-1">${window.t?.('tap-heart-to-add') || 'اضغط على قلب ❤️ لإضافة محتوى'}</p>
                    </div>
                ` : bookmarks.map(b => `
                    <div class="bg-white dark:bg-gray-700 p-4 rounded-xl mb-2 border dark:border-gray-600 shadow-sm flex items-center gap-3 group hover:shadow-lg transition cursor-pointer">
                        <div class="w-10 h-10 bg-gradient-to-r from-pink-500 to-rose-500 rounded-xl flex items-center justify-center text-white text-lg">
                            ${b.itemType === 'lesson' ? '📖' : b.itemType === 'quiz' ? '📝' : '📁'}
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="font-bold dark:text-white truncate">${b.title || b.itemId}</p>
                            <p class="text-xs text-gray-400">${b.itemType} • ${new Date(b.addedAt?.toDate?.() || b.addedAt).toLocaleDateString(window.t?.('locale') || 'ar-EG')}</p>
                        </div>
                        <button onclick="window.removeBookmark('${b.id}')" class="text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
};

window.removeBookmark = async (bookmarkId) => {
    const user = auth.currentUser;
    if (!user) return;
    await deleteDoc(doc(db, `users/${user.uid}/bookmarks`, bookmarkId));
    document.getElementById('bookmarks-modal').remove();
    window.openBookmarksPanel();
};

window.deleteNote = async (noteId) => {
    const user = auth.currentUser;
    if (!user) return;
    await deleteDoc(doc(db, `users/${user.uid}/notes`, noteId));
    document.getElementById('notes-modal').remove();
    window.openNotesPanel();
};

// ============================================================
// 6. تصدير الدوال
// ============================================================

// ============================================================
// 7. نظام المفضلة للمحتوى (Favorites)
// ============================================================

// Toggle favorite for any content
window.toggleFavorite = async (type, itemId, title) => {
    const user = auth.currentUser;
    if (!user) {
        alert(window.t?.('please-login') || 'يجب تسجيل الدخول أولاً');
        return;
    }

    const key = `favorites_${user.uid}`;
    let favorites = JSON.parse(localStorage.getItem(key) || '[]');

    const existingIndex = favorites.findIndex(f => f.type === type && f.id === itemId);
    const btn = document.getElementById(`fav-${type}-${itemId}`);
    const icon = btn?.querySelector('i');

    if (existingIndex >= 0) {
        // Remove from favorites
        favorites.splice(existingIndex, 1);
        if (icon) {
            icon.className = 'far fa-heart text-red-400 text-lg';
        }
        window.showToast?.(window.t?.('removed-from-favorites') || 'تم الإزالة من المفضلة', 'info');
    } else {
        // Add to favorites
        favorites.push({
            type,
            id: itemId,
            title,
            addedAt: new Date().toISOString()
        });
        if (icon) {
            icon.className = 'fas fa-heart text-red-500 text-lg animate-pulse';
        }
        window.showToast?.(window.t?.('added-to-favorites') || 'تم الإضافة للمفضلة ❤️', 'success');
    }

    localStorage.setItem(key, JSON.stringify(favorites));

    // Update bookmarks widget if visible
    window.loadFavoritesWidget?.();
};

// Check if item is in favorites
window.checkIfFavorite = (type, itemId) => {
    const user = auth.currentUser;
    if (!user) return false;

    const key = `favorites_${user.uid}`;
    const favorites = JSON.parse(localStorage.getItem(key) || '[]');
    const isFav = favorites.some(f => f.type === type && f.id === itemId);

    const btn = document.getElementById(`fav-${type}-${itemId}`);
    if (btn && isFav) {
        const icon = btn.querySelector('i');
        if (icon) icon.className = 'fas fa-heart text-red-500 text-lg';
    }

    return isFav;
};

// Get all favorites
window.getFavorites = () => {
    const user = auth.currentUser;
    if (!user) return [];

    const key = `favorites_${user.uid}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
};

// Load favorites widget
window.loadFavoritesWidget = () => {
    const container = document.getElementById('bookmarks-list');
    if (!container) return;

    const favorites = window.getFavorites();

    if (favorites.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-400 text-sm py-4">${window.t?.('no-favorites') || 'لا توجد مفضلات'}</p>`;
        return;
    }

    container.innerHTML = favorites.map(fav => {
        const icon = fav.type === 'section' ? 'fa-book' : 'fa-file-alt';
        const link = fav.type === 'section' ? `#section/${fav.id}` : `#lesson/${fav.id}`;
        return `
            <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-xl mb-2 group">
                <a href="${link}" class="flex items-center gap-3 flex-1 truncate">
                    <i class="fas ${icon} text-red-400"></i>
                    <span class="text-sm font-bold dark:text-white truncate">${fav.title}</span>
                </a>
                <button onclick="window.toggleFavorite('${fav.type}', '${fav.id}', '${fav.title}')" class="w-8 h-8 text-red-400 hover:text-red-600 transition opacity-0 group-hover:opacity-100">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }).join('');
};

// ============================================================
// 8. ويدجت إحصائيات الطالب (Student Statistics Widget)
// ============================================================

export const renderStatsWidget = async (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const user = auth.currentUser;
    if (!user) {
        container.innerHTML = `<p class="text-gray-400 text-center text-sm">${window.t?.('login-to-view-stats') || 'سجل دخولك لعرض الإحصائيات'}</p>`;
        return;
    }

    try {
        // جلب بيانات المستخدم
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};

        // حساب عدد الكويزات
        const scoresSnap = await getDocs(query(collection(db, "user_scores"), where("userId", "==", user.uid)));
        const quizzesTaken = scoresSnap.size;

        // حساب إجمالي الدرجات
        let totalScore = 0;
        scoresSnap.forEach(d => totalScore += (d.data().score || 0));
        const avgScore = quizzesTaken > 0 ? Math.round(totalScore / quizzesTaken) : 0;

        // تاريخ أول تسجيل دخول
        const joinDate = userData.createdAt?.toDate?.() || new Date();
        const daysOnPlatform = Math.max(1, Math.floor((new Date() - joinDate) / (1000 * 60 * 60 * 24)));

        container.innerHTML = `
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-4 rounded-2xl text-center">
                    <div class="text-3xl font-black">${quizzesTaken}</div>
                    <div class="text-xs opacity-80 mt-1">📝 ${window.t?.('completed-quizzes') || 'كويز مكتمل'}</div>
                </div>
                <div class="bg-gradient-to-br from-green-500 to-emerald-600 text-white p-4 rounded-2xl text-center">
                    <div class="text-3xl font-black">${avgScore}%</div>
                    <div class="text-xs opacity-80 mt-1">📊 ${window.t?.('average-score') || 'متوسط الدرجات'}</div>
                </div>
                <div class="bg-gradient-to-br from-orange-500 to-red-500 text-white p-4 rounded-2xl text-center">
                    <div class="text-3xl font-black">${userData.totalXp || 0}</div>
                    <div class="text-xs opacity-80 mt-1">⭐ ${window.t?.('xp-points') || 'نقاط XP'}</div>
                </div>
                <div class="bg-gradient-to-br from-blue-500 to-indigo-500 text-white p-4 rounded-2xl text-center">
                    <div class="text-3xl font-black">${daysOnPlatform}</div>
                    <div class="text-xs opacity-80 mt-1">📅 ${window.t?.('days-on-platform') || 'يوم على المنصة'}</div>
                </div>
            </div>
            <div class="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl flex items-center justify-between">
                <span class="text-sm font-bold dark:text-white">🔥 ${window.t?.('current-streak') || 'Streak الحالي'}</span>
                <span class="text-lg font-black text-orange-500">${userData.currentStreak || 0} ${window.t?.('days') || 'أيام'}</span>
            </div>
        `;
    } catch (e) {
        console.error("Stats Widget Error:", e);
        container.innerHTML = `<p class="text-red-500 text-center text-sm">${window.t?.('error-loading-stats') || 'خطأ في تحميل الإحصائيات'}</p>`;
    }
};

// تحميل الإحصائيات عند فتح الـ widget
window.loadStatsWidget = () => {
    renderStatsWidget('stats-widget-content');
};

// فتح panel الإحصائيات الكامل
window.openStatsPanel = async () => {
    const user = auth.currentUser;
    if (!user) return alert(window.t?.('please-login-first') || 'سجل دخولك أولاً');

    // إنشاء الـ modal
    const modal = document.createElement('div');
    modal.id = 'stats-panel-modal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div class="sticky top-0 bg-white dark:bg-gray-800 p-4 border-b dark:border-gray-700 flex justify-between items-center z-10">
                <h3 class="font-black text-xl dark:text-white flex items-center gap-2">
                    <i class="fas fa-chart-bar text-blue-500"></i> ${window.t?.('my-stats') || 'إحصائياتي'}
                </h3>
                <button onclick="document.getElementById('stats-panel-modal').remove()" class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-red-100 hover:text-red-500 transition flex items-center justify-center">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div id="stats-panel-content" class="p-4">
                <div class="text-center py-10">
                    <i class="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
                    <p class="text-gray-400 mt-2">جاري التحميل...</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    // تحميل الإحصائيات
    await renderStatsWidget('stats-panel-content');
};

// ============================================================
// 9. ويدجت التقويم (Task Calendar Widget)
// ============================================================

export const renderCalendarWidget = async (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const user = auth.currentUser;
    if (!user) {
        container.innerHTML = '<p class="text-gray-400 text-center text-sm">سجل دخولك لعرض التقويم</p>';
        return;
    }

    try {
        // جلب الكويزات القادمة
        const quizzesSnap = await getDocs(query(collection(db, "quizzes"), orderBy("endDate", "asc")));
        const assignments = await getDocs(query(collection(db, "assignments"), orderBy("dueDate", "asc")));

        const now = new Date();
        const upcomingEvents = [];

        // إضافة الكويزات
        quizzesSnap.forEach(d => {
            const quiz = d.data();
            const endDate = quiz.endDate?.toDate?.() || null;
            if (endDate && endDate > now) {
                upcomingEvents.push({
                    type: 'quiz',
                    title: quiz.title,
                    date: endDate,
                    id: d.id,
                    icon: '📝',
                    color: 'purple'
                });
            }
        });

        // إضافة الواجبات
        assignments.forEach(d => {
            const assign = d.data();
            const dueDate = assign.dueDate?.toDate?.() || null;
            if (dueDate && dueDate > now) {
                upcomingEvents.push({
                    type: 'assignment',
                    title: assign.title,
                    date: dueDate,
                    id: d.id,
                    icon: '📋',
                    color: 'green'
                });
            }
        });

        // ترتيب حسب التاريخ
        upcomingEvents.sort((a, b) => a.date - b.date);

        if (upcomingEvents.length === 0) {
            container.innerHTML = `
                <div class="text-center py-6 text-gray-400">
                    <i class="fas fa-calendar-check text-3xl mb-2 opacity-30"></i>
                    <p class="text-sm">لا توجد مهام قادمة</p>
                </div>
            `;
            return;
        }

        container.innerHTML = upcomingEvents.slice(0, 5).map(event => {
            const daysLeft = Math.ceil((event.date - now) / (1000 * 60 * 60 * 24));
            const urgencyClass = daysLeft <= 1 ? 'bg-red-100 text-red-600 dark:bg-red-900/30' :
                daysLeft <= 3 ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30' :
                    'bg-gray-100 text-gray-600 dark:bg-gray-700';
            return `
                <div class="flex items-center gap-3 p-3 bg-white dark:bg-gray-700 rounded-xl mb-2 shadow-sm border-r-4 border-${event.color}-500 hover:shadow-md transition group">
                    <span class="text-2xl">${event.icon}</span>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold dark:text-white truncate">${event.title}</p>
                        <p class="text-[10px] text-gray-400">${event.date.toLocaleDateString('ar-EG')}</p>
                    </div>
                    <span class="${urgencyClass} px-2 py-1 rounded-full text-[10px] font-bold">
                        ${daysLeft === 0 ? 'اليوم!' : daysLeft === 1 ? 'غداً' : `${daysLeft} أيام`}
                    </span>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error("Calendar Widget Error:", e);
        container.innerHTML = '<p class="text-red-500 text-center text-sm">خطأ في تحميل التقويم</p>';
    }
};

// فتح لوحة التقويم الكاملة
window.openCalendarPanel = async () => {
    const modal = document.createElement('div');
    modal.id = 'calendar-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl animate-scale-in">
            <div class="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <i class="fas fa-calendar-alt text-2xl"></i>
                    <div>
                        <h3 class="font-bold text-lg">التقويم</h3>
                        <p class="text-xs opacity-70">المهام والاختبارات القادمة</p>
                    </div>
                </div>
                <button onclick="this.closest('#calendar-modal').remove()" class="hover:bg-white/20 p-2 rounded-full transition"><i class="fas fa-times"></i></button>
            </div>
            <div id="calendar-full-content" class="p-4 overflow-y-auto max-h-96">
                <div class="text-center py-6"><i class="fas fa-spinner fa-spin text-2xl text-blue-500"></i></div>
            </div>
        </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);

    await renderCalendarWidget('calendar-full-content');
};

window.toggleBookmark = toggleBookmark;
window.saveNote = saveNote;
window.getNote = getNote;

// ============================================================
// 10. تصدير الدرجات كـ PDF
// ============================================================

window.exportGradesToPDF = async () => {
    const user = auth.currentUser;
    if (!user) return window.showToast?.('يجب تسجيل الدخول أولاً');

    window.showToast?.('⏳ جاري تحضير ملف PDF...', 'info');

    try {
        // جلب الدرجات
        const scoresSnap = await getDocs(query(collection(db, "user_scores"), where("userId", "==", user.uid), orderBy("date", "desc"), limit(50)));

        if (scoresSnap.empty) {
            window.showToast?.('لا توجد درجات لتصديرها', 'warning');
            return;
        }

        // جلب بيانات المستخدم
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};

        // إنشاء محتوى HTML للطباعة
        let htmlContent = `
            <html dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>تقرير الدرجات - ${userData.displayName}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 40px; direction: rtl; }
                    h1 { color: #2563eb; text-align: center; margin-bottom: 10px; }
                    .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background: #2563eb; color: white; padding: 12px; text-align: right; }
                    td { padding: 10px; border-bottom: 1px solid #ddd; }
                    tr:nth-child(even) { background: #f9f9f9; }
                    .score-pass { color: #22c55e; font-weight: bold; }
                    .score-fail { color: #ef4444; font-weight: bold; }
                    .footer { margin-top: 40px; text-align: center; color: #999; font-size: 12px; }
                </style>
            </head>
            <body>
                <h1>📊 تقرير الدرجات</h1>
                <p class="subtitle">${userData.displayName} - ${new Date().toLocaleDateString('ar-EG')}</p>
                <table>
                    <tr><th>الاختبار</th><th>القسم</th><th>الدرجة</th><th>التاريخ</th></tr>
        `;

        let totalScore = 0;
        let count = 0;

        scoresSnap.forEach(d => {
            const s = d.data();
            totalScore += s.score || 0;
            count++;
            const scoreClass = (s.score || 0) >= 50 ? 'score-pass' : 'score-fail';
            const date = s.date?.toDate?.()?.toLocaleDateString('ar-EG') || '-';
            htmlContent += `
                <tr>
                    <td>${s.quizTitle || 'اختبار'}</td>
                    <td>${s.sectionTitle || '-'}</td>
                    <td class="${scoreClass}">${s.score || 0}%</td>
                    <td>${date}</td>
                </tr>
            `;
        });

        const avgScore = count > 0 ? Math.round(totalScore / count) : 0;

        htmlContent += `
                </table>
                <div style="margin-top: 30px; padding: 20px; background: #f0f4ff; border-radius: 10px; text-align: center;">
                    <strong>المتوسط العام: ${avgScore}%</strong> | <strong>عدد الاختبارات: ${count}</strong>
                </div>
                <p class="footer">تم إنشاء هذا التقرير تلقائياً من منصة NebraS</p>
            </body>
            </html>
        `;

        // فتح نافذة للطباعة
        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.print();

        window.showToast?.('✅ تم فتح نافذة الطباعة', 'success');

    } catch (e) {
        console.error('PDF Export Error:', e);
        window.showToast?.('❌ حدث خطأ في التصدير', 'error');
    }
};

// ============================================================
// 11. البحث الشامل (Global Search)
// ============================================================

window.openSearchPanel = async () => {
    const modal = document.createElement('div');
    modal.id = 'search-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-[9999] flex items-start justify-center pt-20 p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-xl shadow-2xl animate-scale-in overflow-hidden">
            <div class="p-5 border-b dark:border-gray-700">
                <div class="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 rounded-2xl px-4 py-3">
                    <i class="fas fa-search text-gray-400"></i>
                    <input type="text" id="search-input" placeholder="ابحث في المواد، الدروس، الكويزات..." 
                        class="flex-1 bg-transparent border-none outline-none dark:text-white text-lg" autofocus>
                    <button onclick="this.closest('#search-modal').remove()" class="text-gray-400 hover:text-red-500">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div id="search-results" class="p-4 max-h-96 overflow-y-auto">
                <p class="text-center text-gray-400 py-8"><i class="fas fa-lightbulb text-2xl mb-2 opacity-30"></i><br>ابدأ الكتابة للبحث...</p>
            </div>
        </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);

    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');

    let searchTimeout;
    input.oninput = () => {
        clearTimeout(searchTimeout);
        const query = input.value.trim().toLowerCase();

        if (query.length < 2) {
            results.innerHTML = '<p class="text-center text-gray-400 py-8">اكتب حرفين على الأقل للبحث...</p>';
            return;
        }

        results.innerHTML = '<p class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-blue-500"></i></p>';

        searchTimeout = setTimeout(async () => {
            try {
                let items = [];

                // البحث في المواد
                const sectionsSnap = await getDocs(collection(db, "study_sections"));
                sectionsSnap.forEach(d => {
                    const data = d.data();
                    if ((data.title || '').toLowerCase().includes(query)) {
                        items.push({ type: 'section', icon: '📚', title: data.title, id: d.id, link: `#section/${d.id}` });
                    }
                });

                // البحث في الكويزات
                const quizzesSnap = await getDocs(collection(db, "quizzes"));
                quizzesSnap.forEach(d => {
                    const data = d.data();
                    if ((data.title || '').toLowerCase().includes(query)) {
                        items.push({ type: 'quiz', icon: '📝', title: data.title, id: d.id, link: '#quiz' });
                    }
                });

                if (items.length === 0) {
                    results.innerHTML = `
                        <div class="text-center py-8 text-gray-400">
                            <i class="fas fa-search text-3xl mb-2 opacity-30"></i>
                            <p>لا توجد نتائج لـ "${query}"</p>
                        </div>
                    `;
                    return;
                }

                results.innerHTML = items.map(item => `
                    <a href="${item.link}" onclick="document.getElementById('search-modal').remove()" 
                        class="flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition mb-2">
                        <span class="text-2xl">${item.icon}</span>
                        <div class="flex-1">
                            <p class="font-bold dark:text-white">${item.title}</p>
                            <p class="text-xs text-gray-400">${item.type === 'section' ? 'مادة دراسية' : 'اختبار'}</p>
                        </div>
                        <i class="fas fa-arrow-left text-gray-300"></i>
                    </a>
                `).join('');

            } catch (e) {
                console.error('Search Error:', e);
                results.innerHTML = '<p class="text-center text-red-500 py-8">حدث خطأ في البحث</p>';
            }
        }, 300);
    };

    // تفعيل البحث بـ Keyboard shortcut
    input.focus();
};

// Keyboard shortcut للبحث
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        window.openSearchPanel?.();
    }
});

// ============================================================
// 12. صفحة درجاتي (My Grades Panel)
// ============================================================
window.openMyGradesPanel = async () => {
    const user = auth.currentUser;
    if (!user) return window.showToast?.('يرجى تسجيل الدخول');

    const panel = document.createElement('div');
    panel.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[500] flex items-center justify-center p-4';
    panel.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl animate-slide-up">
            <div class="p-6 bg-gradient-to-r from-green-500 to-emerald-600 text-white">
                <div class="flex justify-between items-center">
                    <h2 class="text-2xl font-black"><i class="fas fa-chart-line ml-2"></i>درجاتي</h2>
                    <button onclick="this.closest('.fixed').remove()" class="w-10 h-10 bg-white/20 rounded-full hover:bg-white/30 transition"><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div id="my-grades-content" class="p-6 overflow-y-auto max-h-[60vh]">
                <div class="text-center py-10"><i class="fas fa-spinner fa-spin text-4xl text-green-500"></i></div>
            </div>
        </div>
    `;
    document.body.appendChild(panel);
    panel.onclick = (e) => { if (e.target === panel) panel.remove(); };

    try {
        const gradesSnap = await getDocs(query(collection(db, "final_grades"), where("userId", "==", user.uid)));
        const content = document.getElementById('my-grades-content');

        if (gradesSnap.empty) {
            content.innerHTML = `
                <div class="text-center py-10 text-gray-500">
                    <i class="fas fa-inbox text-5xl mb-4 opacity-50"></i>
                    <p class="font-bold">لا توجد درجات مسجلة بعد</p>
                    <p class="text-sm mt-2">سيتم عرض درجاتك هنا بمجرد رفعها من الإدارة</p>
                </div>
            `;
            return;
        }

        let totalScore = 0, totalMax = 0;
        let rows = '';
        gradesSnap.forEach(d => {
            const g = d.data();
            totalScore += g.score;
            totalMax += g.maxScore;
            const percent = Math.round((g.score / g.maxScore) * 100);
            const color = percent >= 85 ? 'text-green-600' : percent >= 60 ? 'text-yellow-600' : 'text-red-600';
            rows += `
                <tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td class="p-4 font-bold">${g.subject}</td>
                    <td class="p-4 text-center font-mono ${color}">${g.score}</td>
                    <td class="p-4 text-center text-gray-500">${g.maxScore}</td>
                    <td class="p-4 text-center font-bold ${color}">${percent}%</td>
                </tr>
            `;
        });

        const totalPercent = Math.round((totalScore / totalMax) * 100);
        content.innerHTML = `
            <div class="bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 p-6 rounded-2xl mb-6 text-center">
                <div class="text-5xl font-black text-green-600 mb-2">${totalPercent}%</div>
                <div class="text-gray-600 dark:text-gray-300">المعدل التراكمي</div>
                <div class="text-sm text-gray-500 mt-2">${totalScore} من ${totalMax} درجة</div>
            </div>
            <table class="w-full text-sm">
                <thead class="bg-gray-100 dark:bg-gray-700">
                    <tr>
                        <th class="p-4 text-right font-bold">المادة</th>
                        <th class="p-4 text-center font-bold">الدرجة</th>
                        <th class="p-4 text-center font-bold">من</th>
                        <th class="p-4 text-center font-bold">النسبة</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } catch (e) {
        console.error('Grades error:', e);
        document.getElementById('my-grades-content').innerHTML = '<p class="text-center text-red-500">فشل تحميل الدرجات</p>';
    }
};

// ============================================================
// 13. ترتيب الطلاب (College Ranking Panel)
// ============================================================
window.openCollegeRankingPanel = async () => {
    const user = auth.currentUser;
    if (!user) return window.showToast?.('يرجى تسجيل الدخول');

    const panel = document.createElement('div');
    panel.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[500] flex items-center justify-center p-4';
    panel.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl animate-slide-up">
            <div class="p-6 bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                <div class="flex justify-between items-center">
                    <h2 class="text-2xl font-black"><i class="fas fa-trophy ml-2"></i>ترتيب الكلية</h2>
                    <button onclick="this.closest('.fixed').remove()" class="w-10 h-10 bg-white/20 rounded-full hover:bg-white/30 transition"><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div id="ranking-content" class="p-6 overflow-y-auto max-h-[60vh]">
                <div class="text-center py-10"><i class="fas fa-spinner fa-spin text-4xl text-yellow-500"></i></div>
            </div>
        </div>
    `;
    document.body.appendChild(panel);
    panel.onclick = (e) => { if (e.target === panel) panel.remove(); };

    try {
        // جلب بيانات المستخدم الحالي
        const myDoc = await getDoc(doc(db, "users", user.uid));
        const myData = myDoc.data() || {};
        const myCollegeId = myData.collegeId;

        if (!myCollegeId) {
            document.getElementById('ranking-content').innerHTML = '<p class="text-center text-gray-500">لم يتم تحديد الكلية</p>';
            return;
        }

        // جلب طلاب نفس الكلية
        const usersSnap = await getDocs(query(collection(db, "users"), where("collegeId", "==", myCollegeId)));
        const students = [];

        for (const u of usersSnap.docs) {
            const userData = u.data();
            // جلب درجات كل طالب
            const gradesSnap = await getDocs(query(collection(db, "final_grades"), where("userId", "==", u.id)));
            let total = 0, max = 0;
            gradesSnap.forEach(g => {
                total += g.data().score;
                max += g.data().maxScore;
            });
            const percent = max > 0 ? Math.round((total / max) * 100) : 0;
            students.push({
                uid: u.id,
                name: userData.displayName || userData.fullName || 'طالب',
                photo: userData.photoURL,
                percent,
                isMe: u.id === user.uid
            });
        }

        // ترتيب حسب النسبة
        students.sort((a, b) => b.percent - a.percent);

        let myRank = 0;
        let rows = students.map((s, i) => {
            if (s.isMe) myRank = i + 1;
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            return `
                <div class="flex items-center gap-4 p-4 ${s.isMe ? 'bg-yellow-100 dark:bg-yellow-900/30 rounded-xl' : 'border-b dark:border-gray-700'}">
                    <div class="text-2xl font-black w-12 text-center">${medal}</div>
                    <img src="${s.photo || 'https://ui-avatars.com/api/?name=' + s.name}" class="w-12 h-12 rounded-full object-cover">
                    <div class="flex-1">
                        <div class="font-bold dark:text-white ${s.isMe ? 'text-yellow-700' : ''}">${s.name} ${s.isMe ? '(أنت)' : ''}</div>
                    </div>
                    <div class="text-xl font-black ${s.percent >= 85 ? 'text-green-600' : s.percent >= 60 ? 'text-yellow-600' : 'text-red-600'}">${s.percent}%</div>
                </div>
            `;
        }).join('');

        document.getElementById('ranking-content').innerHTML = `
            <div class="bg-gradient-to-r from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30 p-6 rounded-2xl mb-6 text-center">
                <div class="text-5xl font-black text-yellow-600 mb-2">#${myRank}</div>
                <div class="text-gray-600 dark:text-gray-300">ترتيبك من ${students.length} طالب</div>
            </div>
            <div class="space-y-2">${rows}</div>
        `;
    } catch (e) {
        console.error('Ranking error:', e);
        document.getElementById('ranking-content').innerHTML = '<p class="text-center text-red-500">فشل تحميل الترتيب</p>';
    }
};

// ============================================================
// 14. تقويم الامتحانات (Exam Calendar Panel)
// ============================================================
window.openExamCalendarPanel = async () => {
    const user = auth.currentUser;
    if (!user) return window.showToast?.('يرجى تسجيل الدخول');

    const panel = document.createElement('div');
    panel.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[500] flex items-center justify-center p-4';
    panel.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl animate-slide-up">
            <div class="p-6 bg-gradient-to-r from-indigo-500 to-pink-500 text-white">
                <div class="flex justify-between items-center">
                    <h2 class="text-2xl font-black"><i class="fas fa-calendar-alt ml-2"></i>تقويم الامتحانات</h2>
                    <button onclick="this.closest('.fixed').remove()" class="w-10 h-10 bg-white/20 rounded-full hover:bg-white/30 transition"><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div id="exam-calendar-content" class="p-6 overflow-y-auto max-h-[60vh]">
                <div class="text-center py-10"><i class="fas fa-spinner fa-spin text-4xl text-indigo-500"></i></div>
            </div>
        </div>
    `;
    document.body.appendChild(panel);
    panel.onclick = (e) => { if (e.target === panel) panel.remove(); };

    try {
        const examsSnap = await getDocs(query(collection(db, "exams"), orderBy("date", "asc")));
        const content = document.getElementById('exam-calendar-content');

        if (examsSnap.empty) {
            content.innerHTML = `
                <div class="text-center py-10 text-gray-500">
                    <i class="fas fa-calendar-times text-5xl mb-4 opacity-50"></i>
                    <p class="font-bold">لا توجد امتحانات مجدولة</p>
                </div>
            `;
            return;
        }

        const now = new Date();
        let rows = '';
        examsSnap.forEach(d => {
            const exam = d.data();
            const examDate = exam.date?.toDate?.() || new Date(exam.date);
            const isPast = examDate < now;
            const isToday = examDate.toDateString() === now.toDateString();
            const daysLeft = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));

            rows += `
                <div class="p-4 rounded-xl mb-3 ${isToday ? 'bg-red-100 dark:bg-red-900/30 border-2 border-red-500' : isPast ? 'bg-gray-100 dark:bg-gray-700 opacity-60' : 'bg-blue-50 dark:bg-indigo-900/20'}">
                    <div class="flex items-center gap-4">
                        <div class="w-16 h-16 bg-white dark:bg-gray-800 rounded-xl flex flex-col items-center justify-center shadow">
                            <span class="text-2xl font-black text-indigo-600">${examDate.getDate()}</span>
                            <span class="text-xs text-gray-500">${examDate.toLocaleDateString('ar-EG', { month: 'short' })}</span>
                        </div>
                        <div class="flex-1">
                            <h4 class="font-bold dark:text-white text-lg">${exam.title}</h4>
                            <p class="text-sm text-gray-500">${exam.subject || ''} ${exam.location ? '• ' + exam.location : ''}</p>
                        </div>
                        <div class="text-right">
                            ${isToday ? '<span class="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">اليوم!</span>' :
                    isPast ? '<span class="text-gray-400 text-sm">انتهى</span>' :
                        `<span class="text-indigo-600 font-bold">بعد ${daysLeft} يوم</span>`}
                        </div>
                    </div>
                </div>
            `;
        });

        content.innerHTML = rows;
    } catch (e) {
        console.error('Exam calendar error:', e);
        document.getElementById('exam-calendar-content').innerHTML = '<p class="text-center text-red-500">فشل تحميل التقويم</p>';
    }
};

// ============================================================
// 📊 لوحة معلومات الطالب (Student Dashboard)
// ============================================================
window.openStudentDashboard = async () => {
    const user = auth.currentUser;
    if (!user) return window.showToast?.('يرجى تسجيل الدخول');

    const panel = document.createElement('div');
    panel.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[500] flex items-center justify-center p-4';
    panel.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl animate-slide-up">
            <div class="p-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-pink-600 text-white">
                <div class="flex justify-between items-center">
                    <h2 class="text-2xl font-black flex items-center gap-2">
                        <i class="fas fa-chart-pie"></i> لوحة المعلومات
                    </h2>
                    <button onclick="this.closest('.fixed').remove()" class="w-10 h-10 bg-white/20 rounded-full hover:bg-white/30 transition">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div id="dashboard-content" class="p-6 overflow-y-auto max-h-[70vh]">
                <div class="text-center py-10"><i class="fas fa-spinner fa-spin text-4xl text-blue-600"></i></div>
            </div>
        </div>
    `;
    document.body.appendChild(panel);
    panel.onclick = (e) => { if (e.target === panel) panel.remove(); };

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};

        // جلب الدرجات
        const gradesSnap = await getDocs(query(collection(db, "final_grades"), where("userId", "==", user.uid)));
        let totalScore = 0, totalMax = 0, gradeCount = 0;
        gradesSnap.forEach(d => {
            const g = d.data();
            totalScore += g.score;
            totalMax += g.maxScore;
            gradeCount++;
        });
        const avgPercent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

        // جلب الـ XP
        const scoresSnap = await getDocs(query(collection(db, "user_scores"), where("userId", "==", user.uid)));
        let xp = 0;
        scoresSnap.forEach(d => xp += d.data().score || 0);

        const content = document.getElementById('dashboard-content');
        content.innerHTML = `
            <!-- الإحصائيات السريعة -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div class="bg-gradient-to-br from-green-400 to-green-600 text-white p-4 rounded-2xl text-center shadow-lg">
                    <div class="text-3xl font-black">${userData.currentStreak || 0}</div>
                    <div class="text-xs opacity-80 mt-1">🔥 أيام متتالية</div>
                </div>
                <div class="bg-gradient-to-br from-blue-400 to-blue-600 text-white p-4 rounded-2xl text-center shadow-lg">
                    <div class="text-3xl font-black">${xp}</div>
                    <div class="text-xs opacity-80 mt-1">⭐ نقاط XP</div>
                </div>
                <div class="bg-gradient-to-br from-indigo-400 to-indigo-600 text-white p-4 rounded-2xl text-center shadow-lg">
                    <div class="text-3xl font-black">${gradeCount}</div>
                    <div class="text-xs opacity-80 mt-1">📊 مواد</div>
                </div>
                <div class="bg-gradient-to-br from-orange-400 to-orange-600 text-white p-4 rounded-2xl text-center shadow-lg">
                    <div class="text-3xl font-black">${avgPercent}%</div>
                    <div class="text-xs opacity-80 mt-1">📈 المعدل</div>
                </div>
            </div>
            
            <!-- أزرار سريعة -->
            <h3 class="font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                <i class="fas fa-bolt text-yellow-500"></i> وصول سريع
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <button onclick="this.closest('.fixed').remove(); window.openMyGradesPanel?.()" class="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 p-4 rounded-xl font-bold text-sm hover:scale-105 transition flex flex-col items-center gap-2">
                    <i class="fas fa-chart-line text-2xl"></i>
                    درجاتي
                </button>
                <button onclick="this.closest('.fixed').remove(); window.openExamCalendar?.()" class="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 p-4 rounded-xl font-bold text-sm hover:scale-105 transition flex flex-col items-center gap-2">
                    <i class="fas fa-calendar-alt text-2xl"></i>
                    تقويم الامتحانات
                </button>
                <button onclick="this.closest('.fixed').remove(); window.openBookmarksPanel?.()" class="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 p-4 rounded-xl font-bold text-sm hover:scale-105 transition flex flex-col items-center gap-2">
                    <i class="fas fa-bookmark text-2xl"></i>
                    المحفوظات
                </button>
                <button onclick="this.closest('.fixed').remove(); window.openNotesPanel?.()" class="bg-blue-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-blue-300 p-4 rounded-xl font-bold text-sm hover:scale-105 transition flex flex-col items-center gap-2">
                    <i class="fas fa-sticky-note text-2xl"></i>
                    ملاحظاتي
                </button>
            </div>
            
            <!-- نصائح -->
            <div class="bg-gradient-to-r from-blue-50 to-blue-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 rounded-2xl border border-blue-200 dark:border-blue-800">
                <h4 class="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                    <i class="fas fa-lightbulb"></i> نصيحة اليوم
                </h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                    ${getRandomTip()}
                </p>
            </div>
        `;
    } catch (e) {
        console.error('Dashboard error:', e);
        document.getElementById('dashboard-content').innerHTML = '<p class="text-center text-red-500 py-8">فشل تحميل البيانات</p>';
    }
};

// نصائح عشوائية
function getRandomTip() {
    const tips = [
        "📚 خصص 25 دقيقة للمذاكرة ثم استرح 5 دقائق (تقنية بومودورو).",
        "💡 المراجعة المتكررة أفضل من المذاكرة المكثفة قبل الامتحان.",
        "🎯 حدد أهداف صغيرة يومية بدلاً من أهداف كبيرة أسبوعية.",
        "😴 النوم الجيد يساعد على تثبيت المعلومات في الذاكرة.",
        "✍️ الكتابة بخط اليد تساعد على الحفظ أكثر من الكتابة على الكمبيوتر.",
        "🏃 الرياضة تحسن التركيز والقدرة على الاستيعاب.",
        "📖 اشرح ما تعلمته لشخص آخر لتختبر فهمك.",
        "🎧 بعض الناس يركزون أفضل مع موسيقى هادئة."
    ];
    return tips[Math.floor(Math.random() * tips.length)];
}

export default {
    updateStreak,
    renderStreakWidget,
    toggleBookmark,
    getBookmarks,
    isBookmarked,
    saveNote,
    getNote,
    getAllNotes,
    setWeeklyGoal,
    updateGoalProgress,
    renderStatsWidget,
    renderCalendarWidget
};
