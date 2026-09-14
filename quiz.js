// quiz.js - إدارة الامتحانات

import { db, auth, SUPER_ADMIN_EMAIL } from './firebase.js';
import { collection, addDoc, getDocs, query, doc, getDoc, orderBy, where, updateDoc, increment, setDoc, deleteDoc, limit, writeBatch } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { updateGlobalProgress } from './cms.js';
import { getStructureName, UNIVERSITY_STRUCTURE } from './structure.js';

// دالة لعرض المعادلات الرياضية باستخدام KaTeX
const renderMathInPage = (element = document.body) => {
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(element, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\[', right: '\\]', display: true },
                { left: '\\(', right: '\\)', display: false }
            ],
            throwOnError: false
        });
    }
};
window.renderMathInPage = renderMathInPage;

let quizTimerInterval;

// نظام مراقبة الغش
let cheatingViolations = 0;
let maxViolations = 3;
let isQuizActive = false;
let currentQuizId = null;
let cheatingLog = [];

// دالة تسجيل المخالفة
const logViolation = async (type, details = '') => {
    cheatingViolations++;
    const timestamp = new Date().toLocaleTimeString('ar-EG');
    cheatingLog.push({ type, details, timestamp, count: cheatingViolations });

    console.warn(`⚠️ مخالفة #${cheatingViolations}: ${type}`);

    // عرض تحذير
    const remaining = maxViolations - cheatingViolations;
    if (remaining > 0) {
        window.showToast?.(`⚠️ ${window.t?.('warning') || 'تحذير'}: ${type} - ${window.t?.('remaining') || 'متبقي'} ${remaining} ${window.t?.('attempts') || 'محاولات'}`, 'warning');
    }

    // إنهاء الاختبار بعد تجاوز الحد
    if (cheatingViolations >= maxViolations) {
        await forceEndQuiz(window.t?.('quiz-ended-cheating') || 'تم إنهاء الاختبار بسبب محاولات غش متكررة');
    }
};

// إنهاء الاختبار قسرياً
const forceEndQuiz = async (reason) => {
    isQuizActive = false;
    clearInterval(quizTimerInterval);
    exitFullscreen();
    removeAntiCheatListeners();

    // حفظ سجل الغش
    try {
        const user = auth.currentUser;
        if (user && currentQuizId) {
            await addDoc(collection(db, "cheating_logs"), {
                userId: user.uid,
                userName: user.displayName,
                quizId: currentQuizId,
                violations: cheatingLog,
                totalViolations: cheatingViolations,
                reason,
                timestamp: new Date()
            });
        }
    } catch (e) {
        console.error('Error saving cheating log:', e);
    }

    // عرض رسالة
    const container = document.getElementById('quiz-area');
    if (container) {
        container.innerHTML = `
            <div class="max-w-md mx-auto bg-red-50 dark:bg-red-900/20 p-10 rounded-2xl shadow-2xl text-center mt-10 border-t-8 border-red-500">
                <div class="text-7xl mb-6">🚫</div>
                <h2 class="text-2xl font-black text-red-600 mb-4">${window.t?.('quiz-cancelled') || 'تم إلغاء الاختبار'}</h2>
                <p class="text-surface-600 dark:text-surface-300 mb-6">${reason}</p>
                <div class="bg-white dark:bg-surface-800 rounded-xl p-4 mb-6 text-right">
                    <h4 class="font-bold text-red-500 mb-2">📋 ${window.t?.('violations-log') || 'سجل المخالفات'}:</h4>
                    <ul class="text-sm space-y-1 text-surface-500">
                        ${cheatingLog.map(v => `<li>• ${v.timestamp}: ${v.type}</li>`).join('')}
                    </ul>
                </div>
                <button onclick="window.location.hash='quiz'; window.location.reload();" 
                    class="w-full bg-surface-600 text-white px-6 py-3 rounded-xl font-bold">
                    ${window.t?.('btn-back') || 'العودة'}
                </button>
            </div>
        `;
    }
};

// تفعيل وضع ملء الشاشة
const enterFullscreen = () => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(() => { });
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
    }
};

// الخروج من ملء الشاشة
const exitFullscreen = () => {
    if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => { });
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    }
};

// معالجات أحداث مراقبة الغش
const handleVisibilityChange = () => {
    if (isQuizActive && document.hidden) {
        logViolation('تبديل التاب أو النافذة');
    }
};

const handleWindowBlur = () => {
    if (isQuizActive) {
        logViolation('فقدان التركيز على النافذة');
    }
};

const handleFullscreenChange = () => {
    if (isQuizActive && !document.fullscreenElement) {
        logViolation('الخروج من وضع ملء الشاشة');
        // محاولة إعادة الـ fullscreen
        setTimeout(() => {
            if (isQuizActive) enterFullscreen();
        }, 500);
    }
};

const handleKeydown = (e) => {
    if (!isQuizActive) return;

    // منع اختصارات لوحة المفاتيح
    if (e.ctrlKey || e.metaKey) {
        if (['c', 'v', 'x', 'a', 'p', 's', 'u'].includes(e.key.toLowerCase())) {
            e.preventDefault();
            logViolation(`محاولة استخدام اختصار ${e.key.toUpperCase()}`);
        }
    }

    // منع F12 و DevTools
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
        e.preventDefault();
        logViolation('محاولة فتح أدوات المطور');
    }

    // منع Escape
    if (e.key === 'Escape') {
        e.preventDefault();
    }
};

const handleContextMenu = (e) => {
    if (isQuizActive) {
        e.preventDefault();
        logViolation('محاولة استخدام القائمة السياقية');
    }
};

const handleCopy = (e) => {
    if (isQuizActive) {
        e.preventDefault();
        logViolation('محاولة نسخ المحتوى');
    }
};

const handlePaste = (e) => {
    if (isQuizActive) {
        e.preventDefault();
        logViolation('محاولة لصق محتوى');
    }
};

// تفعيل نظام مراقبة الغش
const activateAntiCheat = () => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);

    // منع السحب والإفلات
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
};

// إزالة مستمعات الأحداث
const removeAntiCheatListeners = () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleWindowBlur);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('contextmenu', handleContextMenu);
    document.removeEventListener('copy', handleCopy);
    document.removeEventListener('paste', handlePaste);

    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
};

// ============================================================
// توجيه رابط الأدمن إلى دالة الـ CMS الموجودة بالأسفل
// ============================================================
export const openQuizAdminView = async () => {
    openQuizCmsMain();
};

// ============================================================
// 1. عرض الكويزات للطالب (User View)
// ============================================================
export const loadQuizQuestionsForUser = async () => {
    // إخفاء جميع الأقسام الأخرى
    ['study-sections-container', 'admin-view-area', 'subsection-viewer', 'scores-section', 'leaderboard-section', 'assignments-section', 'home-screen', 'profile-section', 'admin-settings-section'].forEach(id => document.getElementById(id)?.classList.add('hidden'));

    document.getElementById('quiz-section').classList.remove('hidden');
    const container = document.getElementById('quiz-area');

    // التحقق من التوثيق
    if (!window.isUserVerified) {
        container.innerHTML = `
            <div class="col-span-full p-10 bg-orange-50 dark:bg-orange-900/20 rounded-3xl text-center border-2 border-orange-200 dark:border-orange-800">
                <i class="fas fa-lock text-5xl text-orange-500 mb-4 block"></i>
                <h3 class="font-bold text-orange-700 dark:text-orange-400 text-xl mb-2">${window.t?.('quizzes-restricted') || 'الاختبارات محظورة'}</h3>
                <p class="text-orange-600 dark:text-orange-400">${window.t?.('wait-verification') || 'يرجى انتظار توثيق حسابك للوصول للاختبارات'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `<div class="text-center p-10 col-span-full"><i class="fas fa-spinner fa-spin text-3xl text-primary-600"></i><p class="mt-2 text-surface-500">${window.t?.('searching-quizzes') || 'جاري البحث عن اختبارات كليتك...'}</p></div>`;

    const user = auth.currentUser;
    if (!user) return;

    // جلب بيانات الطالب للتحقق من الكلية
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;

    if (!userData || !userData.collegeId) {
        container.innerHTML = `<div class="col-span-full text-center p-10 bg-white dark:bg-surface-800 rounded-xl shadow"><i class="fas fa-exclamation-triangle text-3xl text-yellow-500 mb-3"></i><p class="font-bold dark:text-white">${window.t?.('update-college-first') || 'يرجى تحديث بيانات كليتك في الملف الشخصي أولاً.'}</p></div>`;
        return;
    }

    try {
        const q = query(collection(db, "quizzes"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        container.innerHTML = '';
        if (snap.empty) {
            container.innerHTML = `<div class="col-span-full text-center text-surface-500 p-10">${window.t?.('no-quizzes-available') || 'لا توجد اختبارات متاحة حالياً.'}</div>`;
            return;
        }

        let hasQuizzes = false;

        for (const d of snap.docs) {
            const quiz = d.data();
            // الفلترة حسب الكلية والقسم
            const matchCollege = quiz.collegeId === userData.collegeId;
            const matchDept = (quiz.departmentId === 'all') || (quiz.departmentId === userData.departmentId);

            if (matchCollege && matchDept) {
                hasQuizzes = true;
                const scoreId = `${user.uid}_${d.id}`;
                const scoreSnap = await getDoc(doc(db, "user_scores_log", scoreId));
                const previousScore = scoreSnap.exists() ? scoreSnap.data().score : null;
                const attemptsDone = scoreSnap.exists() ? (scoreSnap.data().attempts || 0) : 0;
                const isLocked = (quiz.maxAttempts > 0 && attemptsDone >= quiz.maxAttempts);

                const div = document.createElement('div');
                div.className = `bg-white dark:bg-surface-800 p-6 rounded-xl shadow-md border-r-4 ${isLocked ? 'border-surface-400 opacity-75' : 'border-primary-500'} mb-4 transform transition hover:scale-[1.01] flex flex-col justify-between`;

                div.innerHTML = `
                    <div>
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <h3 class="text-xl font-bold dark:text-white mb-1 line-clamp-1">${quiz.title}</h3>
                                <span class="text-[10px] bg-primary-100 text-primary-700 px-2 py-1 rounded dark:bg-primary-900/30 dark:text-primary-300 font-bold">${quiz.sectionTitle || (window.t?.('general-activity') || 'نشاط عام')}</span>
                            </div>
                            <div class="text-left min-w-[50px]">
                                ${previousScore !== null ? `<span class="block ${previousScore >= 50 ? 'text-accent-600' : 'text-red-600'} font-bold text-lg">${previousScore}%</span>` : ''}
                            </div>
                        </div>
                        <p class="text-surface-600 dark:text-surface-300 mt-2 text-sm line-clamp-2 h-10">${quiz.description || (window.t?.('no-description') || 'لا يوجد وصف.')}</p>
                        <div class="flex items-center gap-4 mt-4 text-xs text-surface-500 dark:text-surface-400 border-t dark:border-surface-700 pt-3">
                            <span class="flex items-center gap-1"><i class="far fa-clock"></i> ${quiz.timeLimit} ${window.t?.('minutes') || 'دقيقة'}</span>
                            <span class="flex items-center gap-1"><i class="fas fa-redo"></i> ${window.t?.('attempts') || 'المحاولات'}: ${attemptsDone} / ${quiz.maxAttempts === 0 ? '∞' : quiz.maxAttempts}</span>
                        </div>
                    </div>
                    <button id="btn-start-${d.id}" class="mt-4 w-full py-2 rounded-lg font-bold transition shadow-sm flex items-center justify-center gap-2 ${isLocked ? 'bg-surface-300 text-surface-500 cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-700'}" ${isLocked ? 'disabled' : ''}>
                        ${isLocked ? `<i class="fas fa-lock"></i> ${window.t?.('attempts-ended') || 'انتهت المحاولات'}` : (previousScore !== null ? `<i class="fas fa-sync-alt"></i> ${window.t?.('retry-quiz') || 'إعادة الاختبار'}` : `<i class="fas fa-play"></i> ${window.t?.('start-quiz') || 'بدء الاختبار'}`)}
                    </button>
                `;
                container.appendChild(div);
                if (!isLocked) {
                    document.getElementById(`btn-start-${d.id}`).onclick = () => startQuiz(d.id, quiz);
                }
            }
        }

        if (!hasQuizzes) {
            container.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center text-center p-10 bg-white dark:bg-surface-800 rounded-xl"><i class="fas fa-clipboard-list text-6xl text-surface-200 mb-4"></i><p class="text-surface-500 font-bold">${window.t?.('no-quizzes-for-dept') || 'لا توجد اختبارات متاحة لقسمك'} (${userData.departmentId}).</p></div>`;
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p class="text-center text-red-500 font-bold col-span-full">${window.t?.('error-loading-exams') || 'حدث خطأ في تحميل الامتحانات.'}</p>`;
    }
};

// ============================================================
// 2. تشغيل الكويز (Quiz Engine) مع نظام مراقبة الغش
// ============================================================
const startQuiz = async (quizId, quizData) => {
    const container = document.getElementById('quiz-area');
    container.className = "col-span-full";

    // إعادة تعيين متغيرات مراقبة الغش
    cheatingViolations = 0;
    cheatingLog = [];
    currentQuizId = quizId;
    isQuizActive = true;

    // عرض تحذير قبل البدء
    container.innerHTML = `
        <div class="max-w-lg mx-auto bg-yellow-50 dark:bg-yellow-900/20 p-8 rounded-2xl shadow-xl text-center border-2 border-yellow-400">
            <div class="text-6xl mb-4">⚠️</div>
            <h2 class="text-2xl font-black text-yellow-700 dark:text-yellow-400 mb-4">تنبيهات مهمة قبل البدء</h2>
            <ul class="text-right text-surface-600 dark:text-surface-300 space-y-3 mb-6">
                <li class="flex items-center gap-2"><i class="fas fa-expand text-yellow-500"></i> سيتم تفعيل وضع ملء الشاشة</li>
                <li class="flex items-center gap-2"><i class="fas fa-ban text-yellow-500"></i> ممنوع تبديل التاب أو النافذة</li>
                <li class="flex items-center gap-2"><i class="fas fa-copy text-yellow-500"></i> ممنوع النسخ واللصق</li>
                <li class="flex items-center gap-2"><i class="fas fa-exclamation-triangle text-red-500"></i> ${maxViolations} مخالفات = إلغاء الاختبار</li>
            </ul>
            <button id="start-quiz-btn" class="w-full bg-gradient-to-r from-primary-600 to-primary-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:from-primary-700 hover:to-primary-700 shadow-lg transition">
                <i class="fas fa-play ml-2"></i> بدء الاختبار
            </button>
        </div>
    `;

    document.getElementById('start-quiz-btn').onclick = async () => {
        // تفعيل ملء الشاشة ونظام مراقبة الغش
        enterFullscreen();
        activateAntiCheat();

        container.innerHTML = '<div class="text-center p-20"><i class="fas fa-spinner fa-spin text-4xl text-primary-600"></i><p class="mt-4 text-lg dark:text-white">جاري تجهيز ورقة الامتحان...</p></div>';

        try {
            const qColl = collection(db, "quizzes", quizId, "questions");
            const qSnap = await getDocs(qColl);

            if (qSnap.empty) {
                container.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6";
                window.showToast?.("عذراً، هذا الاختبار لا يحتوي على أسئلة بعد.");
                loadQuizQuestionsForUser();
                return;
            }

            let questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (quizData.randomize) questions = questions.sort(() => Math.random() - 0.5);

            let currentQIndex = 0;
            let userAnswers = {};
            let timeLeft = quizData.timeLimit * 60;

            const renderQuestion = () => {
                const q = questions[currentQIndex];

                // بناء أرقام الأسئلة
                const questionNumbers = questions.map((_, idx) => {
                    const isAnswered = userAnswers[questions[idx].id];
                    const isCurrent = idx === currentQIndex;
                    return `<button onclick="window.goToQ(${idx})" 
                        class="w-8 h-8 rounded-full text-xs font-bold transition
                        ${isCurrent ? 'bg-primary-600 text-white ring-2 ring-primary-300' :
                            isAnswered ? 'bg-accent-500 text-white' : 'bg-surface-200 dark:bg-surface-600 text-surface-600 dark:text-surface-300'}"
                    >${idx + 1}</button>`;
                }).join('');

                container.innerHTML = `
                <div class="max-w-4xl mx-auto bg-white dark:bg-surface-800 rounded-2xl shadow-2xl overflow-hidden border border-surface-200 dark:border-surface-700 animate-fade-in">
                    <div class="bg-gradient-to-r from-primary-600 to-primary-600 text-white p-4 md:p-6 shadow-md">
                        <div class="flex justify-between items-center mb-4">
                            <div><h3 class="font-bold text-xl">${quizData.title}</h3><p class="text-primary-200 text-xs mt-1">السؤال ${currentQIndex + 1} من ${questions.length}</p></div>
                            <div class="flex items-center gap-3">
                                ${cheatingViolations > 0 ? `<span class="bg-red-500/80 px-3 py-1 rounded-full text-xs">⚠️ ${cheatingViolations}/${maxViolations}</span>` : ''}
                                <div class="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg"><i class="fas fa-stopwatch animate-pulse"></i><span id="timer-display" class="font-mono text-2xl font-bold tracking-widest">00:00</span></div>
                            </div>
                        </div>
                        <div class="flex gap-2 flex-wrap justify-center">${questionNumbers}</div>
                    </div>
                    <div class="p-6 md:p-10">
                        <div class="w-full bg-surface-200 dark:bg-surface-700 rounded-full h-2 mb-8"><div class="bg-primary-500 h-2 rounded-full transition-all duration-500" style="width: ${((currentQIndex + 1) / questions.length) * 100}%"></div></div>
                        <h2 class="text-2xl font-bold mb-8 dark:text-white leading-relaxed text-right">${q.text}</h2>
                        <div class="space-y-4" id="quiz-options-container">
                            ${q.options.map((opt, optIdx) => {
                    // دالة لتحويل الأحرف الخاصة
                    const escapeHtml = (str) => {
                        if (!str) return '';
                        return String(str)
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, '&#039;');
                    };
                    const safeOptAttr = escapeHtml(opt);
                    const displayOpt = escapeHtml(opt);
                    const isSelected = userAnswers[q.id] === opt;
                    return `
                                <label class="flex items-center p-4 border-2 rounded-xl cursor-pointer hover:bg-primary-50 dark:hover:bg-surface-700 transition-all duration-200 group ${isSelected ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-500' : 'border-surface-200 dark:border-surface-600'}">
                                    <div class="relative flex items-center justify-center w-6 h-6 rounded-full border-2 border-surface-300 group-hover:border-primary-500 mr-3 ml-4 transition-colors flex-shrink-0">
                                        ${isSelected ? '<div class="w-3 h-3 bg-primary-600 rounded-full"></div>' : ''}
                                        <input type="radio" name="q-${q.id}" value="${optIdx}" class="hidden quiz-option-input" data-qid="${q.id}" data-optidx="${optIdx}" ${isSelected ? 'checked' : ''}>
                                    </div>
                                    <span class="text-base md:text-lg text-surface-700 dark:text-surface-200 font-medium select-none leading-relaxed">${displayOpt}</span>
                                </label>`;
                }).join('')}
                        </div>
                    </div>
                    <div class="p-4 md:p-6 bg-surface-50 dark:bg-surface-900 border-t dark:border-surface-700 flex flex-wrap justify-between items-center gap-3">
                        <button onclick="window.prevQ()" class="px-4 md:px-6 py-2 rounded-lg text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 font-bold transition text-sm md:text-base ${currentQIndex === 0 ? 'invisible' : ''}"><i class="fas fa-arrow-right ml-1 md:ml-2"></i> السابق</button>
                        ${currentQIndex === questions.length - 1
                        ? `<button onclick="window.submitQuizNow()" class="flex-1 md:flex-none px-6 md:px-8 py-3 md:py-4 bg-gradient-to-r from-accent-600 to-accent-600 text-white rounded-xl font-black text-base md:text-lg hover:from-accent-700 hover:to-accent-700 shadow-xl transition transform hover:-translate-y-1 animate-pulse">تسليم الإجابة <i class="fas fa-check mr-2"></i></button>`
                        : `<button onclick="window.nextQ()" class="px-6 md:px-8 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 shadow-lg transition transform hover:-translate-y-1">التالي <i class="fas fa-arrow-left mr-2"></i></button>`
                    }
                    </div>
                </div>`;
                updateTimerDisplay();
            };

            const updateTimerDisplay = () => {
                const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
                const s = (timeLeft % 60).toString().padStart(2, '0');
                const el = document.getElementById('timer-display');
                if (el) {
                    el.textContent = `${m}:${s}`;
                    if (timeLeft < 60) el.classList.add('text-red-400');
                }
            };

            clearInterval(quizTimerInterval);
            quizTimerInterval = setInterval(() => {
                timeLeft--;
                updateTimerDisplay();
                if (timeLeft <= 0) {
                    clearInterval(quizTimerInterval);
                    window.showToast?.("⏰ انتهى الوقت المحدد للاختبار!");
                    window.submitQuizNow();
                }
            }, 1000);

            // تفعيل اختيار الإجابات عبر النقر على الـ label
            window.selectAnswer = (qId, val) => { userAnswers[qId] = val; renderQuestion(); };

            // Event delegation for quiz options
            document.addEventListener('click', function (e) {
                const label = e.target.closest('label');
                if (label && label.querySelector('.quiz-option-input')) {
                    const input = label.querySelector('.quiz-option-input');
                    const qId = input.dataset.qid;
                    const optIdx = parseInt(input.value);
                    const currentQ = questions[currentQIndex];
                    if (currentQ && currentQ.options[optIdx] !== undefined) {
                        userAnswers[qId] = currentQ.options[optIdx];
                        renderQuestion();
                    }
                }
            });

            window.nextQ = () => { if (currentQIndex < questions.length - 1) { currentQIndex++; renderQuestion(); } };
            window.prevQ = () => { if (currentQIndex > 0) { currentQIndex--; renderQuestion(); } };
            window.goToQ = (idx) => { currentQIndex = idx; renderQuestion(); };

            window.submitQuizNow = async () => {
                clearInterval(quizTimerInterval);
                isQuizActive = false;
                removeAntiCheatListeners();
                exitFullscreen();

                let score = 0; let correctCount = 0;
                questions.forEach(q => { if (userAnswers[q.id] === q.correctAnswer) correctCount++; });
                score = Math.round((correctCount / questions.length) * 100);

                container.innerHTML = '<div class="text-center p-20"><div class="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-accent-500 mx-auto mb-4"></div><h2 class="text-2xl font-bold dark:text-white">جاري تصحيح الإجابات...</h2></div>';

                try {
                    const user = auth.currentUser;
                    if (!user) {
                        throw new Error('يجب تسجيل الدخول أولاً');
                    }

                    let userCollege = 'unknown';
                    try {
                        const userDocSnap = await getDoc(doc(db, "users", user.uid));
                        userCollege = userDocSnap.exists() ? userDocSnap.data().collegeId : 'unknown';
                    } catch (e) {
                        console.warn('Could not get user college:', e);
                    }

                    // حفظ النتيجة
                    await addDoc(collection(db, "user_scores"), {
                        userId: user.uid,
                        userName: user.displayName || 'مستخدم',
                        userPhoto: user.photoURL || '',
                        quizId: quizId,
                        quizTitle: quizData.title,
                        sectionId: quizData.sectionId || '',
                        sectionTitle: quizData.sectionTitle || 'عام',
                        collegeId: userCollege,
                        score: score,
                        total: 100,
                        correct: correctCount,
                        questionsCount: questions.length,
                        date: new Date(),
                        type: 'quiz',
                        // حفظ تفاصيل الامتحان للمراجعة لاحقاً
                        examDetails: questions.map(q => ({
                            questionId: q.id,
                            questionText: q.text,
                            options: q.options,
                            userAnswer: userAnswers[q.id] || null,
                            correctAnswer: q.correctAnswer,
                            isCorrect: userAnswers[q.id] === q.correctAnswer
                        }))
                    });

                    // تحديث سجل المحاولات
                    const logRef = doc(db, "user_scores_log", `${user.uid}_${quizId}`);
                    try {
                        const logSnap = await getDoc(logRef);

                        if (logSnap.exists()) {
                            const attempts = (logSnap.data().attempts || 0) + 1;
                            const oldScore = logSnap.data().score || 0;
                            await updateDoc(logRef, {
                                score: Math.max(oldScore, score),
                                attempts,
                                lastDate: new Date()
                            });
                        } else {
                            await setDoc(logRef, {
                                userId: user.uid,
                                quizId: quizId,
                                score: score,
                                attempts: 1,
                                lastDate: new Date()
                            });
                            // تحديث الـ streak
                            try {
                                await setDoc(doc(db, "users", user.uid), { streak: increment(1) }, { merge: true });
                            } catch (e) {
                                console.warn('Could not update streak:', e);
                            }
                        }
                    } catch (logError) {
                        console.warn('Could not update log:', logError);
                    }

                    // بناء تفاصيل الإجابات
                    let answersReviewHtml = questions.map((q, idx) => {
                        const userAnswer = userAnswers[q.id] || 'لم يجب';
                        const isCorrect = userAnswer === q.correctAnswer;
                        return `
                            <div class="p-3 rounded-xl ${isCorrect ? 'bg-accent-50 dark:bg-accent-900/20 border-r-4 border-accent-500' : 'bg-red-50 dark:bg-red-900/20 border-r-4 border-red-500'}">
                                <div class="flex justify-between items-start mb-2">
                                    <span class="font-bold text-sm ${isCorrect ? 'text-accent-600' : 'text-red-600'}">${isCorrect ? '✅' : '❌'} س${idx + 1}</span>
                                </div>
                                <p class="text-sm text-surface-700 dark:text-surface-300 mb-2">${q.text}</p>
                                <div class="text-xs space-y-1">
                                    <p class="text-surface-500">إجابتك: <span class="${isCorrect ? 'text-accent-600 font-bold' : 'text-red-600 font-bold'}">${userAnswer}</span></p>
                                    ${!isCorrect ? `<p class="text-accent-600">الإجابة الصحيحة: <span class="font-bold">${q.correctAnswer}</span></p>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('');

                    container.innerHTML = `
                    <div class="max-w-2xl mx-auto bg-white dark:bg-surface-800 rounded-2xl shadow-2xl overflow-hidden mt-10 animate-fade-in">
                        <div class="p-8 text-center border-b-8 ${score >= 50 ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20' : 'border-red-500 bg-red-50 dark:bg-red-900/20'}">
                            <div class="text-7xl mb-4">${score >= 90 ? '🏆' : (score >= 50 ? '✅' : '💪')}</div>
                            <h2 class="text-4xl font-black ${score >= 50 ? 'text-accent-600' : 'text-red-600'}">${score}%</h2>
                            <p class="text-surface-600 dark:text-surface-300 mt-2">${correctCount} صحيح من ${questions.length} سؤال</p>
                        </div>
                        
                        <div class="p-6">
                            <h3 class="font-bold text-lg dark:text-white mb-4"><i class="fas fa-list-check text-primary-500"></i> مراجعة الإجابات</h3>
                            <div class="space-y-3 max-h-64 overflow-y-auto">
                                ${answersReviewHtml}
                            </div>
                        </div>
                        
                        <div class="p-6 bg-surface-50 dark:bg-surface-900">
                            <button onclick="window.location.hash='quiz'; window.location.reload();" 
                                class="w-full bg-primary-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-primary-700 shadow-lg transition">
                                العودة لقائمة الاختبارات
                            </button>
                        </div>
                    </div>`;
                } catch (e) {
                    console.error("Error saving score:", e);
                    container.innerHTML = `
                        <div class="max-w-md mx-auto text-center p-10 bg-white dark:bg-surface-800 rounded-2xl shadow-xl mt-10">
                            <div class="text-5xl mb-4">⚠️</div>
                            <h2 class="text-xl font-bold text-red-600 mb-2">حدث خطأ في الحفظ</h2>
                            <p class="text-surface-600 dark:text-surface-300 mb-2">نتيجتك: <span class="font-black text-2xl ${score >= 50 ? 'text-accent-600' : 'text-red-600'}">${score}%</span></p>
                            <p class="text-surface-500 text-sm mb-4">${correctCount} صحيح من ${questions.length}</p>
                            <p class="text-xs text-red-400 mb-4">${e.message || 'خطأ غير معروف'}</p>
                            <button onclick="window.location.hash='quiz'; window.location.reload();" class="w-full bg-surface-600 text-white px-4 py-3 rounded-xl font-bold">العودة</button>
                        </div>`;
                }
            };
            renderQuestion();
        } catch (e) {
            console.error(e);
            isQuizActive = false;
            removeAntiCheatListeners();
            exitFullscreen();
            container.className = "col-span-full";
            container.innerHTML = '<p class="text-center text-red-500">حدث خطأ غير متوقع أثناء بدء الاختبار.</p>';
        }
    };
};

// ============================================================
// 3. لوحة تحكم الأدمن للكويزات (تمت إضافتها هنا لإصلاح المشكلة)
// ============================================================
export const openQuizCmsMain = async () => {
    document.getElementById('admin-view-area').classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer'].forEach(id => document.getElementById(id).classList.add('hidden'));

    document.getElementById('admin-view-title').textContent = '📝 إدارة الاختبارات والكويزات';

    // تحضير خيارات الكلية
    const colOptions = UNIVERSITY_STRUCTURE.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    document.getElementById('admin-view-content').innerHTML = `
        <div class="mb-10 bg-white dark:bg-surface-800 p-8 rounded-[2.5rem] shadow-xl border-t-8 border-primary-600 animate-fade-in">
            <h3 class="font-black text-2xl mb-6 dark:text-white flex items-center gap-2"><i class="fas fa-plus-circle text-primary-600"></i> إنشاء اختبار جديد</h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input type="text" id="new-quiz-title" placeholder="عنوان الاختبار (مثال: كويز فيزياء 1)" class="p-4 border rounded-2xl dark:bg-surface-700 dark:text-white font-bold outline-none">
                <input type="number" id="new-quiz-time" placeholder="المدة بالدقائق" class="p-4 border rounded-2xl dark:bg-surface-700 dark:text-white font-bold outline-none">
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <select id="admin-quiz-col" class="p-4 border rounded-2xl dark:bg-surface-700 dark:text-white font-bold outline-none"><option value="">-- اختر الكلية --</option>${colOptions}</select>
                <select id="admin-quiz-dept" class="p-4 border rounded-2xl dark:bg-surface-700 dark:text-white font-bold outline-none" disabled><option value="all">كل الأقسام</option></select>
            </div>

            <div class="flex gap-4 mb-6">
                <label class="flex items-center gap-2 cursor-pointer bg-surface-50 dark:bg-surface-700 px-4 py-2 rounded-xl border dark:border-surface-600">
                    <input type="checkbox" id="quiz-random" class="w-5 h-5 accent-primary-600"> <span class="dark:text-white font-bold text-sm">ترتيب عشوائي للأسئلة</span>
                </label>
                <input type="number" id="quiz-attempts" placeholder="المحاولات (0 = لا نهائي)" class="w-40 p-2 border rounded-xl dark:bg-surface-700 dark:text-white text-center font-bold text-sm">
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button id="create-quiz-btn" class="w-full bg-primary-600 text-white py-4 rounded-2xl font-black hover:bg-primary-700 transition shadow-lg transform hover:-translate-y-1"><i class="fas fa-plus ml-2"></i>إنشاء اختبار يدوي</button>
                <button id="ai-quiz-btn" class="w-full bg-gradient-to-r from-primary-600 to-primary-600 text-white py-4 rounded-2xl font-black hover:from-primary-700 hover:to-primary-700 transition shadow-lg transform hover:-translate-y-1"><i class="fas fa-robot ml-2"></i>توليد بالذكاء الاصطناعي 🤖</button>
            </div>
        </div>
        
        <div class="flex justify-between items-center mb-4 px-2">
            <h3 class="font-black text-2xl dark:text-white">قائمة الاختبارات الحالية</h3>
            <div class="flex gap-2">
                <button onclick="window.openCheatingLogs()" class="bg-gradient-to-r from-red-600 to-pink-600 text-white px-5 py-2 rounded-xl font-bold hover:from-red-700 hover:to-pink-700 transition flex items-center gap-2 shadow-lg">
                    <i class="fas fa-user-secret"></i> سجل الغش
                </button>
                <button onclick="window.openQuizResults()" class="bg-gradient-to-r from-accent-600 to-accent-600 text-white px-5 py-2 rounded-xl font-bold hover:from-accent-700 hover:to-accent-700 transition flex items-center gap-2 shadow-lg">
                    <i class="fas fa-chart-pie"></i> النتائج
                </button>
            </div>
        </div>
        <div id="admin-quizzes-list" class="grid grid-cols-1 md:grid-cols-2 gap-4 pb-20"></div>
        
        <div id="questions-modal" class="hidden fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <div class="bg-white dark:bg-surface-800 w-full max-w-4xl h-[90vh] rounded-[2rem] flex flex-col relative shadow-2xl border border-surface-700">
                <div class="p-6 border-b dark:border-surface-700 flex justify-between items-center bg-surface-50 dark:bg-surface-900 rounded-t-[2rem]">
                    <h2 class="text-2xl font-black dark:text-white flex items-center gap-2"><i class="fas fa-list-ol text-primary-600"></i> أسئلة الاختبار</h2>
                    <button onclick="document.getElementById('questions-modal').classList.add('hidden')" class="w-10 h-10 rounded-full bg-red-100 text-red-600 hover:bg-red-600 hover:text-white transition flex items-center justify-center"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="flex-1 overflow-y-auto p-6 bg-surface-100 dark:bg-surface-800/50 custom-scrollbar">
                    <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-sm mb-6 border border-surface-200 dark:border-surface-700">
                        <h4 class="font-bold mb-4 dark:text-white border-b pb-2">إضافة سؤال جديد</h4>
                        <textarea id="q-text" class="w-full p-3 border rounded-xl mb-3 dark:bg-surface-700 dark:text-white font-bold" placeholder="نص السؤال..."></textarea>
                        <div class="grid grid-cols-2 gap-3 mb-3">
                            <input type="text" id="opt-1" placeholder="الخيار الأول" class="p-2 border rounded-lg dark:bg-surface-700 dark:text-white">
                            <input type="text" id="opt-2" placeholder="الخيار الثاني" class="p-2 border rounded-lg dark:bg-surface-700 dark:text-white">
                            <input type="text" id="opt-3" placeholder="الخيار الثالث" class="p-2 border rounded-lg dark:bg-surface-700 dark:text-white">
                            <input type="text" id="opt-4" placeholder="الخيار الرابع" class="p-2 border rounded-lg dark:bg-surface-700 dark:text-white">
                        </div>
                        <div class="mb-4">
                            <label class="text-xs font-bold text-surface-500 uppercase">الإجابة الصحيحة:</label>
                            <select id="correct-opt" class="w-full p-2 border rounded-lg dark:bg-surface-700 dark:text-white font-bold">
                                <option value="1">الخيار الأول</option>
                                <option value="2">الخيار الثاني</option>
                                <option value="3">الخيار الثالث</option>
                                <option value="4">الخيار الرابع</option>
                            </select>
                        </div>
                        <button id="add-q-btn" class="w-full bg-accent-600 text-white py-3 rounded-xl font-bold hover:bg-accent-700 transition">إضافة السؤال للقائمة</button>
                    </div>
                    <div id="questions-list-content" class="space-y-3"></div>
                </div>
            </div>
        </div>
    `;

    // تفعيل القوائم
    const colSelect = document.getElementById('admin-quiz-col');
    const deptSelect = document.getElementById('admin-quiz-dept');
    colSelect.onchange = () => {
        const colId = colSelect.value;
        const selectedCol = UNIVERSITY_STRUCTURE.find(c => c.id === colId);
        deptSelect.innerHTML = '<option value="all">كل الأقسام</option>';
        deptSelect.disabled = !colId;
        if (selectedCol) selectedCol.departments.forEach(d => deptSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`);
    };

    // زر الإنشاء
    document.getElementById('create-quiz-btn').onclick = async () => {
        const title = document.getElementById('new-quiz-title').value;
        const time = parseInt(document.getElementById('new-quiz-time').value);
        const col = colSelect.value;

        if (!title || !time || !col) return window.showToast?.("البيانات ناقصة");

        await addDoc(collection(db, "quizzes"), {
            title, timeLimit: time, collegeId: col, departmentId: deptSelect.value,
            randomize: document.getElementById('quiz-random').checked,
            maxAttempts: parseInt(document.getElementById('quiz-attempts').value) || 0,
            createdAt: new Date()
        });
        window.showToast?.("✅ تم إنشاء الاختبار");
        openQuizCmsMain();
    };

    // زر توليد الكويز بالـ AI
    document.getElementById('ai-quiz-btn').onclick = () => {
        window.openAIQuizGenerator();
    };

    // تحميل القائمة
    const list = document.getElementById('admin-quizzes-list');
    const snap = await getDocs(query(collection(db, "quizzes"), orderBy("createdAt", "desc"), limit(100)));

    list.innerHTML = '';
    snap.forEach(d => {
        const q = d.data();
        list.innerHTML += `
            <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-sm border-l-8 border-primary-500 flex justify-between items-center group hover:shadow-lg transition">
                <div>
                    <h4 class="font-black text-lg dark:text-white">${q.title}</h4>
                    <p class="text-xs text-surface-500 font-bold mt-1 bg-surface-100 dark:bg-surface-700 px-2 py-1 rounded w-fit">${q.collegeId} / ${q.departmentId}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.editQuiz('${d.id}')" class="bg-yellow-50 text-yellow-600 w-10 h-10 rounded-xl hover:bg-yellow-500 hover:text-white transition flex items-center justify-center" title="تعديل"><i class="fas fa-pen"></i></button>
                    <button onclick="window.openQuizResults('${d.id}', '${q.title.replace(/'/g, "\\'")}')" class="bg-accent-50 text-accent-600 w-10 h-10 rounded-xl hover:bg-accent-600 hover:text-white transition flex items-center justify-center" title="النتائج"><i class="fas fa-chart-bar"></i></button>
                    <button onclick="window.manageQuestions('${d.id}')" class="bg-primary-50 text-primary-600 w-10 h-10 rounded-xl hover:bg-primary-600 hover:text-white transition flex items-center justify-center" title="الأسئلة"><i class="fas fa-list"></i></button>
                    <button onclick="window.deleteQuiz('${d.id}')" class="bg-red-50 text-red-600 w-10 h-10 rounded-xl hover:bg-red-600 hover:text-white transition flex items-center justify-center" title="حذف"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
    });
};

// ============================================================
// نتائج الكويزات - Quiz Results Dashboard
// ============================================================
export const openQuizResultsDashboard = async (quizId = null, quizTitle = '') => {
    document.getElementById('admin-view-area').classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer'].forEach(id => document.getElementById(id)?.classList.add('hidden'));

    document.getElementById('admin-view-title').textContent = '📊 نتائج الاختبارات';

    // تحضير خيارات الكليات
    const colOptions = UNIVERSITY_STRUCTURE.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    // تحميل قائمة الكويزات
    const quizzesSnap = await getDocs(query(collection(db, "quizzes"), orderBy("createdAt", "desc")));
    let quizOptions = '<option value="">كل الاختبارات</option>';
    quizzesSnap.forEach(d => {
        const q = d.data();
        quizOptions += `<option value="${d.id}" ${d.id === quizId ? 'selected' : ''}>${q.title}</option>`;
    });

    document.getElementById('admin-view-content').innerHTML = `
        <!-- Filters -->
        <div class="bg-white dark:bg-surface-800 p-6 rounded-2xl shadow-lg mb-6 border-t-4 border-accent-500">
            <h3 class="font-black text-lg mb-4 dark:text-white flex items-center gap-2"><i class="fas fa-filter text-accent-500"></i> فلترة النتائج</h3>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <select id="filter-quiz" class="p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-bold">
                    ${quizOptions}
                </select>
                <select id="filter-college" class="p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-bold">
                    <option value="">كل الكليات</option>
                    ${colOptions}
                </select>
                <select id="filter-dept" class="p-3 border rounded-xl dark:bg-surface-700 dark:text-white font-bold" disabled>
                    <option value="">كل الأقسام</option>
                </select>
                <button id="apply-filter-btn" class="bg-accent-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-accent-700 transition flex items-center justify-center gap-2">
                    <i class="fas fa-search"></i> عرض النتائج
                </button>
            </div>
        </div>
        
        <!-- Stats Cards -->
        <div id="results-stats" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"></div>
        
        <!-- Export Button -->
        <div class="flex justify-between items-center mb-4 flex-wrap gap-3">
            <h3 class="font-black text-xl dark:text-white">📋 جدول النتائج</h3>
            <div class="flex gap-2">
                <button id="reset-grades-btn" class="bg-gradient-to-r from-red-600 to-rose-600 text-white px-5 py-2 rounded-xl font-bold hover:from-red-700 hover:to-rose-700 transition flex items-center gap-2 shadow-lg">
                    <i class="fas fa-trash-alt"></i> تصفير الدرجات
                </button>
                <button id="export-excel-btn" class="bg-gradient-to-r from-accent-600 to-accent-600 text-white px-5 py-2 rounded-xl font-bold hover:from-accent-700 hover:to-accent-700 transition flex items-center gap-2 shadow-lg">
                    <i class="fas fa-file-excel"></i> تصدير Excel
                </button>
            </div>
        </div>
        
        <!-- Results Table -->
        <div class="bg-white dark:bg-surface-800 rounded-2xl shadow-lg overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full" id="results-table">
                    <thead class="bg-surface-100 dark:bg-surface-700">
                        <tr>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">#</th>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">الطالب</th>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">الاختبار</th>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">المحاولة</th>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">الدرجة</th>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">الصحيحة</th>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">التاريخ</th>
                        </tr>
                    </thead>
                    <tbody id="results-tbody" class="divide-y dark:divide-surface-700"></tbody>
                </table>
            </div>
            <div id="results-loading" class="p-10 text-center">
                <i class="fas fa-spinner fa-spin text-3xl text-accent-500"></i>
                <p class="mt-2 text-surface-500">جاري تحميل النتائج...</p>
            </div>
            <div id="results-empty" class="hidden p-10 text-center">
                <i class="fas fa-inbox text-5xl text-surface-300 mb-4"></i>
                <p class="text-surface-500 font-bold">لا توجد نتائج</p>
            </div>
        </div>
    `;

    // تفعيل فلترة الأقسام
    const colSelect = document.getElementById('filter-college');
    const deptSelect = document.getElementById('filter-dept');
    colSelect.onchange = () => {
        const colId = colSelect.value;
        deptSelect.innerHTML = '<option value="">كل الأقسام</option>';
        deptSelect.disabled = !colId;
        if (colId) {
            const col = UNIVERSITY_STRUCTURE.find(c => c.id === colId);
            if (col) col.departments.forEach(d => deptSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`);
        }
    };

    // دالة تحميل النتائج
    const loadResults = async () => {
        const quizFilter = document.getElementById('filter-quiz').value;
        const collegeFilter = document.getElementById('filter-college').value;
        const deptFilter = document.getElementById('filter-dept').value;

        const tbody = document.getElementById('results-tbody');
        const loading = document.getElementById('results-loading');
        const empty = document.getElementById('results-empty');
        const stats = document.getElementById('results-stats');

        loading.classList.remove('hidden');
        empty.classList.add('hidden');
        tbody.innerHTML = '';
        stats.innerHTML = '';

        try {
            // Build query
            let q = query(collection(db, "user_scores"), orderBy("date", "desc"), limit(500));
            const snap = await getDocs(q);

            let results = [];
            snap.forEach(d => results.push({ id: d.id, ...d.data() }));

            // Apply filters
            if (quizFilter) results = results.filter(r => r.quizId === quizFilter);
            if (collegeFilter) results = results.filter(r => r.collegeId === collegeFilter);
            // Note: Department filter would need user data lookup

            loading.classList.add('hidden');

            if (results.length === 0) {
                empty.classList.remove('hidden');
                return;
            }

            // Calculate stats
            const totalAttempts = results.length;
            const avgScore = Math.round(results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length);
            const bestScore = Math.max(...results.map(r => r.score || 0));
            const worstScore = Math.min(...results.map(r => r.score || 0));
            const passCount = results.filter(r => r.score >= 50).length;
            const passRate = Math.round((passCount / totalAttempts) * 100);

            stats.innerHTML = `
                <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-5 rounded-2xl shadow-lg">
                    <i class="fas fa-users text-3xl opacity-50"></i>
                    <p class="text-3xl font-black mt-2">${totalAttempts}</p>
                    <p class="text-sm opacity-80">إجمالي المحاولات</p>
                </div>
                <div class="bg-gradient-to-br from-accent-500 to-accent-600 text-white p-5 rounded-2xl shadow-lg">
                    <i class="fas fa-chart-line text-3xl opacity-50"></i>
                    <p class="text-3xl font-black mt-2">${avgScore}%</p>
                    <p class="text-sm opacity-80">متوسط الدرجات</p>
                </div>
                <div class="bg-gradient-to-br from-yellow-500 to-orange-500 text-white p-5 rounded-2xl shadow-lg">
                    <i class="fas fa-trophy text-3xl opacity-50"></i>
                    <p class="text-3xl font-black mt-2">${bestScore}%</p>
                    <p class="text-sm opacity-80">أعلى درجة</p>
                </div>
                <div class="bg-gradient-to-br from-primary-500 to-pink-600 text-white p-5 rounded-2xl shadow-lg">
                    <i class="fas fa-check-circle text-3xl opacity-50"></i>
                    <p class="text-3xl font-black mt-2">${passRate}%</p>
                    <p class="text-sm opacity-80">نسبة النجاح</p>
                </div>
            `;

            // Group results by user+quiz to count attempts
            const attemptCounts = {};
            results.forEach(r => {
                const key = `${r.userId}_${r.quizId}`;
                if (!attemptCounts[key]) attemptCounts[key] = 0;
                attemptCounts[key]++;
            });

            // Track attempt number per user+quiz
            const attemptTracker = {};

            // Populate table
            results.slice(0, 100).forEach((r, idx) => {
                const dateStr = r.date?.toDate ? r.date.toDate().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
                const scoreClass = r.score >= 50 ? 'text-accent-600 bg-accent-100' : 'text-red-600 bg-red-100';

                // حساب رقم المحاولة
                const key = `${r.userId}_${r.quizId}`;
                if (!attemptTracker[key]) attemptTracker[key] = attemptCounts[key];
                const attemptNum = attemptTracker[key]--;
                const totalAttempts = attemptCounts[key];

                tbody.innerHTML += `
                    <tr class="hover:bg-surface-50 dark:hover:bg-surface-700/50 transition cursor-pointer" onclick="window.location.hash='profile/${r.userId}'">
                        <td class="p-4 font-bold text-surface-500">${idx + 1}</td>
                        <td class="p-4">
                            <div class="flex items-center gap-3">
                                <img src="${r.userPhoto || 'https://ui-avatars.com/api/?background=random&name=User'}" class="w-10 h-10 rounded-full border-2 border-white shadow">
                                <div>
                                    <span class="font-bold dark:text-white hover:text-primary-600 transition">${r.userName || 'مجهول'}</span>
                                    <span class="block text-xs text-surface-400">${r.userId?.slice(0, 8) || ''}...</span>
                                </div>
                            </div>
                        </td>
                        <td class="p-4 font-bold text-primary-600 dark:text-primary-400">${r.quizTitle || 'N/A'}</td>
                        <td class="p-4">
                            <span class="bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-2 py-1 rounded-lg font-bold text-sm">${attemptNum} / ${totalAttempts}</span>
                        </td>
                        <td class="p-4"><span class="px-3 py-1 rounded-full font-black ${scoreClass}">${r.score}%</span></td>
                        <td class="p-4 text-surface-600 dark:text-surface-300">${r.correct || 0} / ${r.questionsCount || '?'}</td>
                        <td class="p-4 text-surface-500 text-sm">${dateStr}</td>
                    </tr>
                `;
            });

            // Store results for export
            window.currentQuizResults = results;

        } catch (error) {
            console.error('Error loading results:', error);
            loading.classList.add('hidden');
            tbody.innerHTML = '<tr><td colspan="7" class="p-10 text-center text-red-500 font-bold">حدث خطأ في تحميل النتائج</td></tr>';
        }
    };

    // Apply filter button
    document.getElementById('apply-filter-btn').onclick = loadResults;

    // Export to Excel
    document.getElementById('export-excel-btn').onclick = () => {
        if (!window.currentQuizResults || window.currentQuizResults.length === 0) {
            window.showToast?.('لا توجد بيانات للتصدير');
            return;
        }

        // Create CSV content
        let csv = '\ufeffالاسم,الاختبار,الكلية,الدرجة,الصحيحة,الإجمالي,التاريخ\n';
        window.currentQuizResults.forEach(r => {
            const dateStr = r.date?.toDate ? r.date.toDate().toLocaleDateString('ar-EG') : 'N/A';
            csv += `"${r.userName || 'مجهول'}","${r.quizTitle || 'N/A'}","${r.collegeId || 'N/A'}",${r.score},${r.correct || 0},${r.questionsCount || 0},"${dateStr}"\n`;
        });

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quiz_results_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Reset Grades
    document.getElementById('reset-grades-btn').onclick = async () => {
        const quizFilter = document.getElementById('filter-quiz').value;

        // Confirmation modal
        const confirmModal = document.createElement('div');
        confirmModal.id = 'reset-confirm-modal';
        confirmModal.className = 'fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4 backdrop-blur-sm';
        confirmModal.innerHTML = `
            <div class="bg-white dark:bg-surface-800 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
                <div class="bg-gradient-to-r from-red-600 to-rose-600 text-white p-5 text-center">
                    <i class="fas fa-exclamation-triangle text-5xl mb-3"></i>
                    <h2 class="text-xl font-black">⚠️ تحذير: تصفير الدرجات</h2>
                </div>
                <div class="p-6 text-center">
                    <p class="text-surface-700 dark:text-surface-300 mb-4 font-bold">
                        ${quizFilter ? 'سيتم حذف جميع درجات الاختبار المحدد' : 'سيتم حذف جميع درجات كل الاختبارات'}
                    </p>
                    <p class="text-red-500 text-sm mb-4">⚠️ هذا الإجراء لا يمكن التراجع عنه!</p>
                    <input type="text" id="confirm-text" placeholder="اكتب 'تأكيد' للمتابعة" class="w-full p-3 border-2 border-red-300 rounded-xl text-center font-bold dark:bg-surface-700 dark:text-white focus:border-red-500 outline-none">
                </div>
                <div class="p-4 bg-surface-50 dark:bg-surface-900 flex gap-3">
                    <button id="cancel-reset-btn" class="flex-1 bg-surface-500 text-white py-3 rounded-xl font-bold hover:bg-surface-600 transition">إلغاء</button>
                    <button id="confirm-reset-btn" class="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition">تصفير</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmModal);

        document.getElementById('cancel-reset-btn').onclick = () => confirmModal.remove();

        document.getElementById('confirm-reset-btn').onclick = async () => {
            const confirmText = document.getElementById('confirm-text').value.trim();
            if (confirmText !== 'تأكيد') {
                window.showToast?.('يرجى كتابة "تأكيد" للمتابعة');
                return;
            }

            const btn = document.getElementById('confirm-reset-btn');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحذف...';
            btn.disabled = true;

            try {
                // Get all records to delete
                let q = query(collection(db, "user_scores"));
                if (quizFilter) {
                    q = query(collection(db, "user_scores"), where("quizId", "==", quizFilter));
                }
                const snap = await getDocs(q);

                // Delete each record
                let deleteCount = 0;
                const batch = [];
                snap.forEach(d => {
                    batch.push(deleteDoc(d.ref));
                    deleteCount++;
                });

                // Also delete from user_scores_log if quiz is selected
                if (quizFilter) {
                    const logQ = query(collection(db, "user_scores_log"), where("quizId", "==", quizFilter));
                    const logSnap = await getDocs(logQ);
                    logSnap.forEach(d => batch.push(deleteDoc(d.ref)));
                }

                await Promise.all(batch);

                confirmModal.remove();
                alert(`✅ تم حذف ${deleteCount} سجل بنجاح`);

                // Reload results
                document.getElementById('apply-filter-btn').click();

            } catch (error) {
                console.error('Reset error:', error);
                window.showToast?.('❌ حدث خطأ: ' + error.message);
                btn.innerHTML = 'تصفير';
                btn.disabled = false;
            }
        };
    };

    // Load initial results
    loadResults();
};

// Global function to open results
window.openQuizResults = (quizId, quizTitle) => {
    openQuizResultsDashboard(quizId, quizTitle);
};

// ============================================================
// سجل الغش - Cheating Logs Dashboard
// ============================================================
export const openCheatingLogsDashboard = async () => {
    document.getElementById('admin-view-area').classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer'].forEach(id => document.getElementById(id)?.classList.add('hidden'));

    document.getElementById('admin-view-title').textContent = '🚨 سجل محاولات الغش';

    document.getElementById('admin-view-content').innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-2xl shadow-lg overflow-hidden">
            <div class="bg-gradient-to-r from-red-600 to-pink-600 p-5 text-white">
                <div class="flex justify-between items-center">
                    <h3 class="text-xl font-black flex items-center gap-2"><i class="fas fa-user-secret"></i> سجل محاولات الغش</h3>
                    <span id="cheating-count" class="bg-white/20 px-4 py-1 rounded-full text-sm font-bold">جاري التحميل...</span>
                </div>
            </div>
            
            <div class="overflow-x-auto">
                <table class="w-full" id="cheating-table">
                    <thead class="bg-surface-100 dark:bg-surface-700">
                        <tr>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">#</th>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">الطالب</th>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">الكويز</th>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">المخالفات</th>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">السبب</th>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">التاريخ</th>
                            <th class="p-4 text-right font-black text-surface-700 dark:text-surface-200">التفاصيل</th>
                        </tr>
                    </thead>
                    <tbody id="cheating-tbody" class="divide-y dark:divide-surface-700"></tbody>
                </table>
            </div>
            
            <div id="cheating-loading" class="p-10 text-center">
                <i class="fas fa-spinner fa-spin text-3xl text-red-500"></i>
                <p class="mt-2 text-surface-500">جاري تحميل السجلات...</p>
            </div>
            
            <div id="cheating-empty" class="hidden p-10 text-center">
                <i class="fas fa-check-circle text-5xl text-accent-400 mb-4"></i>
                <p class="text-surface-500 font-bold text-lg">لا توجد محاولات غش مسجلة 🎉</p>
            </div>
        </div>
    `;

    try {
        const snap = await getDocs(query(collection(db, "cheating_logs"), orderBy("timestamp", "desc"), limit(100)));

        const loading = document.getElementById('cheating-loading');
        const empty = document.getElementById('cheating-empty');
        const tbody = document.getElementById('cheating-tbody');
        const countBadge = document.getElementById('cheating-count');

        loading.classList.add('hidden');

        if (snap.empty) {
            empty.classList.remove('hidden');
            countBadge.textContent = '0 سجل';
            return;
        }

        countBadge.textContent = `${snap.size} سجل`;

        let idx = 0;
        snap.forEach(d => {
            idx++;
            const log = d.data();
            const dateStr = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';

            // تفاصيل المخالفات
            const violationsList = log.violations?.map(v => `<li class="text-xs">• ${v.timestamp}: ${v.type}</li>`).join('') || '<li>لا توجد تفاصيل</li>';

            tbody.innerHTML += `
                <tr class="hover:bg-red-50 dark:hover:bg-red-900/10 transition">
                    <td class="p-4 font-bold text-surface-500">${idx}</td>
                    <td class="p-4">
                        <span class="font-bold dark:text-white">${log.userName || 'مجهول'}</span>
                        <span class="block text-xs text-surface-400">${log.userId?.slice(0, 8) || ''}...</span>
                    </td>
                    <td class="p-4 text-primary-600 dark:text-primary-400 font-bold text-sm">${log.quizId?.slice(0, 10) || 'N/A'}...</td>
                    <td class="p-4">
                        <span class="bg-red-100 text-red-600 px-3 py-1 rounded-full font-black">${log.totalViolations || 0}</span>
                    </td>
                    <td class="p-4 text-sm text-surface-600 dark:text-surface-300 max-w-[200px] truncate">${log.reason || 'N/A'}</td>
                    <td class="p-4 text-surface-500 text-sm">${dateStr}</td>
                    <td class="p-4">
                        <button onclick="this.nextElementSibling.classList.toggle('hidden')" class="bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 px-3 py-1 rounded-lg text-xs font-bold hover:bg-surface-200 dark:hover:bg-surface-600 transition">
                            <i class="fas fa-eye"></i> عرض
                        </button>
                        <div class="hidden absolute bg-white dark:bg-surface-800 border dark:border-surface-600 rounded-xl shadow-xl p-4 mt-2 z-50 max-w-xs">
                            <h5 class="font-bold text-red-500 mb-2 text-sm">📋 تفاصيل المخالفات:</h5>
                            <ul class="space-y-1 text-surface-600 dark:text-surface-300">${violationsList}</ul>
                        </div>
                    </td>
                </tr>
            `;
        });

    } catch (error) {
        console.error('Error loading cheating logs:', error);
        document.getElementById('cheating-loading').innerHTML = '<p class="text-red-500 font-bold">حدث خطأ في تحميل السجلات</p>';
    }
};

// Global function
window.openCheatingLogs = () => {
    openCheatingLogsDashboard();
};

// ============================================================
// 4. دوال إدارة الأسئلة (Global Functions)
// ============================================================
window.deleteQuiz = async (id) => { if (confirm("حذف الاختبار؟")) { await deleteDoc(doc(db, "quizzes", id)); openQuizCmsMain(); } };

// تعديل الكويز
window.editQuiz = async (quizId) => {
    // تحميل بيانات الكويز
    const quizDoc = await getDoc(doc(db, "quizzes", quizId));
    if (!quizDoc.exists()) {
        window.showToast?.('الكويز غير موجود');
        return;
    }
    const quiz = quizDoc.data();

    // خيارات الكليات
    const colOptions = UNIVERSITY_STRUCTURE.map(c =>
        `<option value="${c.id}" ${c.id === quiz.collegeId ? 'selected' : ''}>${c.name}</option>`
    ).join('');

    // خيارات الأقسام
    const selectedCol = UNIVERSITY_STRUCTURE.find(c => c.id === quiz.collegeId);
    let deptOptions = '<option value="all">كل الأقسام</option>';
    if (selectedCol && selectedCol.departments) {
        deptOptions += selectedCol.departments.map(d =>
            `<option value="${d.id}" ${d.id === quiz.departmentId ? 'selected' : ''}>${d.name}</option>`
        ).join('');
    }

    // إنشاء Modal التعديل
    document.getElementById('edit-quiz-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'edit-quiz-modal';
    modal.className = 'fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div class="bg-gradient-to-r from-yellow-500 to-orange-500 p-5 text-white">
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-black flex items-center gap-2"><i class="fas fa-pen"></i> تعديل الكويز</h2>
                    <button onclick="document.getElementById('edit-quiz-modal').remove()" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 transition flex items-center justify-center">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <div class="p-5 space-y-4">
                <div>
                    <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-1">📝 العنوان</label>
                    <input type="text" id="edit-quiz-title" value="${quiz.title || ''}" class="w-full p-3 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-yellow-500 outline-none">
                </div>
                
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-1">⏱️ الوقت (دقيقة)</label>
                        <input type="number" id="edit-quiz-time" value="${quiz.timeLimit || 15}" min="1" class="w-full p-3 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-yellow-500 outline-none text-center">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-1">🔄 المحاولات</label>
                        <input type="number" id="edit-quiz-attempts" value="${quiz.maxAttempts || 0}" min="0" class="w-full p-3 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-yellow-500 outline-none text-center" placeholder="0 = لا نهائي">
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-1">🎓 الكلية</label>
                        <select id="edit-quiz-college" class="w-full p-3 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-yellow-500 outline-none">
                            <option value="all">كل الكليات</option>
                            ${colOptions}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-1">📁 القسم</label>
                        <select id="edit-quiz-dept" class="w-full p-3 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-yellow-500 outline-none">
                            ${deptOptions}
                        </select>
                    </div>
                </div>
                
                <label class="flex items-center gap-3 cursor-pointer bg-surface-100 dark:bg-surface-700 p-3 rounded-xl border-2 border-surface-200 dark:border-surface-600">
                    <input type="checkbox" id="edit-quiz-random" class="w-5 h-5 accent-yellow-500" ${quiz.randomize ? 'checked' : ''}>
                    <span class="font-bold text-surface-700 dark:text-white">🎲 ترتيب عشوائي للأسئلة</span>
                </label>
                
                <button id="save-quiz-btn" class="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white py-3 rounded-xl font-black hover:from-yellow-600 hover:to-orange-600 transition shadow-lg flex items-center justify-center gap-2">
                    <i class="fas fa-save"></i> حفظ التعديلات
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // تفعيل تغيير الأقسام
    const colSelect = document.getElementById('edit-quiz-college');
    const deptSelect = document.getElementById('edit-quiz-dept');
    colSelect.onchange = () => {
        const colId = colSelect.value;
        deptSelect.innerHTML = '<option value="all">كل الأقسام</option>';
        if (colId && colId !== 'all') {
            const col = UNIVERSITY_STRUCTURE.find(c => c.id === colId);
            if (col && col.departments) {
                col.departments.forEach(d => {
                    deptSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
                });
            }
        }
    };

    // حفظ التعديلات
    document.getElementById('save-quiz-btn').onclick = async () => {
        const btn = document.getElementById('save-quiz-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

        try {
            await updateDoc(doc(db, "quizzes", quizId), {
                title: document.getElementById('edit-quiz-title').value.trim(),
                timeLimit: parseInt(document.getElementById('edit-quiz-time').value) || 15,
                maxAttempts: parseInt(document.getElementById('edit-quiz-attempts').value) || 0,
                collegeId: document.getElementById('edit-quiz-college').value,
                departmentId: document.getElementById('edit-quiz-dept').value,
                randomize: document.getElementById('edit-quiz-random').checked
            });

            document.getElementById('edit-quiz-modal').remove();
            window.showToast?.('✅ تم حفظ التعديلات بنجاح');
            openQuizCmsMain();
        } catch (error) {
            console.error('Edit quiz error:', error);
            window.showToast?.('❌ حدث خطأ في الحفظ');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> حفظ التعديلات';
        }
    };
};

window.manageQuestions = async (quizId) => {
    document.getElementById('questions-modal').classList.remove('hidden');
    const list = document.getElementById('questions-list-content');

    const loadQs = async () => {
        list.innerHTML = '<p class="text-center text-surface-400">جاري التحميل...</p>';
        const snap = await getDocs(collection(db, "quizzes", quizId, "questions"));
        list.innerHTML = '';
        if (snap.empty) list.innerHTML = '<p class="text-center text-surface-400 py-4">لا توجد أسئلة مضافة.</p>';

        snap.forEach((d, idx) => {
            const q = d.data();
            list.innerHTML += `
                <div class="bg-white dark:bg-surface-700 p-4 rounded-xl shadow-sm border dark:border-surface-600 flex justify-between gap-4">
                    <div>
                        <span class="font-bold text-primary-600 text-xs">سؤال ${idx + 1}</span>
                        <p class="font-bold dark:text-white text-sm mt-1">${q.text}</p>
                        <p class="text-xs text-accent-600 mt-1 font-bold">الإجابة: ${q.correctAnswer}</p>
                    </div>
                    <button onclick="window.delQuestion('${quizId}', '${d.id}')" class="text-red-400 hover:text-red-600"><i class="fas fa-trash"></i></button>
                </div>`;
        });
    };

    document.getElementById('add-q-btn').onclick = async () => {
        const text = document.getElementById('q-text').value;
        const o1 = document.getElementById('opt-1').value;
        const o2 = document.getElementById('opt-2').value;
        const o3 = document.getElementById('opt-3').value;
        const o4 = document.getElementById('opt-4').value;
        const correctIdx = document.getElementById('correct-opt').value; // 1, 2, 3, or 4

        if (!text || !o1 || !o2) return window.showToast?.("أدخل السؤال وخيارين على الأقل");

        const options = [o1, o2, o3, o4].filter(o => o); // remove empty
        const correctVal = options[parseInt(correctIdx) - 1];

        await addDoc(collection(db, "quizzes", quizId, "questions"), { text, options, correctAnswer: correctVal });

        // مسح الحقول
        document.getElementById('q-text').value = '';
        document.getElementById('opt-1').value = ''; document.getElementById('opt-2').value = '';
        document.getElementById('opt-3').value = ''; document.getElementById('opt-4').value = '';
        loadQs();
    };

    window.delQuestion = async (qid, did) => {
        if (confirm("حذف السؤال؟")) { await deleteDoc(doc(db, "quizzes", qid, "questions", did)); loadQs(); }
    };

    loadQs();
};

// ============================================================
export const openLeaderboardView = async () => {
    ['study-sections-container', 'admin-view-area', 'subsection-viewer', 'scores-section', 'quiz-section', 'assignments-section', 'home-screen', 'profile-section', 'admin-settings-section'].forEach(id => document.getElementById(id)?.classList.add('hidden'));

    document.getElementById('leaderboard-section').classList.remove('hidden');
    document.getElementById('leaderboard-section').classList.add('animate-fade-in');
    const list = document.getElementById('leaderboard-list');

    // زرار تصفير للسوبر أدمن
    const isSuperAdmin = auth.currentUser?.email === SUPER_ADMIN_EMAIL;
    const resetBtnContainer = document.getElementById('leaderboard-reset-container');
    if (resetBtnContainer) resetBtnContainer.remove();
    if (isSuperAdmin) {
        const resetDiv = document.createElement('div');
        resetDiv.id = 'leaderboard-reset-container';
        resetDiv.className = 'flex justify-end mb-4';
        resetDiv.innerHTML = `
            <button onclick="window.resetLeaderboard()" class="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-xl font-bold text-sm hover:bg-red-200 dark:hover:bg-red-900/50 transition shadow-sm border border-red-200 dark:border-red-800">
                <i class="fas fa-trash-restore"></i> تصفير لوحة الأوائل
            </button>`;
        list.parentElement.insertBefore(resetDiv, list);
    }

    list.innerHTML = '<div class="text-center p-10"><i class="fas fa-spinner fa-spin text-3xl text-yellow-500"></i></div>';

    try {
        // ✅ الترتيب بـ XP
        const q = query(
            collection(db, "users"),
            orderBy("xp", "desc"),
            limit(20)
        );

        const snap = await getDocs(q);
        list.innerHTML = '';

        if (snap.empty) {
            list.innerHTML = '<p class="text-center text-surface-500 font-bold p-10">لا توجد بيانات كافية لعرض لوحة الشرف.</p>';
            return;
        }

        let rank = 1;
        snap.forEach(d => {
            const u = d.data();
            if (u.isBanned || !u.displayName) return;

            // حساب المستوى من XP
            const xp = u.xp || 0;
            const studyMinutes = u.studyMinutes || 0;
            const studyHours = Math.floor(studyMinutes / 60);

            // المستويات
            let levelName = 'مبتدئ';
            let levelBadge = '🌱';
            let levelColor = 'green';
            if (xp >= 5000) { levelName = 'ملك مسار'; levelBadge = '🔥'; levelColor = 'orange'; }
            else if (xp >= 2500) { levelName = 'أسطورة'; levelBadge = '👑'; levelColor = 'red'; }
            else if (xp >= 1500) { levelName = 'محترف'; levelBadge = '🏆'; levelColor = 'yellow'; }
            else if (xp >= 1000) { levelName = 'خبير'; levelBadge = '💎'; levelColor = 'indigo'; }
            else if (xp >= 500) { levelName = 'متقدم'; levelBadge = '⭐'; levelColor = 'purple'; }
            else if (xp >= 200) { levelName = 'نشط'; levelBadge = '🚀'; levelColor = 'blue'; }
            else if (xp >= 50) { levelName = 'متعلم'; levelBadge = '📚'; levelColor = 'cyan'; }

            // محاولة جلب اسم الكلية بأمان
            let collegeShortName = "";
            try {
                const structNames = getStructureName(u.collegeId, 'all');
                if (structNames.colName !== "غير معروف") collegeShortName = structNames.colName;
            } catch (e) { }

            let rankStyle = "bg-white dark:bg-surface-800 border-l-4 border-surface-300";
            let rankIcon = `<span class="font-bold text-surface-500 text-xl w-8 text-center">#${rank}</span>`;

            if (rank === 1) {
                rankStyle = "bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/30 dark:to-amber-900/30 border-l-4 border-yellow-400 scale-[1.02] shadow-lg ring-2 ring-yellow-200";
                rankIcon = "🥇";
            } else if (rank === 2) {
                rankStyle = "bg-gradient-to-r from-surface-50 to-surface-50 dark:from-surface-700/50 dark:to-surface-700/50 border-l-4 border-surface-400 shadow-md";
                rankIcon = "🥈";
            } else if (rank === 3) {
                rankStyle = "bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border-l-4 border-orange-400 shadow-md";
                rankIcon = "🥉";
            }

            let badges = u.badges ? u.badges.slice(0, 3).map(b => `<span title="${b.title}" class="hover:scale-125 transition cursor-help">${b.icon}</span>`).join(' ') : '';

            list.innerHTML += `
                <div class="flex items-center gap-4 p-4 rounded-xl shadow-sm mb-3 ${rankStyle} transition-all hover:shadow-md animate-fade-in">
                    <div class="text-2xl w-8 text-center">${rankIcon}</div>
                    <img src="${u.photoURL || 'https://ui-avatars.com/api/?background=random&name=User/150'}" loading="lazy" onclick="window.openUserProfile?.('${d.id}')" class="w-12 h-12 rounded-full border-2 border-white shadow bg-white object-cover cursor-pointer hover:scale-110 transition">
                    <div class="flex-grow min-w-0">
                        <div class="flex flex-col md:flex-row md:items-center gap-2">
                            <h4 class="font-bold text-lg truncate dark:text-white cursor-pointer hover:text-primary-600 transition" onclick="window.openUserProfile?.('${d.id}')">${u.displayName}</h4>
                            <span class="text-xs bg-${levelColor}-100 text-${levelColor}-700 dark:bg-${levelColor}-900/40 dark:text-${levelColor}-300 px-2 py-0.5 rounded-full font-bold">${levelBadge} ${levelName}</span>
                            ${collegeShortName ? `<span class="text-[10px] bg-primary-50 text-primary-600 border border-primary-100 px-2 py-0.5 rounded-full truncate w-fit dark:bg-primary-900/40 dark:text-primary-200 dark:border-primary-800">${collegeShortName}</span>` : ''}
                        </div>
                        <div class="text-sm text-surface-500 dark:text-surface-400 flex flex-wrap gap-3 mt-1 items-center">
                            <span class="font-bold text-primary-600 flex items-center gap-1"><i class="fas fa-star"></i> ${xp} XP</span>
                            <span class="font-bold text-orange-500 flex items-center gap-1"><i class="fas fa-fire"></i> ${u.currentStreak || u.streak || 0} يوم</span>
                            ${studyHours > 0 ? `<span class="font-bold text-primary-500 flex items-center gap-1"><i class="fas fa-clock"></i> ${studyHours} ساعة</span>` : ''}
                            ${badges ? `<span class="flex gap-1">${badges}</span>` : ''}
                        </div>
                    </div>
                </div>`;
            rank++;
        });
    } catch (e) {
        console.error("Leaderboard Error:", e);
        list.innerHTML = `<div class="text-center p-10 text-red-500"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><p>حدث خطأ في تحميل القائمة.</p></div>`;
    }
};

// ============================================================
// تصفير لوحة الأوائل (Super Admin فقط)
// ============================================================
window.resetLeaderboard = async () => {
    if (auth.currentUser?.email !== SUPER_ADMIN_EMAIL) return;

    const firstConfirm = confirm('⚠️ هل أنت متأكد من تصفير لوحة الأوائل؟\nسيتم تصفير XP و Streak وساعات المذاكرة لجميع الطلاب.');
    if (!firstConfirm) return;

    const secondConfirm = confirm('هذا الإجراء لا يمكن التراجع عنه! اكتب "تأكيد" للمتابعة.');
    if (!secondConfirm) return;

    const btn = document.querySelector('#leaderboard-reset-container button');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التصفير...';
    }

    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const batchSize = 400; // Firestore limit is 500
        let batch = writeBatch(db);
        let count = 0;

        for (const userDoc of usersSnap.docs) {
            batch.update(userDoc.ref, {
                xp: 0,
                currentStreak: 0,
                streak: 0,
                studyMinutes: 0,
                longestStreak: 0
            });
            count++;

            if (count % batchSize === 0) {
                await batch.commit();
                batch = writeBatch(db);
            }
        }

        if (count % batchSize !== 0) {
            await batch.commit();
        }

        alert(`✅ تم تصفير لوحة الأوائل بنجاح! (تم تحديث ${count} طالب)`);
        openLeaderboardView(); // reload
    } catch (e) {
        console.error('Reset leaderboard error:', e);
        window.showToast?.('❌ حدث خطأ أثناء التصفير: ' + e.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-trash-restore"></i> تصفير لوحة الأوائل';
        }
    }
};

// ============================================================
// 6. توليد الكويزات بالذكاء الاصطناعي (AI Quiz Generator)
// ============================================================
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

window.openAIQuizGenerator = () => {
    // إزالة أي modal سابق
    document.getElementById('ai-quiz-modal')?.remove();

    // إنشاء خيارات الكليات
    const colOptions = UNIVERSITY_STRUCTURE.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    const modal = document.createElement('div');
    modal.id = 'ai-quiz-modal';
    modal.className = 'fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden my-4">
            <div class="bg-gradient-to-r from-primary-600 to-primary-600 p-6 text-white">
                <div class="flex justify-between items-center">
                    <h2 class="text-2xl font-black flex items-center gap-3">
                        <i class="fas fa-robot"></i>
                        توليد كويز بالذكاء الاصطناعي
                    </h2>
                    <button onclick="document.getElementById('ai-quiz-modal').remove()" class="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition flex items-center justify-center">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <p class="text-primary-100 text-sm mt-2">اكتب الموضوع وحدد عدد الأسئلة وسيقوم الـ AI بتوليد الكويز تلقائياً ✨</p>
            </div>
            
            <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                    <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">📝 عنوان الكويز</label>
                    <input type="text" id="ai-quiz-title" class="w-full p-4 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-primary-500 outline-none transition" placeholder="مثال: اختبار الفيزياء - قوانين نيوتن">
                </div>
                
                <!-- اختيار الكلية والقسم -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">🎓 الكلية</label>
                        <select id="ai-quiz-college" class="w-full p-4 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-primary-500 outline-none">
                            <option value="all">كل الكليات</option>
                            ${colOptions}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">📁 القسم</label>
                        <select id="ai-quiz-dept" class="w-full p-4 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-primary-500 outline-none">
                            <option value="all">كل الأقسام</option>
                        </select>
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">📚 الموضوع والمحتوى (اكتب كل التفاصيل)</label>
                    <textarea id="ai-quiz-topic" class="w-full h-32 p-4 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-primary-500 outline-none transition resize-none" placeholder="اكتب هنا كل المعلومات والمفاهيم اللي عايز الأسئلة تتكون منها...

مثال:
- قانون نيوتن الأول (القصور الذاتي)
- قانون نيوتن الثاني (F = ma)
- قانون نيوتن الثالث (الفعل ورد الفعل)"></textarea>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">🔢 عدد الأسئلة</label>
                        <select id="ai-quiz-count" class="w-full p-4 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-primary-500 outline-none">
                            <option value="5">5 أسئلة</option>
                            <option value="10" selected>10 أسئلة</option>
                            <option value="15">15 سؤال</option>
                            <option value="20">20 سؤال</option>
                            <option value="30">30 سؤال</option>
                            <option value="50">50 سؤال</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">📊 مستوى الصعوبة</label>
                        <select id="ai-quiz-difficulty" class="w-full p-4 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-primary-500 outline-none">
                            <option value="easy">سهل 🟢</option>
                            <option value="medium" selected>متوسط 🟡</option>
                            <option value="hard">صعب 🔴</option>
                        </select>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">⏱️ وقت الاختبار (دقيقة)</label>
                        <input type="number" id="ai-quiz-time" value="15" min="5" max="180" class="w-full p-4 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-primary-500 outline-none text-center">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">🔄 عدد المحاولات</label>
                        <input type="number" id="ai-quiz-attempts" value="1" min="0" max="10" class="w-full p-4 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-primary-500 outline-none text-center" placeholder="0 = لا نهائي">
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">🌐 اللغة</label>
                        <select id="ai-quiz-lang" class="w-full p-4 border-2 rounded-xl dark:bg-surface-700 dark:text-white font-bold focus:border-primary-500 outline-none">
                            <option value="ar" selected>العربية 🇪🇬</option>
                            <option value="en">English 🇺🇸</option>
                        </select>
                    </div>
                    <div class="flex items-end">
                        <label class="flex items-center gap-3 cursor-pointer bg-surface-100 dark:bg-surface-700 p-4 rounded-xl border-2 border-surface-200 dark:border-surface-600 w-full hover:bg-primary-50 dark:hover:bg-primary-900/30 transition">
                            <input type="checkbox" id="ai-quiz-random" class="w-5 h-5 accent-primary-600" checked>
                            <span class="font-bold text-surface-700 dark:text-white">🎲 ترتيب عشوائي</span>
                        </label>
                    </div>
                </div>
                
                <div id="ai-quiz-status" class="hidden p-4 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-center">
                    <i class="fas fa-spinner fa-spin text-2xl text-primary-600 mb-2"></i>
                    <p class="text-primary-700 dark:text-primary-300 font-bold">جاري توليد الأسئلة... انتظر قليلاً ⏳</p>
                </div>
                
                <button id="generate-ai-quiz-btn" onclick="window.generateAIQuiz()" class="w-full bg-gradient-to-r from-primary-600 to-primary-600 text-white py-4 rounded-2xl font-black hover:from-primary-700 hover:to-primary-700 transition shadow-lg transform hover:-translate-y-1 flex items-center justify-center gap-2">
                    <i class="fas fa-magic"></i>
                    توليد الكويز الآن ✨
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // تفعيل تغيير الأقسام عند اختيار الكلية
    const colSelect = document.getElementById('ai-quiz-college');
    const deptSelect = document.getElementById('ai-quiz-dept');

    colSelect.onchange = () => {
        const colId = colSelect.value;
        deptSelect.innerHTML = '<option value="all">كل الأقسام</option>';

        if (colId && colId !== 'all') {
            const selectedCol = UNIVERSITY_STRUCTURE.find(c => c.id === colId);
            if (selectedCol && selectedCol.departments) {
                selectedCol.departments.forEach(d => {
                    deptSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
                });
            }
        }
    };
};

window.generateAIQuiz = async () => {
    const title = document.getElementById('ai-quiz-title').value.trim();
    const topic = document.getElementById('ai-quiz-topic').value.trim();
    const count = document.getElementById('ai-quiz-count').value;
    const difficulty = document.getElementById('ai-quiz-difficulty').value;
    const time = parseInt(document.getElementById('ai-quiz-time').value);
    const lang = document.getElementById('ai-quiz-lang').value;
    const collegeId = document.getElementById('ai-quiz-college').value;
    const departmentId = document.getElementById('ai-quiz-dept').value;
    const maxAttempts = parseInt(document.getElementById('ai-quiz-attempts').value) || 0;
    const randomize = document.getElementById('ai-quiz-random').checked;

    if (!title || !topic) {
        window.showToast?.('⚠️ يرجى كتابة العنوان والموضوع');
        return;
    }

    const statusDiv = document.getElementById('ai-quiz-status');
    const btn = document.getElementById('generate-ai-quiz-btn');
    statusDiv.classList.remove('hidden');
    statusDiv.innerHTML = `
        <i class="fas fa-spinner fa-spin text-2xl text-primary-600 mb-2"></i>
        <p class="text-primary-700 dark:text-primary-300 font-bold">جاري توليد الأسئلة... انتظر قليلاً ⏳</p>
    `;
    statusDiv.className = 'p-4 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-center';
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التوليد...';

    const difficultyText = {
        easy: 'سهل (أسئلة مباشرة وواضحة)',
        medium: 'متوسط (أسئلة تحتاج بعض التفكير)',
        hard: 'صعب (أسئلة تحتاج تحليل وفهم عميق)'
    };

    const systemPrompt = `أنت مولد اختبارات محترف ودقيق. مهمتك إنشاء أسئلة اختيار من متعدد عالية الجودة.

📋 المطلوب:
- إنشاء ${count} سؤال بالضبط
- المستوى: ${difficultyText[difficulty]}
- اللغة: ${lang === 'ar' ? 'العربية' : 'الإنجليزية'}

📚 الموضوع والمحتوى:
${topic}

⚠️ قواعد مهمة جداً:
1. كل سؤال له 4 خيارات بالضبط
2. إجابة صحيحة واحدة فقط لكل سؤال
3. الأسئلة متنوعة وتغطي كل المحتوى
4. الخيارات الخاطئة يجب أن تكون منطقية (ليست واضحة الخطأ)
5. لا تكرر نفس السؤال بصياغات مختلفة

🚫 ممنوع تماماً استخدام backslash (\\):
- لا تستخدم \\sqrt أو \\frac أو \\theta أو \\Delta أو أي أمر يبدأ بـ \\
- استخدم رموز Unicode بدلاً منها:
  • الجذر: √ (مثال: √75)
  • دلتا: Δ أو delta
  • ثيتا: θ أو theta  
  • ألفا/بيتا: α, β أو alpha, beta
  • باي: π أو pi
  • الأس: استخدم ^ (مثال: x^2)
  • الكسور: استخدم / (مثال: 3/4 أو a/b)
- اكتب المعادلات بشكل بسيط مثل: "v = v₀ + at" أو "F = ma"

🔄 أرجع JSON فقط بدون أي نص إضافي وبدون markdown بهذا الشكل بالضبط:
{"questions":[{"question":"نص السؤال","options":["خيار1","خيار2","خيار3","خيار4"],"correctIndex":0}]}

ملاحظة: correctIndex هو رقم الخيار الصحيح (0 = الأول، 1 = الثاني، 2 = الثالث، 3 = الرابع)`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || 'فشل الاتصال بـ AI');
        }

        const data = await response.json();
        let aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        console.log('AI Raw Response:', aiText);

        // تنظيف الـ JSON بشكل أفضل
        aiText = aiText
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .replace(/^\s*[\r\n]+/, '')
            .replace(/[\r\n]+\s*$/, '')
            .trim();

        // محاولة إيجاد JSON في النص
        const jsonMatch = aiText.match(/\{[\s\S]*"questions"[\s\S]*\}/);
        if (jsonMatch) {
            aiText = jsonMatch[0];
        }

        let parsed;
        try {
            // إصلاح الـ backslashes في LaTeX مثل \sqrt قبل الـ parse
            const fixedText = aiText
                .replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1') // escape backslashes not followed by valid JSON escape chars
                .replace(/\$\\([a-zA-Z])/g, '$\\\\$1'); // fix LaTeX like $\sqrt
            parsed = JSON.parse(fixedText);
        } catch (parseErr) {
            console.error('JSON Parse Error:', parseErr, 'Text:', aiText);

            // محاولة إصلاح JSON المكسور
            try {
                // إزالة أي أحرف غير صالحة وتصليح escapes
                const cleanedText = aiText
                    .replace(/[\u0000-\u001F]+/g, ' ')
                    .replace(/,\s*}/g, '}')
                    .replace(/,\s*]/g, ']')
                    .replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1') // fix bad escapes
                    .replace(/\$\\/g, '$\\\\'); // fix LaTeX
                parsed = JSON.parse(cleanedText);
            } catch {
                throw new Error('فشل في تحليل رد الـ AI - حاول مرة أخرى');
            }
        }

        if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
            throw new Error('الرد لا يحتوي على أسئلة صحيحة');
        }

        // التحقق من صحة الأسئلة
        const validQuestions = parsed.questions.filter(q =>
            q.question &&
            Array.isArray(q.options) &&
            q.options.length >= 2 &&
            typeof q.correctIndex === 'number' &&
            q.correctIndex >= 0 &&
            q.correctIndex < q.options.length
        );

        if (validQuestions.length === 0) {
            throw new Error('الأسئلة المولدة غير صالحة');
        }

        // إنشاء الكويز
        const quizRef = await addDoc(collection(db, 'quizzes'), {
            title,
            timeLimit: time,
            collegeId: collegeId,
            departmentId: departmentId,
            randomize: randomize,
            maxAttempts: maxAttempts,
            createdAt: new Date(),
            difficulty
        });

        // إضافة الأسئلة
        for (const q of validQuestions) {
            const correctAnswer = q.options[q.correctIndex];
            await addDoc(collection(db, 'quizzes', quizRef.id, 'questions'), {
                text: q.question,
                options: q.options,
                correctAnswer: correctAnswer // ✅ حفظ نص الإجابة الصحيحة
            });
        }

        statusDiv.innerHTML = `
            <i class="fas fa-check-circle text-3xl text-accent-600 mb-2"></i>
            <p class="text-accent-700 dark:text-accent-300 font-bold">✅ تم توليد ${validQuestions.length} سؤال بنجاح!</p>
            <p class="text-sm text-surface-500 mt-1">الكلية: ${collegeId === 'all' ? 'الكل' : collegeId} | القسم: ${departmentId === 'all' ? 'الكل' : departmentId}</p>
        `;
        statusDiv.className = 'p-4 rounded-xl bg-accent-50 dark:bg-accent-900/30 text-center';

        btn.innerHTML = '<i class="fas fa-check"></i> تم بنجاح!';
        btn.className = 'w-full bg-accent-600 text-white py-4 rounded-2xl font-black shadow-lg flex items-center justify-center gap-2';

        // إغلاق وتحديث
        setTimeout(() => {
            document.getElementById('ai-quiz-modal')?.remove();
            window.openQuizCmsMain?.();
        }, 2000);

    } catch (error) {
        console.error('AI Quiz Error:', error);
        statusDiv.innerHTML = `
            <i class="fas fa-exclamation-circle text-2xl text-red-600 mb-2"></i>
            <p class="text-red-700 dark:text-red-300 font-bold">❌ ${error.message}</p>
            <p class="text-xs text-surface-500 mt-2">حاول تقليل عدد الأسئلة أو تبسيط الموضوع</p>
        `;
        statusDiv.className = 'p-4 rounded-xl bg-red-50 dark:bg-red-900/30 text-center';
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-redo"></i> حاول مرة أخرى';
    }
};