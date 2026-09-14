// chat.js - المساعد الذكي

import { auth, db } from './firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStructureName } from './structure.js';

// ✅ مفتاح Gemini API (محمي عبر .env)
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// System prompt متقدم جداً
const SYSTEM_PROMPT = `أنت "مسار AI" 🎓 - مساعد تعليمي فائق الذكاء مصمم خصيصاً للطلاب الجامعيين المصريين.

═══════════════════════════════════════
🎭 شخصيتك وأسلوبك:
═══════════════════════════════════════

✅ تتحدث بالعامية المصرية الخفيفة المحترمة (زي "أيوه"، "تمام"، "فاهم؟")
✅ ودود ومشجع - تحب تساعد الطلاب يفهموا ويتفوقوا
✅ تستخدم الإيموجي بشكل طبيعي لكن مش مبالغ فيه
✅ مرح وعندك حس فكاهة لطيف لما يناسب الموقف
✅ صبور جداً - لو الطالب مش فاهم، تشرح بطريقة تانية
✅ تفهم المزاح والسخرية وترد بشكل مناسب

═══════════════════════════════════════
🧠 قدراتك العلمية:
═══════════════════════════════════════

📐 الرياضيات: جبر، تفاضل، تكامل، إحصاء، رياضيات متقطعة
🔬 العلوم: فيزياء، كيمياء، أحياء، جيولوجيا
💻 البرمجة: Python, Java, C++, JavaScript, SQL, Data Structures
📊 الأعمال: محاسبة، تسويق، إدارة، اقتصاد
📚 اللغات: عربي، إنجليزي، ترجمة
🎨 الفنون: تصميم، جرافيك، UI/UX
⚖️ القانون والعلوم السياسية
🏥 العلوم الطبية والصحية

═══════════════════════════════════════
📝 طريقة الشرح:
═══════════════════════════════════════

1️⃣ ابدأ بجملة ودية قصيرة
2️⃣ اشرح الفكرة الأساسية بجملة أو اتنين
3️⃣ قسّم الشرح لنقاط مرقمة لو طويل
4️⃣ استخدم أمثلة من الحياة المصرية
5️⃣ في الرياضيات: اكتب الخطوات واحدة واحدة
6️⃣ أكد على النقاط المهمة بـ 💡 أو ⚡ أو 🔑
7️⃣ اختم بسؤال "فاهم كده؟" أو ملخص سريع

═══════════════════════════════════════
🎯 قواعد مهمة:
═══════════════════════════════════════

❌ متقولش "أنا مجرد برنامج" أو "معنديش مشاعر"
❌ متطولش في الردود - اختصر قدر الإمكان
❌ لو مش متأكد من معلومة، قول "مش متأكد 100% بس..."
❌ متخرجش عن الموضوع التعليمي إلا لو الطالب بيهزر
✅ لو حد سألك عن حاجة مش أكاديمية، رد بخفة دم
✅ شجع الطالب دايماً "برافو!"، "ممتاز!"، "استمر كده!"
✅ لو الطالب زعلان أو محبط، ادعمه نفسياً

═══════════════════════════════════════
💬 أمثلة على الردود:
═══════════════════════════════════════

❓ "مش فاهم التكامل"
✅ "تمام! 😊 التكامل ببساطة هو عكس التفاضل..."

❓ "أنا تعبان من المذاكرة"
✅ "أنا فاهمك 💙 خد بريك صغير، واشرب حاجة..."

❓ "إيه الفرق بين Stack و Queue؟"
✅ "سؤال جميل! 🔥 تخيل معايا:
   📚 Stack = طبق أطباق (آخر واحد فوق هو أول واحد يتشال)
   🚶 Queue = طابور (أول واحد داخل أول واحد يخرج)"

═══════════════════════════════════════

جاهز تساعد! 🚀`;

// تخزين تاريخ المحادثة (بدون system prompt - Gemini بيعامله مختلف)
let chatHistory = [];
let currentUserContext = null;

// تهيئة ويدجت الشات
export const setupChatWidget = async () => {
    if (document.getElementById('ai-chat-widget')) return;

    const chatContainer = document.createElement('div');
    chatContainer.id = 'ai-chat-widget';
    chatContainer.className = "fixed bottom-20 left-4 md:bottom-10 md:left-10 z-[250] font-sans transition-all duration-300";

    chatContainer.innerHTML = `
        <button id="chat-toggle-btn" class="w-14 h-14 bg-gradient-to-r from-primary-600 to-primary-600 text-white rounded-full shadow-2xl flex items-center justify-center transition transform hover:scale-110 border-2 border-white animate-bounce-slow">
            <i class="fas fa-robot text-2xl"></i>
        </button>

        <div id="chat-window" class="hidden absolute bottom-20 left-0 w-[320px] md:w-[380px] h-[500px] bg-white dark:bg-surface-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-surface-200 dark:border-surface-700 transform origin-bottom-left transition-all duration-300 scale-95 opacity-0">
            
            <div class="bg-gradient-to-r from-primary-600 to-primary-600 p-4 text-white flex justify-between items-center shadow-md">
                <div class="flex items-center gap-3">
                    <div class="bg-white/20 p-2 rounded-full backdrop-blur-sm"><i class="fas fa-brain"></i></div>
                    <div>
                        <h3 class="font-bold text-sm">مسار AI ✨</h3>
                        <p class="text-[10px] text-primary-100 flex items-center gap-1">
                            <span class="w-1.5 h-1.5 bg-accent-400 rounded-full animate-pulse"></span> Gemma 3 🧠
                        </p>
                    </div>
                </div>
                <button id="close-chat-btn" class="hover:bg-white/20 p-2 rounded-full transition"><i class="fas fa-times"></i></button>
            </div>

            <div id="chat-messages" class="flex-1 p-4 overflow-y-auto bg-surface-50 dark:bg-surface-900 custom-scrollbar space-y-4">
                <div class="flex justify-start animate-fade-in">
                    <div class="bg-white dark:bg-surface-700 p-3 rounded-2xl rounded-tl-none text-surface-800 dark:text-white text-sm shadow-sm max-w-[85%] border border-surface-100 dark:border-surface-600">
                        أهلاً! 👋 أنا مسار AI.<br>اسألني أي سؤال في أي مادة وهشرحلك! 🎓
                    </div>
                </div>
            </div>

            <div class="p-3 bg-white dark:bg-surface-800 border-t dark:border-surface-700">
                <div class="flex gap-2 items-center">
                    <input type="text" id="user-input" placeholder="اكتب سؤالك..." class="flex-1 p-3 bg-surface-100 dark:bg-surface-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white text-sm transition font-bold">
                    <button id="send-btn" class="bg-primary-600 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-primary-700 transition shadow-lg transform active:scale-95">
                        <i class="fas fa-paper-plane text-sm"></i>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(chatContainer);

    const toggleBtn = document.getElementById('chat-toggle-btn');
    const closeBtn = document.getElementById('close-chat-btn');
    const chatWindow = document.getElementById('chat-window');
    const sendBtn = document.getElementById('send-btn');
    const userInput = document.getElementById('user-input');

    toggleBtn.addEventListener('click', async () => {
        const isHidden = chatWindow.classList.contains('hidden');
        if (isHidden) {
            chatWindow.classList.remove('hidden');
            setTimeout(() => {
                chatWindow.classList.remove('scale-95', 'opacity-0');
                chatWindow.classList.add('scale-100', 'opacity-100');
            }, 10);
            await updateUserContext();
            userInput.focus();
        } else {
            closeChat();
        }
    });

    const closeChat = () => {
        chatWindow.classList.remove('scale-100', 'opacity-100');
        chatWindow.classList.add('scale-95', 'opacity-0');
        setTimeout(() => chatWindow.classList.add('hidden'), 300);
    };

    closeBtn.addEventListener('click', closeChat);

    // Rate Limiting
    const rateLimitKey = 'ai_chat_timestamps';
    const RATE_LIMIT = 5; // عدد الرسائل المسموحة
    const RATE_WINDOW = 60000; // في دقيقة واحدة (60 ثانية)

    const checkRateLimit = () => {
        const now = Date.now();
        let timestamps = JSON.parse(localStorage.getItem(rateLimitKey) || '[]');

        // حذف الـ timestamps القديمة (أكبر من دقيقة)
        timestamps = timestamps.filter(t => now - t < RATE_WINDOW);

        if (timestamps.length >= RATE_LIMIT) {
            const oldestTimestamp = timestamps[0];
            const waitTime = Math.ceil((RATE_WINDOW - (now - oldestTimestamp)) / 1000);
            return { allowed: false, waitTime };
        }

        timestamps.push(now);
        localStorage.setItem(rateLimitKey, JSON.stringify(timestamps));
        return { allowed: true };
    };

    const sendMessage = async () => {
        const text = userInput.value.trim();
        if (!text) return;

        // التحقق من Rate Limit
        const rateCheck = checkRateLimit();
        if (!rateCheck.allowed) {
            appendMessage('ai', `⏳ استنى ${rateCheck.waitTime} ثانية قبل ما تبعت رسالة تانية.\n\nده عشان نحافظ على جودة الخدمة للجميع! 🙏`);
            return;
        }

        if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
            appendMessage('ai', '⚠️ لازم تضيف مفتاح Gemini API!\n\nاحصل عليه مجاناً من:\nhttps://aistudio.google.com/app/apikey');
            return;
        }

        appendMessage('user', text);
        userInput.value = '';

        const loadingId = addLoadingIndicator();

        try {
            // Gemma مش بيدعم systemInstruction - نحط الـ system prompt في أول رسالة
            const systemPromptText = SYSTEM_PROMPT + (currentUserContext ? `\n\nمعلومات الطالب: ${currentUserContext.name} من ${currentUserContext.college} - ${currentUserContext.department}` : '');

            // إضافة رسالة المستخدم للتاريخ
            chatHistory.push({ role: "user", parts: [{ text }] });

            // بناء المحتوى - نحط system prompt في أول رسالة user
            const contents = [
                { role: "user", parts: [{ text: systemPromptText + "\n\nالآن أنا جاهز للمساعدة!" }] },
                { role: "model", parts: [{ text: "أهلاً! 👋 أنا مسار AI جاهز أساعدك. اسألني أي سؤال!" }] },
                ...chatHistory
            ];

            const requestBody = {
                contents: contents,
                generationConfig: {
                    temperature: 0.8,
                    maxOutputTokens: 1024
                }
            };

            // استخدام gemma-3-27b-it (14,400 طلب/يوم!)
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent?key=${GEMINI_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error?.message || "فشل الاتصال بالخادم");
            }

            const data = await response.json();
            const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "معلش، مقدرتش أرد دلوقتي. جرب تاني! 🙏";

            removeLoadingIndicator(loadingId);
            appendMessage('ai', aiReply);

            // إضافة رد الـ AI للتاريخ
            chatHistory.push({ role: "model", parts: [{ text: aiReply }] });

        } catch (error) {
            console.error("AI Error:", error);
            removeLoadingIndicator(loadingId);
            appendMessage('ai', `عذراً، حدث خطأ: ${error.message || "تأكد من الاتصال بالإنترنت"}`);
        }
    };

    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
};

// تحديث سياق الطالب
const updateUserContext = async () => {
    const user = auth.currentUser;
    if (!user || currentUserContext) return;

    try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const struct = getStructureName(data.collegeId, data.departmentId);

            currentUserContext = {
                college: struct.colName || "غير محدد",
                department: struct.deptName || "عام",
                name: data.displayName || "طالب"
            };
            // context يتم تمريره عبر systemInstruction في الـ request مباشرة
        }
    } catch (e) { console.error("Context Error", e); }
};

// دوال مساعدة للواجهة
const appendMessage = (sender, text) => {
    const messagesArea = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in group`;

    let formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/`([^`]+)`/g, '<code class="bg-surface-800 text-yellow-300 px-1 rounded font-mono text-xs" dir="ltr">$1</code>')
        .replace(/\n/g, '<br>');

    // إضافة زر القلب لرسائل الـ AI
    const heartBtn = sender === 'ai'
        ? `<div class="mt-1 flex gap-2">
             <button onclick="this.classList.toggle('text-red-500')" class="text-surface-400 hover:text-red-500 transition text-xs flex items-center gap-1">
                <i class="fas fa-heart"></i> مفيد
             </button>
           </div>`
        : '';

    div.innerHTML = `
        <div class="flex flex-col ${sender === 'user' ? 'items-end' : 'items-start'} max-w-[85%]">
            <div class="${sender === 'user'
            ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-tr-none'
            : 'bg-white dark:bg-surface-700 text-surface-800 dark:text-surface-100 border border-surface-200 dark:border-surface-600 rounded-tl-none'} 
                p-3 rounded-2xl text-sm shadow-sm break-words leading-relaxed">
                ${formattedText}
            </div>
            ${heartBtn}
        </div>
    `;

    messagesArea.appendChild(div);
    messagesArea.scrollTop = messagesArea.scrollHeight;
};

const addLoadingIndicator = () => {
    const id = 'loading-' + Date.now();
    const messagesArea = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.id = id;
    div.className = "flex justify-start animate-fade-in";
    div.innerHTML = `
        <div class="bg-white dark:bg-surface-700 p-3 rounded-2xl rounded-tl-none text-surface-500 text-xs shadow-sm flex gap-1 items-center border border-surface-200 dark:border-surface-600">
            <span class="w-2 h-2 bg-primary-400 rounded-full animate-bounce"></span>
            <span class="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
            <span class="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style="animation-delay: 0.4s"></span>
        </div>
    `;
    messagesArea.appendChild(div);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    return id;
};

const removeLoadingIndicator = (id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
};