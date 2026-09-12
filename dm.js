// ============================================================
// dm.js - نظام الرسائل الخاصة (Private Messages / DM)
// ============================================================

import { db, auth } from './firebase.js';
import { uploadToCloudinary } from './cms.js';
import {
    collection, addDoc, query, orderBy, onSnapshot, doc, setDoc,
    getDocs, serverTimestamp, where, getDoc, updateDoc, limit, deleteDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

let currentDMUnsubscribe = null;
let currentDMUserId = null;
let dmListUnsubscribe = null;
let dmNotifUnsubscribe = null;

// ============================================================
// 1. تهيئة نظام الرسائل الخاصة
// ============================================================
export const setupDMSystem = () => {
    const user = auth.currentUser;
    if (!user) return;

    createDMButton();
    listenForDMNotifications(user.uid);
};

// إنشاء زر الرسائل الخاصة - الآن في القائمة الجانبية
const createDMButton = () => {
    // الزر الآن في sidebar بدلاً من زر عائم
    // فقط نتأكد من تحديث البادج في الـ sidebar
};

// ============================================================
// 2. لوحة الرسائل الخاصة
// ============================================================
window.openDMPanel = () => {
    // إزالة اللوحة القديمة
    document.getElementById('dm-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'dm-panel';
    panel.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[400] flex items-center justify-center p-4 animate-fade-in';

    panel.innerHTML = `
        <div class="bg-white dark:bg-gray-800 w-full max-w-2xl h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <!-- Header -->
            <div class="bg-gradient-to-r from-indigo-600 to-pink-600 p-4 text-white flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <i class="fas fa-comments text-2xl"></i>
                    <div>
                        <h3 class="font-bold text-lg">الرسائل الخاصة</h3>
                        <p class="text-xs opacity-80">تواصل مع زملائك</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="window.openNewDM()" class="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm font-bold transition">
                        <i class="fas fa-plus ml-1"></i> محادثة جديدة
                    </button>
                    <button onclick="document.getElementById('dm-panel').remove()" class="hover:bg-white/20 p-2 rounded-lg transition">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <!-- Content -->
            <div class="flex-1 flex overflow-hidden">
                <!-- Conversations List -->
                <div id="dm-list" class="w-1/3 border-l dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-900">
                    <div class="p-4 text-center text-gray-400">
                        <i class="fas fa-spinner fa-spin"></i>
                    </div>
                </div>
                
                <!-- Chat Area -->
                <div id="dm-chat-area" class="flex-1 flex flex-col">
                    <div class="flex-1 flex items-center justify-center text-gray-400">
                        <div class="text-center">
                            <i class="fas fa-inbox text-5xl mb-4 opacity-40"></i>
                            <p>اختر محادثة للبدء</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(panel);
    panel.onclick = (e) => { if (e.target === panel) panel.remove(); };

    loadDMConversations();
};

// ============================================================
// 3. تحميل قائمة المحادثات
// ============================================================
const loadDMConversations = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const list = document.getElementById('dm-list');

    const q = query(
        collection(db, "dm_chats"),
        where("participants", "array-contains", user.uid),
        orderBy("lastUpdated", "desc"),
        limit(50)
    );

    if (dmListUnsubscribe) dmListUnsubscribe();

    dmListUnsubscribe = onSnapshot(q, async (snap) => {
        if (snap.empty) {
            list.innerHTML = `
                <div class="p-8 text-center text-gray-400">
                    <i class="fas fa-comments text-4xl mb-3 opacity-40"></i>
                    <p class="text-sm">لا توجد محادثات بعد</p>
                    <button onclick="window.openNewDM()" class="mt-4 text-indigo-600 font-bold text-sm hover:underline">
                        ابدأ محادثة جديدة
                    </button>
                </div>
            `;
            return;
        }

        list.innerHTML = '';

        for (const d of snap.docs) {
            const chat = d.data();
            const otherId = chat.participants.find(id => id !== user.uid);

            // جلب معلومات المستخدم الآخر
            let otherUser = { displayName: 'مستخدم', photoURL: null };
            try {
                const userDoc = await getDoc(doc(db, "users", otherId));
                if (userDoc.exists()) otherUser = userDoc.data();
            } catch (e) { }

            const hasUnread = chat.unreadBy?.includes(user.uid);
            const time = chat.lastUpdated?.toDate?.();
            const timeStr = time ? (
                time.getDate() === new Date().getDate()
                    ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : time.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
            ) : '';

            list.innerHTML += `
                <div onclick="window.openDMChat('${d.id}', '${otherId}')" class="p-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition ${currentDMUserId === otherId ? 'bg-blue-50 dark:bg-indigo-900/20' : ''}">
                    <div class="flex items-center gap-3">
                        <div class="relative">
                            <img src="${otherUser.photoURL || `https://ui-avatars.com/api/?name=${otherUser.displayName}&background=random`}" class="w-10 h-10 rounded-full object-cover">
                            ${hasUnread ? '<span class="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-900"></span>' : ''}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between items-center">
                                <span class="font-bold text-sm dark:text-white truncate">${otherUser.displayName || 'مستخدم'}</span>
                                <span class="text-[10px] text-gray-400">${timeStr}</span>
                            </div>
                            <p class="text-xs text-gray-500 dark:text-gray-400 truncate ${hasUnread ? 'font-bold' : ''}">${chat.lastMessage || '...'}</p>
                        </div>
                    </div>
                </div>
            `;
        }
    });
};

// ============================================================
// 4. فتح محادثة معينة
// ============================================================
window.openDMChat = async (chatId, otherId) => {
    const user = auth.currentUser;
    if (!user) return;

    currentDMUserId = otherId;

    // جلب معلومات الطرف الآخر
    let otherUser = { displayName: 'مستخدم', photoURL: null };
    try {
        const userDoc = await getDoc(doc(db, "users", otherId));
        if (userDoc.exists()) otherUser = userDoc.data();
    } catch (e) { }

    const area = document.getElementById('dm-chat-area');
    area.innerHTML = `
        <!-- Header -->
        <div class="p-3 border-b dark:border-gray-700 flex items-center gap-3 bg-gradient-to-r from-blue-50 to-pink-50 dark:from-indigo-900/20 dark:to-pink-900/20">
            <img src="${otherUser.photoURL || `https://ui-avatars.com/api/?name=${otherUser.displayName}&background=random`}" 
                 onclick="window.openUserProfile('${otherId}')" 
                 class="w-12 h-12 rounded-full object-cover ring-2 ring-blue-300 dark:ring-indigo-700 cursor-pointer hover:scale-105 transition">
            <div class="flex-1 cursor-pointer" onclick="window.openUserProfile('${otherId}')">
                <h4 class="font-bold dark:text-white flex items-center gap-2 hover:text-indigo-600 transition">
                    ${otherUser.displayName || 'مستخدم'}
                    ${otherUser.isVerified ? '<i class="fas fa-check-circle text-blue-500 text-sm"></i>' : ''}
                </h4>
                <span class="text-xs text-gray-500 dark:text-gray-400">اضغط لعرض البروفايل</span>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="window.deleteDMConversation('${chatId}')" class="w-9 h-9 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 flex items-center justify-center transition text-red-500" title="حذف المحادثة">
                    <i class="fas fa-trash"></i>
                </button>
                <button onclick="document.getElementById('dm-chat-area').innerHTML='<div class=\\'text-center p-10 text-gray-400\\'><i class=\\'fas fa-comments text-4xl mb-3\\'></i><br>اختر محادثة لعرضها</div>'" class="w-9 h-9 rounded-full hover:bg-white/50 dark:hover:bg-gray-700 flex items-center justify-center transition text-gray-500">
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        </div>
        
        <!-- Messages -->
        <div id="dm-messages" class="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-900">
            <div class="text-center text-gray-400"><i class="fas fa-spinner fa-spin"></i></div>
        </div>
        
        <!-- Reply Preview Bar -->
        <div id="dm-reply-bar" class="hidden px-4 py-2 bg-blue-50 dark:bg-indigo-900/30 border-t dark:border-gray-700 flex items-center gap-3">
            <div class="flex-1">
                <span class="text-xs text-indigo-600 dark:text-indigo-400 font-bold"><i class="fas fa-reply"></i> رد على:</span>
                <p id="dm-reply-text" class="text-sm text-gray-700 dark:text-gray-300 truncate"></p>
            </div>
            <button onclick="window.cancelDMReply()" class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 transition">
                <i class="fas fa-times text-gray-500 dark:text-gray-400"></i>
            </button>
        </div>
        
        <!-- Image Preview -->
        <div id="dm-image-preview" class="hidden px-4 py-2 bg-blue-50 dark:bg-blue-900/30 border-t dark:border-gray-700">
            <div class="flex items-center gap-3">
                <img id="dm-preview-img" src="" class="w-16 h-16 rounded-lg object-cover">
                <div class="flex-1 text-sm text-gray-600 dark:text-gray-300">صورة جاهزة للإرسال</div>
                <button onclick="window.cancelDMImage()" class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 transition">
                    <i class="fas fa-times text-gray-500 dark:text-gray-400"></i>
                </button>
            </div>
        </div>
        
        <!-- Voice Recording Preview -->
        <div id="dm-voice-preview" class="hidden px-4 py-2 bg-red-50 dark:bg-red-900/30 border-t dark:border-gray-700">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                    <i class="fas fa-microphone text-white"></i>
                </div>
                <div class="flex-1">
                    <p class="text-sm font-bold text-red-600 dark:text-red-400">جاري التسجيل...</p>
                    <p id="dm-recording-time" class="text-xs text-gray-500">0:00</p>
                </div>
                <button onclick="window.cancelVoiceRecording()" class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 transition">
                    <i class="fas fa-times text-gray-500 dark:text-gray-400"></i>
                </button>
                <button onclick="window.sendVoiceMessage('${chatId}')" class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-600 transition">
                    <i class="fas fa-paper-plane text-white text-xs"></i>
                </button>
            </div>
        </div>
        
        <!-- Input -->
        <div class="p-3 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
            <div class="flex gap-2 items-center">
                <!-- Image Upload Button -->
                <label class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition text-gray-500 dark:text-gray-400">
                    <i class="fas fa-image"></i>
                    <input type="file" id="dm-image-input" accept="image/*" class="hidden" onchange="window.handleDMImage(this)">
                </label>
                
                <!-- Voice Message Button -->
                <button id="dm-voice-btn" onclick="window.toggleVoiceRecording('${chatId}')" class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/50 transition text-gray-500 dark:text-gray-400">
                    <i class="fas fa-microphone"></i>
                </button>
                
                <!-- Video Call Button (Jitsi) -->
                <button onclick="window.startVideoCall('${chatId}', '${otherId}')" class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/50 transition text-blue-500" title="مكالمة فيديو">
                    <i class="fas fa-video"></i>
                </button>
                
                <!-- Emoji Picker Button -->
                <div class="relative">
                    <button onclick="document.getElementById('dm-emoji-picker').classList.toggle('hidden')" class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition text-yellow-500">
                        😊
                    </button>
                    <div id="dm-emoji-picker" class="hidden absolute bottom-12 right-0 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-3 z-50 border dark:border-gray-700 min-w-[220px]">
                        <div class="grid grid-cols-6 gap-1">
                            ${['❤️', '😂', '😍', '👍', '🔥', '😮', '😢', '👏', '🙏', '💯', '🎉', '😊'].map(e =>
        `<button onclick="window.insertDMEmoji('${e}')" class="w-8 h-8 text-xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition flex items-center justify-center">${e}</button>`
    ).join('')}
                        </div>
                    </div>
                </div>
                
                <!-- Text Input -->
                <input type="text" id="dm-input" placeholder="اكتب رسالتك..." class="flex-1 p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm focus:outline-none dark:text-white focus:ring-2 focus:ring-indigo-500 transition">
                
                <!-- Send Button -->
                <button onclick="window.sendDM('${chatId}')" class="bg-gradient-to-r from-indigo-600 to-pink-600 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:shadow-lg hover:scale-105 transition shadow-indigo-500/30">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `;

    document.getElementById('dm-input').onkeypress = (e) => { if (e.key === 'Enter') window.sendDM(chatId); };

    // تحميل الرسائل
    loadDMMessages(chatId);

    // إزالة علامة غير مقروء
    try {
        const chatDoc = await getDoc(doc(db, "dm_chats", chatId));
        if (chatDoc.exists()) {
            const chatData = chatDoc.data();
            await updateDoc(doc(db, "dm_chats", chatId), {
                unreadBy: (chatData.unreadBy || []).filter(id => id !== user.uid)
            });
        }
    } catch (e) { }
};

// ============================================================
// 5. تحميل الرسائل
// ============================================================
const loadDMMessages = (chatId) => {
    if (currentDMUnsubscribe) currentDMUnsubscribe();

    const container = document.getElementById('dm-messages');
    const q = query(collection(db, "dm_chats", chatId, "messages"), orderBy("createdAt", "asc"));

    currentDMUnsubscribe = onSnapshot(q, (snap) => {
        container.innerHTML = '';

        if (snap.empty) {
            container.innerHTML = '<div class="text-center text-gray-400 text-sm">ابدأ المحادثة...</div>';
            return;
        }

        const user = auth.currentUser;
        snap.forEach(d => {
            const msg = { id: d.id, ...d.data() };
            const isMe = msg.senderId === user.uid;

            // Reply reference
            let replyHtml = '';
            if (msg.replyTo) {
                replyHtml = `<div class="text-xs opacity-70 border-r-2 border-blue-300 pr-2 mb-1 truncate">رد على: ${window.sanitizeHTML?.(msg.replyToText) || '...'}</div>`;
            }

            // Reactions display
            let reactionsHtml = '';
            if (msg.reactions && Object.keys(msg.reactions).length > 0) {
                reactionsHtml = '<div class="flex flex-wrap gap-1 mt-1">';
                for (const [emoji, users] of Object.entries(msg.reactions)) {
                    const count = users.length;
                    const isMine = users.includes(user.uid);
                    reactionsHtml += `<button onclick="window.addDMReaction('${chatId}', '${msg.id}', '${emoji}')" class="text-xs px-1 py-0.5 rounded-full ${isMine ? 'bg-blue-200 dark:bg-indigo-800' : 'bg-gray-200 dark:bg-gray-600'} hover:scale-110 transition">${emoji} ${count}</button>`;
                }
                reactionsHtml += '</div>';
            }

            // Message controls
            const controlsHtml = `
                <div class="hidden group-hover:flex items-center gap-1 absolute ${isMe ? 'left-0 -translate-x-full pl-2' : 'right-0 translate-x-full pr-2'} top-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-full shadow-lg p-1 border dark:border-gray-700">
                    <button onclick="window.replyToDM('${msg.id}', '${(msg.text || '').substring(0, 30).replace(/'/g, '')}')" class="text-xs bg-gray-100 dark:bg-gray-700 rounded-full w-7 h-7 flex items-center justify-center hover:bg-blue-100 dark:hover:bg-indigo-900/50 transition" title="رد"><i class="fas fa-reply text-[10px] text-indigo-500"></i></button>
                    <div class="relative reaction-picker-wrapper">
                        <button onclick="this.nextElementSibling.classList.toggle('hidden')" class="text-xs bg-gray-100 dark:bg-gray-700 rounded-full w-7 h-7 flex items-center justify-center hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition" title="تفاعل">😊</button>
                        <div class="hidden absolute bottom-8 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-2 z-50 border dark:border-gray-700 flex gap-1">
                            ${['❤️', '😂', '😍', '👍', '🔥', '😮'].map(e =>
                `<button onclick="window.addDMReaction('${chatId}', '${msg.id}', '${e}'); this.closest('.reaction-picker-wrapper').querySelector('div').classList.add('hidden')" class="w-7 h-7 text-lg hover:scale-125 transition">${e}</button>`
            ).join('')}
                        </div>
                    </div>
                    ${isMe ? `<button onclick="window.editDMMessage('${chatId}', '${msg.id}', '${(msg.text || '').replace(/'/g, "\\'")}')" class="text-xs bg-gray-100 dark:bg-gray-700 rounded-full w-7 h-7 flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/50 transition" title="تعديل"><i class="fas fa-pen text-[10px] text-blue-500"></i></button>` : ''}
                    ${isMe ? `<button onclick="window.deleteDMMessage('${chatId}', '${msg.id}')" class="text-xs bg-gray-100 dark:bg-gray-700 rounded-full w-7 h-7 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/50 transition" title="حذف"><i class="fas fa-trash text-[10px] text-red-500"></i></button>` : ''}
                </div>
            `;

            container.innerHTML += `
                <div class="flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in group relative mb-3">
                    <div class="max-w-[70%] px-4 py-2 rounded-2xl text-sm relative ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-100 dark:bg-gray-700 dark:text-white rounded-bl-none'}">
                        ${replyHtml}
                        ${msg.imageUrl ? `<img src="${msg.imageUrl}" loading="lazy" class="max-w-[200px] rounded-lg mb-2 cursor-pointer" onclick="window.open('${msg.imageUrl}')">` : ''}
                        ${msg.voiceUrl ? `
                            <div class="flex items-center gap-2 bg-white/20 dark:bg-black/20 rounded-xl p-2 my-1">
                                <button onclick="this.nextElementSibling.paused ? this.nextElementSibling.play() : this.nextElementSibling.pause(); this.querySelector('i').classList.toggle('fa-play'); this.querySelector('i').classList.toggle('fa-pause')" class="w-8 h-8 bg-white/30 rounded-full flex items-center justify-center hover:bg-white/50 transition">
                                    <i class="fas fa-play text-xs"></i>
                                </button>
                                <audio src="${msg.voiceUrl}" class="hidden" onended="this.previousElementSibling.querySelector('i').classList.remove('fa-pause'); this.previousElementSibling.querySelector('i').classList.add('fa-play')"></audio>
                                <div class="flex-1">
                                    <div class="h-1 bg-white/30 rounded-full overflow-hidden">
                                        <div class="h-full bg-white/70 rounded-full" style="width: 0%"></div>
                                    </div>
                                    <p class="text-[10px] opacity-70 mt-1">🎤 ${msg.voiceDuration || 0}s</p>
                                </div>
                            </div>
                        ` : ''}
                        ${msg.text ? `<p class="whitespace-pre-wrap">${window.sanitizeHTML?.(msg.text) || msg.text}</p>` : ''}
                        <div class="text-[9px] ${isMe ? 'text-blue-200' : 'text-gray-400'} text-right mt-1">
                            ${msg.createdAt?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '...'}
                            ${msg.edited ? ' (معدل)' : ''}
                        </div>
                        ${reactionsHtml}
                    </div>
                    ${controlsHtml}
                </div>
            `;
        });

        container.scrollTop = container.scrollHeight;
    });
};

// ============================================================
// 6. إرسال رسالة
// ============================================================

// متغير للصورة المحددة
let dmSelectedImage = null;

window.sendDM = async (chatId) => {
    const user = auth.currentUser;
    if (!user) return;

    const input = document.getElementById('dm-input');
    const text = input.value.trim();

    // يجب أن يكون هناك نص أو صورة
    if (!text && !dmSelectedImage) return;

    input.value = '';

    try {
        // إعداد بيانات الرسالة
        const messageData = {
            senderId: user.uid,
            createdAt: serverTimestamp()
        };

        if (text) messageData.text = text;

        // إذا كان هناك رد
        if (dmReplyingTo) {
            messageData.replyTo = dmReplyingTo.id;
            messageData.replyToText = dmReplyingTo.text;
            window.cancelDMReply();
        }

        // إذا كان هناك صورة
        if (dmSelectedImage) {
            const sendBtn = document.querySelector('[onclick*="sendDM"]');
            if (sendBtn) {
                sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                sendBtn.disabled = true;
            }

            // رفع الصورة إلى Cloudinary
            const imageUrl = await window.uploadToCloudinary?.(dmSelectedImage);
            if (imageUrl) {
                messageData.imageUrl = imageUrl;
            }

            window.cancelDMImage();

            if (sendBtn) {
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
                sendBtn.disabled = false;
            }
        }

        await addDoc(collection(db, "dm_chats", chatId, "messages"), messageData);

        // تحديث المحادثة
        await updateDoc(doc(db, "dm_chats", chatId), {
            lastMessage: messageData.imageUrl ? '📷 صورة' : text,
            lastUpdated: serverTimestamp(),
            unreadBy: [currentDMUserId]
        });

    } catch (e) {
        console.error(e);
        window.showToast?.('فشل الإرسال', 'error');
    }
};

// معالجة اختيار صورة
window.handleDMImage = (input) => {
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    dmSelectedImage = file;

    // عرض preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('dm-preview-img').src = e.target.result;
        document.getElementById('dm-image-preview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
};

// إلغاء الصورة
window.cancelDMImage = () => {
    dmSelectedImage = null;
    document.getElementById('dm-image-preview')?.classList.add('hidden');
    const imageInput = document.getElementById('dm-image-input');
    if (imageInput) imageInput.value = '';
};

// إدخال إيموجي
window.insertDMEmoji = (emoji) => {
    const input = document.getElementById('dm-input');
    if (input) {
        input.value += emoji;
        input.focus();
    }
    document.getElementById('dm-emoji-picker')?.classList.add('hidden');
};

// ============================================================
// 7. بدء محادثة جديدة
// ============================================================
window.openNewDM = async () => {
    const searchTerm = prompt('أدخل اسم أو إيميل المستخدم:');
    if (!searchTerm || searchTerm.length < 2) return;

    try {
        const snap = await getDocs(query(collection(db, "users"), limit(200)));
        const results = [];

        snap.forEach(d => {
            const u = d.data();
            const name = u.displayName?.toLowerCase() || '';
            const email = u.email?.toLowerCase() || '';
            if (name.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase())) {
                if (d.id !== auth.currentUser.uid) {
                    results.push({ id: d.id, ...u });
                }
            }
        });

        if (results.length === 0) {
            window.showToast?.('لم يتم العثور على مستخدمين');
            return;
        }

        // عرض نتائج البحث
        const user = results[0]; // أول نتيجة
        if (confirm(`بدء محادثة مع ${user.displayName}؟`)) {
            await startDMWith(user.id);
        }

    } catch (e) {
        console.error(e);
        window.showToast?.('خطأ في البحث');
    }
};

// بدء محادثة مع مستخدم
window.startDMWith = async (otherId) => {
    const user = auth.currentUser;
    if (!user || otherId === user.uid) return;

    // فحص الحظر - هل الشخص التاني حاظرني؟ (الأونر معفي من الحظر)
    try {
        const { SUPER_ADMIN_EMAIL } = await import('./firebase.js');

        // التحقق من التوثيق - فقط الموثقين يقدروا يراسلوا (الأونر معفي)
        if (user.email !== SUPER_ADMIN_EMAIL) {
            const myDoc = await getDoc(doc(db, "users", user.uid));
            if (!myDoc.exists() || myDoc.data().isVerified !== true) {
                return window.showToast?.('⚠️ يجب توثيق حسابك أولاً لتتمكن من المراسلة.\n\nقم برفع صورة الكارنيه من صفحة الملف الشخصي.');
            }
        }

        // SUPER_ADMIN bypass - الأونر يقدر يراسل أي حد
        if (user.email !== SUPER_ADMIN_EMAIL) {
            const otherUserDoc = await getDoc(doc(db, "users", otherId));
            const otherData = otherUserDoc.data() || {};
            if ((otherData.blockedUsers || []).includes(user.uid)) {
                return window.showToast?.('لا يمكنك مراسلة هذا المستخدم');
            }

            // هل أنا حاظره؟
            const myDoc = await getDoc(doc(db, "users", user.uid));
            const myData = myDoc.data() || {};
            if ((myData.blockedUsers || []).includes(otherId)) {
                return window.showToast?.('لقد قمت بحظر هذا المستخدم. قم بإلغاء الحظر أولاً');
            }
        }
    } catch (e) {
        console.log('Block check error:', e);
    }

    // التحقق من وجود محادثة مسبقة
    const participants = [user.uid, otherId].sort();
    const chatId = participants.join('_');

    const existingChat = await getDoc(doc(db, "dm_chats", chatId));

    if (!existingChat.exists()) {
        // إنشاء محادثة جديدة
        await setDoc(doc(db, "dm_chats", chatId), {
            participants,
            createdAt: serverTimestamp(),
            lastUpdated: serverTimestamp(),
            lastMessage: '',
            unreadBy: []
        });
    }

    // فتح المحادثة
    openDMPanel();
    setTimeout(() => window.openDMChat(chatId, otherId), 500);
};

// alias للاستخدام من البروفايل
window.openDirectMessage = (uid, name, photo) => {
    window.startDMWith(uid);
};

// حذف المحادثة بالكامل
window.deleteDMConversation = async (chatId) => {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذه المحادثة؟\n\nسيتم حذف جميع الرسائل نهائياً!')) return;

    try {
        // حذف جميع الرسائل أولاً
        const msgsSnap = await getDocs(collection(db, "dm_chats", chatId, "messages"));
        for (const m of msgsSnap.docs) {
            await deleteDoc(m.ref);
        }

        // حذف المحادثة نفسها
        await deleteDoc(doc(db, "dm_chats", chatId));

        window.showToast?.('✅ تم حذف المحادثة بنجاح', 'success');

        // إعادة تحميل القائمة
        document.getElementById('dm-chat-area').innerHTML = '<div class="flex-1 flex items-center justify-center text-gray-400"><div class="text-center"><i class="fas fa-inbox text-5xl mb-4 opacity-40"></i><p>تم حذف المحادثة</p></div></div>';
        loadDMConversations();
    } catch (e) {
        console.error('Delete DM error:', e);
        window.showToast?.('فشل حذف المحادثة', 'error');
    }
};

// ============================================================
const listenForDMNotifications = (uid) => {
    if (dmNotifUnsubscribe) dmNotifUnsubscribe();

    const q = query(
        collection(db, "dm_chats"),
        where("participants", "array-contains", uid)
    );

    dmNotifUnsubscribe = onSnapshot(q, (snap) => {
        // فلترة محلية للرسائل غير المقروءة
        let unreadCount = 0;
        snap.forEach(d => {
            const data = d.data();
            if (data.unreadBy?.includes(uid)) unreadCount++;
        });

        const badge = document.getElementById('dm-badge');
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        // تحديث بادج الـ sidebar أيضاً
        const sidebarBadge = document.getElementById('dm-badge-sidebar');
        if (sidebarBadge) {
            if (unreadCount > 0) {
                sidebarBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                sidebarBadge.classList.remove('hidden');
            } else {
                sidebarBadge.classList.add('hidden');
            }
        }
    });
};

// ============================================================
// 9. دوال التفاعل مع الرسائل
// ============================================================

// متغيرات للرد
let dmReplyingTo = null;

// رد على رسالة
window.replyToDM = (msgId, text) => {
    dmReplyingTo = { id: msgId, text };

    // إظهار شريط الرد
    const replyBar = document.getElementById('dm-reply-bar');
    const replyText = document.getElementById('dm-reply-text');

    if (replyBar && replyText) {
        replyText.textContent = text || '...';
        replyBar.classList.remove('hidden');
    }

    const input = document.getElementById('dm-input');
    if (input) {
        input.focus();
    }
};

// إلغاء الرد
window.cancelDMReply = () => {
    dmReplyingTo = null;
    const replyBar = document.getElementById('dm-reply-bar');
    if (replyBar) {
        replyBar.classList.add('hidden');
    }
    const input = document.getElementById('dm-input');
    if (input) {
        input.placeholder = 'اكتب رسالتك...';
    }
};

// إضافة reaction
window.addDMReaction = async (chatId, msgId, emoji) => {
    const user = auth.currentUser;
    if (!user) return;

    const msgRef = doc(db, "dm_chats", chatId, "messages", msgId);
    const msgDoc = await getDoc(msgRef);

    if (!msgDoc.exists()) return;

    const reactions = msgDoc.data().reactions || {};
    const userReactions = reactions[emoji] || [];

    if (userReactions.includes(user.uid)) {
        const newList = userReactions.filter(id => id !== user.uid);
        if (newList.length === 0) {
            delete reactions[emoji];
        } else {
            reactions[emoji] = newList;
        }
    } else {
        reactions[emoji] = [...userReactions, user.uid];
    }

    await updateDoc(msgRef, { reactions });
};

// تعديل رسالة
window.editDMMessage = async (chatId, msgId, currentText) => {
    const newText = prompt('تعديل الرسالة:', currentText);
    if (newText && newText !== currentText) {
        await updateDoc(doc(db, "dm_chats", chatId, "messages", msgId), {
            text: newText,
            edited: true
        });
    }
};

// حذف رسالة
window.deleteDMMessage = async (chatId, msgId) => {
    if (confirm('حذف هذه الرسالة؟')) {
        await deleteDoc(doc(db, "dm_chats", chatId, "messages", msgId));
    }
};

// ============================================================
// 10. Admin: مراسلة أي مستخدم
// ============================================================
window.adminMessageUser = async (userId, userName) => {
    const user = auth.currentUser;
    if (!user) return;

    await window.startDMWith(userId);
    window.showToast?.(`تم فتح محادثة مع ${userName}`, 'success');
};

// ============================================================
// 11. الرسائل الصوتية (Voice Messages)
// ============================================================
let mediaRecorder = null;
let audioChunks = [];
let recordingInterval = null;
let recordingStartTime = null;
let currentRecordingChatId = null;

window.toggleVoiceRecording = async (chatId) => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        // إيقاف التسجيل
        mediaRecorder.stop();
        return;
    }

    // بدء التسجيل
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];
        currentRecordingChatId = chatId;

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            clearInterval(recordingInterval);
            stream.getTracks().forEach(track => track.stop());

            // إخفاء preview
            document.getElementById('dm-voice-preview')?.classList.add('hidden');

            // إعادة زر الميكروفون للوضع الطبيعي
            const voiceBtn = document.getElementById('dm-voice-btn');
            if (voiceBtn) {
                voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                voiceBtn.classList.remove('bg-red-500', 'text-white');
                voiceBtn.classList.add('bg-gray-100', 'dark:bg-gray-700', 'text-gray-500');
            }

            // إرسال الرسالة الصوتية تلقائياً
            if (audioChunks.length > 0 && currentRecordingChatId) {
                try {
                    window.showToast?.('جاري رفع الرسالة الصوتية...', 'info');

                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

                    // رفع للـ Cloudinary
                    const formData = new FormData();
                    formData.append('file', audioBlob, 'voice.webm');
                    formData.append('upload_preset', 'ml_default');
                    formData.append('resource_type', 'video');

                    const res = await fetch('https://api.cloudinary.com/v1_1/dsdldwwhx/upload', {
                        method: 'POST',
                        body: formData
                    });

                    const data = await res.json();

                    if (data.secure_url) {
                        const user = auth.currentUser;
                        if (user) {
                            await addDoc(collection(db, "dm_chats", currentRecordingChatId, "messages"), {
                                senderId: user.uid,
                                voiceUrl: data.secure_url,
                                voiceDuration: Math.floor((Date.now() - recordingStartTime) / 1000),
                                createdAt: serverTimestamp()
                            });

                            await updateDoc(doc(db, "dm_chats", currentRecordingChatId), {
                                lastMessage: '🎤 رسالة صوتية',
                                lastUpdated: serverTimestamp(),
                                unreadBy: [currentDMUserId]
                            });

                            window.showToast?.('✅ تم إرسال الرسالة الصوتية', 'success');
                        }
                    }
                    audioChunks = [];
                } catch (e) {
                    console.error('Voice upload error:', e);
                    window.showToast?.('فشل رفع الرسالة الصوتية', 'error');
                }
            }
        };

        mediaRecorder.start();
        recordingStartTime = Date.now();

        // تحديث UI
        document.getElementById('dm-voice-preview')?.classList.remove('hidden');
        const voiceBtn = document.getElementById('dm-voice-btn');
        if (voiceBtn) {
            voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
            voiceBtn.classList.remove('bg-gray-100', 'dark:bg-gray-700', 'text-gray-500');
            voiceBtn.classList.add('bg-red-500', 'text-white');
        }

        // عداد الوقت
        recordingInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const timeEl = document.getElementById('dm-recording-time');
            if (timeEl) timeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);

    } catch (e) {
        console.error('Voice recording error:', e);
        window.showToast?.('لا يمكن الوصول للميكروفون. تأكد من إعطاء الصلاحية.');
    }
};

window.cancelVoiceRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    if (recordingInterval) {
        clearInterval(recordingInterval);
        recordingInterval = null;
    }
    audioChunks = [];
    document.getElementById('dm-voice-preview')?.classList.add('hidden');
};

window.sendVoiceMessage = async (chatId) => {
    if (audioChunks.length === 0) return;

    const user = auth.currentUser;
    if (!user) return;

    // إيقاف التسجيل أولاً
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }

    // انتظار الـ stop event
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        window.showToast?.('جاري رفع الرسالة الصوتية...', 'info');

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

        // رفع للـ Cloudinary
        const formData = new FormData();
        formData.append('file', audioBlob, 'voice.webm');
        formData.append('upload_preset', 'ml_default');
        formData.append('resource_type', 'video'); // audio uses video resource type

        const res = await fetch('https://api.cloudinary.com/v1_1/dsdldwwhx/upload', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        if (data.secure_url) {
            // إرسال الرسالة
            await addDoc(collection(db, "dm_chats", chatId, "messages"), {
                senderId: user.uid,
                voiceUrl: data.secure_url,
                voiceDuration: Math.floor((Date.now() - recordingStartTime) / 1000),
                createdAt: serverTimestamp()
            });

            // تحديث المحادثة
            await updateDoc(doc(db, "dm_chats", chatId), {
                lastMessage: '🎤 رسالة صوتية',
                lastUpdated: serverTimestamp(),
                unreadBy: [currentDMUserId]
            });

            window.showToast?.('✅ تم إرسال الرسالة الصوتية', 'success');
        }

        audioChunks = [];

    } catch (e) {
        console.error('Voice upload error:', e);
        window.showToast?.('فشل رفع الرسالة الصوتية', 'error');
    }
};

// ============================================================
// 12. مكالمات الفيديو (Jitsi Meet)
// ============================================================
window.startVideoCall = async (chatId, otherId) => {
    const user = auth.currentUser;
    if (!user) return;

    // إنشاء رابط فريد للغرفة
    const roomName = `masar_${chatId}_${Date.now()}`;
    const jitsiUrl = `https://meet.jit.si/${roomName}`;

    // إرسال رسالة بالرابط
    try {
        await addDoc(collection(db, "dm_chats", chatId, "messages"), {
            senderId: user.uid,
            text: `📹 دعوة لمكالمة فيديو\n\nانضم من هنا:\n${jitsiUrl}`,
            videoCallUrl: jitsiUrl,
            createdAt: serverTimestamp()
        });

        await updateDoc(doc(db, "dm_chats", chatId), {
            lastMessage: '📹 مكالمة فيديو',
            lastUpdated: serverTimestamp(),
            unreadBy: [otherId]
        });

        // فتح المكالمة في نافذة جديدة
        window.open(jitsiUrl, '_blank', 'width=1000,height=700');

        window.showToast?.('✅ تم إنشاء رابط المكالمة', 'success');

    } catch (e) {
        console.error('Video call error:', e);
        window.showToast?.('فشل إنشاء المكالمة', 'error');
    }
};

// Export
export default { setupDMSystem };

