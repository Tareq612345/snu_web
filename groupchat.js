// ============================================================
// groupChat.js - شات المجموعات
// ============================================================

import { db, auth, SUPER_ADMIN_EMAIL } from './firebase.js';
import {
    collection, addDoc, query, orderBy, limit, onSnapshot,
    serverTimestamp, getDoc, doc, updateDoc, deleteDoc, setDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { uploadToCloudinary } from './cms.js';
import { getStructureName } from './structure.js';
import { escapeHTML, normalizeHttpUrl, openExternalUrl } from './security.js';

let editingMsgId = null;
let replyingTo = null;
let unsubscribeChat = null;
let currentRoom = 'general';

// صوت الإشعار (يتحمل عند الحاجة فقط)
let NOTIFICATION_SOUND = null;
const getNotificationSound = () => {
    if (!NOTIFICATION_SOUND) {
        NOTIFICATION_SOUND = new Audio('https://assets.mixkit.co/active_storage/sfx/2346/2346-preview.mp3');
    }
    return NOTIFICATION_SOUND;
};

export const setupGroupChat = () => {
    // 1. زر الشات العائم
    const chatBtn = document.createElement('button');
    chatBtn.id = 'group-chat-toggle'; // ID فريد

    // بنرفعو شوية علشان ميتغطاش بالnavbar
    chatBtn.className = "fixed bottom-20 right-4 md:bottom-8 md:right-8 z-[250] w-14 h-14 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-2xl flex items-center justify-center transition transform hover:scale-110 border-2 border-white animate-bounce-slow";

    chatBtn.innerHTML = `
        <div class="relative">
            <i class="fas fa-comments text-2xl"></i>
            <span id="group-unread-dot" class="hidden absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full border-2 border-white"></span>
        </div>`;

    // 2. نافذة الشات
    const chatWindow = document.createElement('div');
    chatWindow.id = 'group-chat-window'; // ID فريد للنافذة

    // النافذة أيضاً ترتفع بنفس المقدار لتكون متناسقة
    chatWindow.className = "hidden fixed bottom-20 right-4 md:bottom-24 md:right-8 w-80 md:w-96 h-[550px] bg-white dark:bg-gray-800 rounded-3xl shadow-2xl z-[250] flex flex-col border border-gray-200 dark:border-gray-700 overflow-hidden transform transition-all duration-300 origin-bottom-right";

    chatWindow.innerHTML = `
        <div class="bg-gradient-to-r from-green-600 to-green-500 p-4 text-white flex justify-between items-center shadow-md">
            <div class="flex items-center gap-3">
                <div class="bg-white/20 p-2 rounded-full"><i class="fas fa-users"></i></div>
                <div>
                    <h3 class="font-bold text-lg flex items-center gap-2">
                        الملتقى الجامعي
                        <span id="chat-lock-indicator" class="hidden text-xs bg-red-500 px-2 py-0.5 rounded-full"><i class="fas fa-lock text-[10px]"></i> مغلق</span>
                    </h3>
                    <p class="text-[10px] text-green-100 opacity-90">مساحة للنقاش وتبادل الخبرات</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button id="btn-toggle-chat-lock" class="hidden hover:bg-white/20 p-2 rounded-full transition" title="قفل/فتح المحادثة"><i class="fas fa-lock"></i></button>
                <button id="btn-close-group-chat" class="hover:bg-white/20 p-2 rounded-full transition"><i class="fas fa-chevron-down"></i></button>
            </div>
        </div>
        
        <!-- Room Tabs -->
        <div id="room-tabs" class="flex gap-1 p-2 bg-gray-100 dark:bg-gray-700 overflow-x-auto custom-scrollbar">
            <button onclick="window.switchChatRoom('general')" class="room-tab active px-3 py-1.5 rounded-full text-xs font-bold bg-green-600 text-white whitespace-nowrap transition" data-room="general">
                💬 العام
            </button>
            <button id="college-room-tab" onclick="window.switchToCollegeRoom()" class="room-tab px-3 py-1.5 rounded-full text-xs font-bold bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 whitespace-nowrap hover:bg-gray-300 dark:hover:bg-gray-500 transition" data-room="college">
                🏫 كليتي
            </button>
            <button onclick="window.switchChatRoom('study')" class="room-tab px-3 py-1.5 rounded-full text-xs font-bold bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 whitespace-nowrap hover:bg-gray-300 dark:hover:bg-gray-500 transition" data-room="study">
                📚 دراسة
            </button>
            <button onclick="window.switchChatRoom('help')" class="room-tab px-3 py-1.5 rounded-full text-xs font-bold bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 whitespace-nowrap hover:bg-gray-300 dark:hover:bg-gray-500 transition" data-room="help">
                ❓ مساعدة
            </button>
            <button onclick="window.switchChatRoom('random')" class="room-tab px-3 py-1.5 rounded-full text-xs font-bold bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 whitespace-nowrap hover:bg-gray-300 dark:hover:bg-gray-500 transition" data-room="random">
                🎉 عشوائي
            </button>
        </div>
        
        <div id="group-messages-area" class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900 custom-scrollbar relative">
            <div class="text-center text-gray-400 mt-20 text-sm opacity-50">
                <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                <p>جاري الاتصال...</p>
            </div>
        </div>
        
        <div id="reply-banner" class="hidden bg-gray-100 dark:bg-gray-700 p-2 px-4 border-t dark:border-gray-600 flex justify-between items-center animate-slide-up">
            <div class="flex flex-col max-w-[85%]">
                <span class="text-[10px] font-bold text-green-600 dark:text-green-400">
                    <i class="fas fa-reply"></i> رد على <span id="reply-to-name">...</span>
                </span>
                <span id="reply-to-text" class="text-xs text-gray-500 dark:text-gray-300 truncate">...</span>
            </div>
            <button onclick="window.cancelReply()" class="text-gray-400 hover:text-red-500 transition"><i class="fas fa-times"></i></button>
        </div>

        <div id="edit-indicator" class="hidden bg-yellow-100 text-yellow-800 px-3 py-1 text-xs flex justify-between items-center">
            <span><i class="fas fa-pen"></i> جاري تعديل رسالة...</span>
            <button onclick="window.cancelEdit()" class="text-red-500 font-bold">إلغاء</button>
        </div>

        <div id="group-input-container" class="p-3 bg-white dark:bg-gray-800 border-t dark:border-gray-700 relative">
            
            <div id="chat-file-preview-box" class="hidden mb-2 relative w-fit p-2 bg-gray-100 dark:bg-gray-600 rounded-lg border dark:border-gray-500">
                <div class="flex items-center gap-2">
                    <i id="file-preview-icon" class="fas fa-file text-2xl text-gray-500"></i>
                    <div>
                        <p id="file-preview-name" class="text-xs font-bold dark:text-white truncate max-w-[150px]"></p>
                        <p id="file-preview-size" class="text-[10px] text-gray-400"></p>
                    </div>
                </div>
                <img id="chat-img-preview" class="hidden h-16 rounded mt-2">
                <button onclick="window.clearChatFile()" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-sm hover:bg-red-600"><i class="fas fa-times"></i></button>
            </div>

            <form id="group-chat-form" class="flex items-center gap-2">
                <input type="file" id="chat-file-upload" class="hidden" accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" onchange="window.previewChatFile(this)">
                
                <!-- Emoji Picker -->
                <div class="relative">
                    <button type="button" id="emoji-picker-btn" class="text-gray-400 hover:text-yellow-500 transition p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title="إيموجي">
                        <i class="far fa-smile text-xl"></i>
                    </button>
                    <div id="emoji-picker" class="hidden absolute bottom-12 right-0 bg-white dark:bg-gray-700 rounded-xl shadow-xl p-2 border dark:border-gray-600 z-50">
                        <div class="flex gap-1 flex-wrap w-48">
                            <button type="button" onclick="window.insertEmoji('😀')" class="text-xl hover:scale-125 transition p-1">😀</button>
                            <button type="button" onclick="window.insertEmoji('❤️')" class="text-xl hover:scale-125 transition p-1">❤️</button>
                            <button type="button" onclick="window.insertEmoji('😂')" class="text-xl hover:scale-125 transition p-1">😂</button>
                            <button type="button" onclick="window.insertEmoji('😮')" class="text-xl hover:scale-125 transition p-1">😮</button>
                            <button type="button" onclick="window.insertEmoji('😢')" class="text-xl hover:scale-125 transition p-1">😢</button>
                            <button type="button" onclick="window.insertEmoji('👍')" class="text-xl hover:scale-125 transition p-1">👍</button>
                            <button type="button" onclick="window.insertEmoji('👎')" class="text-xl hover:scale-125 transition p-1">👎</button>
                            <button type="button" onclick="window.insertEmoji('🔥')" class="text-xl hover:scale-125 transition p-1">🔥</button>
                            <button type="button" onclick="window.insertEmoji('💯')" class="text-xl hover:scale-125 transition p-1">💯</button>
                            <button type="button" onclick="window.insertEmoji('🎉')" class="text-xl hover:scale-125 transition p-1">🎉</button>
                            <button type="button" onclick="window.insertEmoji('💪')" class="text-xl hover:scale-125 transition p-1">💪</button>
                            <button type="button" onclick="window.insertEmoji('🙏')" class="text-xl hover:scale-125 transition p-1">🙏</button>
                        </div>
                    </div>
                </div>
                
                <!-- File Upload -->
                <button type="button" onclick="document.getElementById('chat-file-upload').click()" class="text-gray-400 hover:text-green-600 transition p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title="إرفاق ملف">
                    <i class="fas fa-paperclip text-xl"></i>
                </button>
                
                <!-- Voice Recording -->
                <button type="button" id="voice-record-btn" onclick="window.toggleVoiceRecording()" class="text-gray-400 hover:text-red-500 transition p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title="تسجيل صوتي">
                    <i class="fas fa-microphone text-xl"></i>
                </button>

                <input type="text" id="group-msg-input" autocomplete="off" placeholder="اكتب رسالتك هنا..." class="flex-grow p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm focus:outline-none dark:text-white transition focus:ring-2 focus:ring-green-500">
                
                <button type="submit" id="send-group-btn" class="bg-green-600 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-green-700 shadow-lg transition transform active:scale-95">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </form>
        </div>
    `;

    document.body.appendChild(chatBtn);
    document.body.appendChild(chatWindow);

    // --- الأحداث ---

    // فتح الشات
    chatBtn.onclick = () => {
        chatWindow.classList.remove('hidden');
        chatBtn.classList.add('hidden');
        document.getElementById('group-unread-dot').classList.add('hidden');
        listenToMessages();

        const area = document.getElementById('group-messages-area');
        setTimeout(() => area.scrollTop = area.scrollHeight, 100);
    };

    // إغلاق الشات
    document.getElementById('btn-close-group-chat').onclick = () => {
        chatWindow.classList.add('hidden');
        chatBtn.classList.remove('hidden');
    };

    document.getElementById('group-chat-form').onsubmit = handleSend;

    // === نظام قفل المحادثة للسوبر أدمن ===
    // SUPER_ADMIN_EMAIL imported from firebase.js

    // التحقق من صلاحية السوبر أدمن وإظهار زر القفل
    auth.onAuthStateChanged(async (user) => {
        if (user && user.email === SUPER_ADMIN_EMAIL) {
            const lockBtn = document.getElementById('btn-toggle-chat-lock');
            if (lockBtn) {
                lockBtn.classList.remove('hidden');
                lockBtn.onclick = window.toggleGroupChatLock;
            }
        }

        // مراقبة حالة القفل
        onSnapshot(doc(db, "system", "chat_settings"), (snap) => {
            const isLocked = snap.exists() && snap.data().isLocked;
            const indicator = document.getElementById('chat-lock-indicator');
            const lockBtn = document.getElementById('btn-toggle-chat-lock');
            const inputArea = document.getElementById('group-input-container');

            if (indicator) {
                indicator.classList.toggle('hidden', !isLocked);
            }

            if (lockBtn) {
                lockBtn.innerHTML = isLocked
                    ? '<i class="fas fa-lock-open"></i>'
                    : '<i class="fas fa-lock"></i>';
                lockBtn.title = isLocked ? 'فتح المحادثة' : 'قفل المحادثة';
            }

            // إخفاء منطقة الإدخال للمستخدمين العاديين
            if (inputArea && isLocked && user?.email !== SUPER_ADMIN_EMAIL) {
                inputArea.innerHTML = `
                    <div class="p-4 text-center text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800">
                        <i class="fas fa-lock text-2xl mb-2 text-red-500"></i>
                        <p class="text-sm font-bold">المحادثة مغلقة حالياً من قبل الإدارة</p>
                    </div>
                `;
            }
        });
    });
};

// دالة تبديل حالة القفل
window.toggleGroupChatLock = async () => {
    try {
        const settingsRef = doc(db, "system", "chat_settings");
        const snap = await getDoc(settingsRef);
        const currentLocked = snap.exists() && snap.data().isLocked;

        await setDoc(settingsRef, {
            isLocked: !currentLocked,
            lockedAt: new Date(),
            lockedBy: auth.currentUser?.email
        }, { merge: true });

        window.showToast?.(currentLocked ? '✅ تم فتح المحادثة' : '🔒 تم قفل المحادثة', 'success');
    } catch (e) {
        console.error(e);
        window.showToast?.('حدث خطأ', 'error');
    }
};

// ============================================================
// 2. منطق الاستماع للرسائل (Listener)
// ============================================================
const listenToMessages = () => {
    const area = document.getElementById('group-messages-area');
    if (unsubscribeChat) unsubscribeChat();

    // استخدام الغرفة الحالية
    const collectionPath = currentRoom === 'general' ? 'global_chat' : `chat_rooms/${currentRoom}/messages`;
    const q = query(collection(db, collectionPath), orderBy("createdAt", "asc"), limit(50));

    unsubscribeChat = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            area.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-gray-400 opacity-60">
                    <i class="fas fa-comments text-6xl mb-4"></i>
                    <p>لا توجد رسائل بعد. كن أول من يكتب!</p>
                </div>`;
            return;
        }

        const messages = [];
        snapshot.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));

        area.innerHTML = '';
        const currentUser = auth.currentUser;

        // تشغيل الصوت
        if (!document.getElementById('group-chat-window').classList.contains('hidden') && messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if (currentUser && lastMsg.userId !== currentUser.uid && (Date.now() - (lastMsg.createdAt?.toMillis() || 0)) < 5000) {
                try { getNotificationSound().play().catch(() => { }); } catch (e) { }
            }
        }

        messages.forEach(msg => {
            const isMe = currentUser && msg.userId === currentUser.uid;

            let infoText = '';
            if (msg.collegeId) {
                const struct = getStructureName(msg.collegeId, msg.departmentId);
                if (struct && struct.colName) infoText = struct.colName;
            }

            // HTML الرد
            let replyHtml = '';
            if (msg.replyTo) {
                replyHtml = `
                    <div class="mb-1 p-2 rounded-lg bg-black/5 dark:bg-white/10 border-r-4 border-green-500 text-xs flex flex-col gap-0.5 cursor-pointer hover:bg-black/10 transition" data-chat-action="scroll-reply">
                        <span class="font-bold text-green-700 dark:text-green-300 flex items-center gap-1">
                            <i class="fas fa-reply"></i> ${escapeHTML(msg.replyTo.userName)}
                        </span>
                        <span class="truncate text-gray-600 dark:text-gray-300 italic">"${escapeHTML(msg.replyTo.text)}"</span>
                    </div>
                `;
            }

            // HTML الصورة أو الملف
            let mediaHtml = '';
            if (msg.imageUrl) {
                mediaHtml = `
                    <div class="mt-1 mb-1">
                        <img src="${escapeHTML(normalizeHttpUrl(msg.imageUrl))}" loading="lazy" class="max-w-full rounded-lg max-h-48 object-cover cursor-pointer hover:opacity-90 transition border-2 border-transparent hover:border-green-300" data-chat-action="open-image">
                    </div>
                `;
            } else if (msg.fileUrl) {
                const getIcon = (type) => {
                    if (type?.includes('pdf')) return 'fa-file-pdf text-red-500';
                    if (type?.includes('word') || type?.includes('doc')) return 'fa-file-word text-blue-600';
                    if (type?.includes('excel') || type?.includes('sheet')) return 'fa-file-excel text-green-600';
                    if (type?.includes('powerpoint') || type?.includes('presentation')) return 'fa-file-powerpoint text-orange-500';
                    return 'fa-file text-gray-500';
                };
                mediaHtml = `
                    <div class="mt-1 mb-1 flex items-center gap-2 bg-white/20 dark:bg-gray-600/50 p-2 rounded-lg cursor-pointer hover:bg-white/30 transition" data-chat-action="open-file">
                        <i class="fas ${getIcon(msg.fileType)} text-xl"></i>
                        <div class="flex-1 min-w-0">
                            <p class="text-xs font-bold truncate">${escapeHTML(msg.fileName || 'ملف')}</p>
                            <p class="text-[10px] opacity-70">اضغط لتحميل</p>
                        </div>
                        <i class="fas fa-download text-xs opacity-50"></i>
                    </div>
                `;
            }

            const userAvatar = msg.userPhoto || `https://ui-avatars.com/api/?name=${msg.userName}&background=random`;

            const div = document.createElement('div');
            div.id = msg.id;
            div.className = `flex gap-3 mb-4 ${isMe ? 'flex-row-reverse' : 'flex-row'} group animate-fade-in`;

            const avatarHtml = `
                <div class="flex-shrink-0 flex flex-col items-center gap-1">
                    <img src="${escapeHTML(normalizeHttpUrl(userAvatar))}" loading="lazy" class="w-8 h-8 rounded-full object-cover shadow-sm border dark:border-gray-600">
                </div>`;

            const controlsHtml = `
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition duration-200 self-center px-2">
                    <button data-chat-action="reply" class="text-gray-400 hover:text-green-600 bg-white dark:bg-gray-700 rounded-full w-6 h-6 shadow flex items-center justify-center" title="رد"><i class="fas fa-reply text-xs"></i></button>
                    ${(isMe) ? `
                        <button data-chat-action="edit" class="text-blue-500 hover:text-blue-700 bg-white dark:bg-gray-700 rounded-full w-6 h-6 shadow flex items-center justify-center" title="تعديل"><i class="fas fa-pen text-xs"></i></button>
                    ` : ''}
                    ${(isMe || auth.currentUser?.email === SUPER_ADMIN_EMAIL) ? `
                        <button data-chat-action="delete" class="text-gray-400 hover:text-red-600 bg-white dark:bg-gray-700 rounded-full w-6 h-6 shadow flex items-center justify-center" title="حذف"><i class="fas fa-trash text-xs"></i></button>
                    ` : ''}
                    ${!isMe ? `
                        <button data-chat-action="report" class="text-gray-400 hover:text-red-500 bg-white dark:bg-gray-700 rounded-full w-6 h-6 shadow flex items-center justify-center" title="إبلاغ"><i class="fas fa-flag text-xs"></i></button>
                    ` : ''}
                </div>
            `;

            // Audio player HTML
            let audioHtml = '';
            if (msg.audioUrl) {
                audioHtml = `
                    <div class="mt-1 mb-1 flex items-center gap-2 bg-white/10 p-2 rounded-lg">
                        <i class="fas fa-microphone text-sm opacity-70"></i>
                        <audio controls class="h-8 max-w-[180px]">
                            <source src="${escapeHTML(normalizeHttpUrl(msg.audioUrl))}" type="audio/webm">
                        </audio>
                    </div>
                `;
            }

            // Reactions display
            let reactionsHtml = '';
            if (msg.reactions && Object.keys(msg.reactions).length > 0) {
                reactionsHtml = '<div class="flex flex-wrap gap-1 mt-1">';
                for (const [emoji, users] of Object.entries(msg.reactions)) {
                    const count = users.length;
                    const isMine = users.includes(auth.currentUser?.uid);
                    reactionsHtml += `<button data-chat-action="reaction" data-emoji="${escapeHTML(emoji)}" class="text-xs px-1.5 py-0.5 rounded-full ${isMine ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-gray-100 dark:bg-gray-600'} hover:scale-110 transition">${escapeHTML(emoji)} ${count}</button>`;
                }
                reactionsHtml += '</div>';
            }

            // Quick reaction buttons
            const quickReactionHtml = `
                <div class="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition">
                    <button data-chat-action="reaction" data-emoji="❤️" class="text-xs hover:scale-125 transition">❤️</button>
                    <button data-chat-action="reaction" data-emoji="👍" class="text-xs hover:scale-125 transition">👍</button>
                    <button data-chat-action="reaction" data-emoji="😂" class="text-xs hover:scale-125 transition">😂</button>
                    <button data-chat-action="reaction" data-emoji="🔥" class="text-xs hover:scale-125 transition">🔥</button>
                </div>
            `;

            const bodyHtml = `
                <div class="max-w-[75%] min-w-[120px]">
                    <div class="flex items-baseline gap-2 mb-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}">
                        <span data-chat-action="profile" class="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate max-w-[100px] cursor-pointer hover:text-blue-600 hover:underline">${escapeHTML(msg.userName)}</span>
                        ${infoText ? `<span class="text-[9px] text-gray-400 dark:text-gray-500 truncate max-w-[120px] bg-gray-100 dark:bg-gray-700 px-1.5 rounded">${escapeHTML(infoText)}</span>` : ''}
                    </div>
                    
                    <div class="relative px-3 py-2 text-sm shadow-sm break-words
                        ${isMe ? 'bg-green-600 text-white rounded-2xl rounded-tr-none' : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white border border-gray-200 dark:border-gray-600 rounded-2xl rounded-tl-none'}">
                        ${replyHtml}
                        ${mediaHtml}
                        ${audioHtml}
                        ${msg.text ? `<p class="leading-relaxed whitespace-pre-wrap">${escapeHTML(msg.text)}</p>` : ''}
                        
                        <div class="text-[9px] text-right mt-1 opacity-60 ${isMe ? 'text-green-100' : 'text-gray-400'}">
                            ${msg.createdAt ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                            ${msg.edited ? '<span class="mx-1">(معدل)</span>' : ''}
                        </div>
                        ${reactionsHtml}
                        ${quickReactionHtml}
                    </div>
                </div>
            `;

            div.innerHTML = isMe ? (controlsHtml + bodyHtml + avatarHtml) : (avatarHtml + bodyHtml + controlsHtml);
            div.querySelectorAll('[data-chat-action]').forEach(el => el.addEventListener('click', () => {
                const action = el.dataset.chatAction;
                if (action === 'scroll-reply') document.getElementById(String(msg.replyTo?.id || ''))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                else if (action === 'open-image') openExternalUrl(msg.imageUrl);
                else if (action === 'open-file') openExternalUrl(msg.fileUrl);
                else if (action === 'reply') window.replyToMsg(msg.id, msg.userName || '', msg.text || 'صورة');
                else if (action === 'edit') window.editGroupMsg(msg.id, msg.text || '');
                else if (action === 'delete') window.deleteGroupMsg(msg.id);
                else if (action === 'report') window.showReportUserModal?.(msg.userId, msg.userName || '');
                else if (action === 'profile') window.openUserProfile?.(msg.userId);
                else if (action === 'reaction') window.addReaction(msg.id, el.dataset.emoji || '');
            }));
            area.appendChild(div);
        });

        area.scrollTop = area.scrollHeight;
    });
};

// ============================================================
// 3. إرسال الرسالة
// ============================================================
const handleSend = async (e) => {
    e.preventDefault();
    const input = document.getElementById('group-msg-input');
    const fileInput = document.getElementById('chat-file-upload');
    const sendBtn = document.getElementById('send-group-btn');

    const text = input.value.trim();
    const file = fileInput?.files?.[0];

    if (!text && !file) return;

    const user = auth.currentUser;
    if (!user) return window.showToast?.(" يرجى تسجيل الدخول");

    // التحقق من الحظر
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().isChatBanned) {
        return window.showToast?.(" ⛔ تم حظرك من الشات");
    }

    // التحقق من التوثيق - فقط الموثقين يقدروا يكتبوا (الأونر معفي)
    if (user.email !== SUPER_ADMIN_EMAIL && (!userDoc.exists() || userDoc.data().isVerified !== true)) {
        return window.showToast?.('⚠️ يجب توثيق حسابك أولاً لتتمكن من المشاركة في الشات.\n\nقم برفع صورة الكارنيه من صفحة الملف الشخصي.');
    }

    // Rate Limiting - منع السبام (3 ثواني بين كل رسالة)
    const lastMsgTime = window.lastGroupMsgTime || 0;
    const now = Date.now();
    const cooldown = 3000; // 3 ثواني

    if (now - lastMsgTime < cooldown) {
        const remaining = Math.ceil((cooldown - (now - lastMsgTime)) / 1000);
        window.showToast?.(`⏳ انتظر ${remaining} ثانية قبل الإرسال`, 'warning');
        return;
    }
    window.lastGroupMsgTime = now;

    const userData = userDoc.data();

    // التعديل
    if (editingMsgId) {
        const collPath = currentRoom === 'general' ? 'global_chat' : `chat_rooms/${currentRoom}/messages`;
        await updateDoc(doc(db, collPath, editingMsgId), { text, edited: true });
        window.cancelEdit();
        return;
    }

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        let fileUrl = null;
        let fileName = null;
        let fileType = null;

        if (file) {
            fileUrl = await uploadToCloudinary(file);
            fileName = file.name;
            fileType = file.type;
        }

        // استخدام الغرفة الحالية
        const collPath = currentRoom === 'general' ? 'global_chat' : `chat_rooms/${currentRoom}/messages`;

        await addDoc(collection(db, collPath), {
            text,
            imageUrl: file?.type?.startsWith('image/') ? fileUrl : null,
            fileUrl: !file?.type?.startsWith('image/') ? fileUrl : null,
            fileName,
            fileType,
            userId: user.uid,
            userName: userData.displayName || user.displayName,
            userPhoto: userData.photoURL || user.photoURL,
            collegeId: userData.collegeId || 'unknown',
            departmentId: userData.departmentId || 'unknown',
            room: currentRoom,
            createdAt: serverTimestamp(),
            replyTo: replyingTo ? {
                id: replyingTo.id,
                userName: replyingTo.userName,
                text: replyingTo.text
            } : null
        });

        input.value = '';
        fileInput.value = '';
        window.cancelReply();
        window.clearChatFile();

    } catch (e) {
        console.error(e);
        alert("حدث خطأ في الإرسال");
    } finally {
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        sendBtn.disabled = false;
        input.focus();
    }
};

// ============================================================
// 4. دوال النافذة العامة
// ============================================================
window.replyToMsg = (id, userName, text) => {
    replyingTo = { id, userName, text };
    document.getElementById('reply-banner').classList.remove('hidden');
    document.getElementById('reply-to-name').textContent = userName;
    document.getElementById('reply-to-text').textContent = text;
    document.getElementById('group-msg-input').focus();
};

window.cancelReply = () => {
    replyingTo = null;
    document.getElementById('reply-banner').classList.add('hidden');
};

// معاينة الملف (صورة أو مستند)
window.previewChatFile = (input) => {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const isImage = file.type.startsWith('image/');

        // تحديد أيقونة الملف
        const getFileIcon = (type) => {
            if (type.includes('pdf')) return 'fa-file-pdf text-red-500';
            if (type.includes('word') || type.includes('doc')) return 'fa-file-word text-blue-600';
            if (type.includes('excel') || type.includes('sheet') || type.includes('xls')) return 'fa-file-excel text-green-600';
            if (type.includes('powerpoint') || type.includes('presentation') || type.includes('ppt')) return 'fa-file-powerpoint text-orange-500';
            return 'fa-file text-gray-500';
        };

        // عرض معلومات الملف
        document.getElementById('file-preview-icon').className = `fas ${getFileIcon(file.type)} text-2xl`;
        document.getElementById('file-preview-name').textContent = file.name;
        document.getElementById('file-preview-size').textContent = (file.size / 1024).toFixed(1) + ' KB';
        document.getElementById('chat-file-preview-box').classList.remove('hidden');

        // إذا كانت صورة، اعرضها
        const imgPreview = document.getElementById('chat-img-preview');
        if (isImage) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imgPreview.src = e.target.result;
                imgPreview.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        } else {
            imgPreview.classList.add('hidden');
        }
    }
};

window.clearChatFile = () => {
    document.getElementById('chat-file-upload').value = '';
    document.getElementById('chat-file-preview-box').classList.add('hidden');
    document.getElementById('chat-img-preview').classList.add('hidden');
};

// تبديل الغرف
window.switchChatRoom = (room) => {
    currentRoom = room;

    // تحديث التبويبات
    document.querySelectorAll('.room-tab').forEach(tab => {
        if (tab.dataset.room === room) {
            tab.className = 'room-tab px-3 py-1.5 rounded-full text-xs font-bold bg-green-600 text-white whitespace-nowrap transition';
        } else {
            tab.className = 'room-tab px-3 py-1.5 rounded-full text-xs font-bold bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 whitespace-nowrap hover:bg-gray-300 dark:hover:bg-gray-500 transition';
        }
    });

    // إعادة تحميل الرسائل للغرفة الجديدة
    listenToMessages();
};

// التبديل لغرفة الكلية
window.switchToCollegeRoom = async () => {
    const user = auth.currentUser;
    if (!user) {
        window.showToast?.('⚠️ سجل دخول أولاً', 'warning');
        return;
    }

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists() || !userDoc.data().collegeId) {
            window.showToast?.('⚠️ لم يتم تحديد كليتك في الملف الشخصي', 'warning');
            return;
        }

        const collegeId = userDoc.data().collegeId;
        const collegeName = getStructureName(collegeId)?.colName || 'كليتي';

        // تحديث اسم التاب
        const collegeTab = document.getElementById('college-room-tab');
        if (collegeTab) {
            collegeTab.innerHTML = `🏫 ${collegeName}`;
        }

        // التبديل للغرفة
        window.switchChatRoom(`college_${collegeId}`);

    } catch (e) {
        console.error('Switch to college room error:', e);
        window.showToast?.('❌ حدث خطأ', 'error');
    }
};

window.deleteGroupMsg = async (id) => {
    if (confirm("حذف هذه الرسالة؟")) {
        try {
            const collPath = currentRoom === 'general' ? 'global_chat' : `chat_rooms/${currentRoom}/messages`;
            await deleteDoc(doc(db, collPath, id));
            window.showToast?.('✅ تم حذف الرسالة', 'success');
        }
        catch (e) {
            console.error("Delete Error:", e);
            alert("خطأ في الحذف: " + e.message);
        }
    }
};

window.editGroupMsg = (id, text) => {
    editingMsgId = id;
    document.getElementById('group-msg-input').value = text;
    document.getElementById('edit-indicator').classList.remove('hidden');
    window.cancelReply();
};

window.cancelEdit = () => {
    editingMsgId = null;
    document.getElementById('group-msg-input').value = '';
    document.getElementById('edit-indicator').classList.add('hidden');
};

// ============================================================
// 5. Emoji Picker Functions
// ============================================================
window.insertEmoji = (emoji) => {
    const input = document.getElementById('group-msg-input');
    input.value += emoji;
    input.focus();
    document.getElementById('emoji-picker').classList.add('hidden');
};

// Toggle emoji picker
document.addEventListener('click', (e) => {
    const picker = document.getElementById('emoji-picker');
    const btn = document.getElementById('emoji-picker-btn');
    if (picker && btn) {
        if (btn.contains(e.target)) {
            picker.classList.toggle('hidden');
        } else if (!picker.contains(e.target)) {
            picker.classList.add('hidden');
        }
    }
});

// ============================================================
// 6. Voice Recording Functions
// ============================================================
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

window.toggleVoiceRecording = async () => {
    const btn = document.getElementById('voice-record-btn');

    if (isRecording) {
        // Stop recording
        mediaRecorder.stop();
        isRecording = false;
        btn.innerHTML = '<i class="fas fa-microphone text-xl"></i>';
        btn.classList.remove('text-red-500', 'animate-pulse');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            stream.getTracks().forEach(track => track.stop());

            // Upload and send
            await sendVoiceMessage(audioBlob);
        };

        mediaRecorder.start();
        isRecording = true;
        btn.innerHTML = '<i class="fas fa-stop text-xl"></i>';
        btn.classList.add('text-red-500', 'animate-pulse');

        window.showToast?.('🎙️ جاري التسجيل...', 'info');

    } catch (e) {
        console.error('Voice recording error:', e);
        window.showToast?.('❌ لا يمكن الوصول للميكروفون', 'error');
    }
};

const sendVoiceMessage = async (audioBlob) => {
    const user = auth.currentUser;
    if (!user) return;

    const sendBtn = document.getElementById('send-group-btn');
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    sendBtn.disabled = true;

    try {
        // Upload to Cloudinary
        const formData = new FormData();
        formData.append('file', audioBlob, 'voice.webm');
        formData.append('upload_preset', 'ml_default');

        const res = await fetch('https://api.cloudinary.com/v1_1/dsdldwwhx/auto/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        const audioUrl = data.secure_url;

        // Get user data
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};

        // Add message
        const collPath = currentRoom === 'general' ? 'global_chat' : `chat_rooms/${currentRoom}/messages`;
        await addDoc(collection(db, collPath), {
            text: '',
            audioUrl,
            userId: user.uid,
            userName: user.displayName,
            userPhoto: user.photoURL,
            collegeId: userData.collegeId || 'unknown',
            departmentId: userData.departmentId || 'unknown',
            room: currentRoom,
            createdAt: serverTimestamp()
        });

        window.showToast?.('✅ تم إرسال الرسالة الصوتية', 'success');

    } catch (e) {
        console.error(e);
        window.showToast?.('❌ فشل رفع التسجيل', 'error');
    } finally {
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        sendBtn.disabled = false;
    }
};

// ============================================================
// 7. Message Reactions
// ============================================================
window.addReaction = async (msgId, emoji) => {
    const user = auth.currentUser;
    if (!user) return;

    const collPath = currentRoom === 'general' ? 'global_chat' : `chat_rooms/${currentRoom}/messages`;
    const msgRef = doc(db, collPath, msgId);
    const msgDoc = await getDoc(msgRef);

    if (!msgDoc.exists()) return;

    const reactions = msgDoc.data().reactions || {};
    const userReactions = reactions[emoji] || [];

    if (userReactions.includes(user.uid)) {
        // Remove reaction
        const newList = userReactions.filter(id => id !== user.uid);
        if (newList.length === 0) {
            delete reactions[emoji];
        } else {
            reactions[emoji] = newList;
        }
    } else {
        // Add reaction
        reactions[emoji] = [...userReactions, user.uid];
    }

    await updateDoc(msgRef, { reactions });
};