// translation.js - قاموس اللغات (عربي / إنجليزي) وإدارة التوجيه (RTL/LTR)

export const translations = {
    ar: {
        // Navigation
        "nav-home": "الرئيسية",
        "nav-profile": "ملفي الشخصي",
        "nav-sections": "المواد الدراسية",
        "nav-assignments": "الواجبات",
        "nav-quiz": "الامتحانات",
        "nav-leaderboard": "لوحة الشرف",
        "nav-scores": "سجل الدرجات",
        "nav-chat": "المساعد الذكي",
        "nav-support": "الدعم الفني",
        "nav-messages": "الرسائل الخاصة",
        "nav-menu": "القائمة",

        // Admin Panel
        "admin-panel": "لوحة التحكم",
        "admin-cms": "إدارة المحتوى",
        "admin-quiz": "إدارة الكويزات",
        "admin-users": "إدارة الطلاب",
        "admin-assign": "الواجبات",
        "admin-live": "البث المباشر",
        "admin-settings": "الإعدادات العامة",
        "admin-id-review": "مراجعة الهويات",
        "admin-support": "الدعم الفني",

        // Buttons
        "btn-login": "تسجيل دخول",
        "btn-logout": "تسجيل الخروج",
        "btn-back": "عودة",
        "btn-save": "حفظ",
        "btn-cancel": "إلغاء",
        "btn-submit": "إرسال",
        "btn-delete": "حذف",
        "btn-edit": "تعديل",
        "btn-add": "إضافة",
        "btn-search": "بحث",

        // Settings
        "theme-dark": "الوضع الداكن",
        "theme-light": "الوضع الفاتح",
        "lang-ar": "عربي",
        "lang-en": "English",
        "switch-to-en": "English",
        "switch-to-ar": "عربي",

        // Home Screen
        "welcome-msg": "أهلاً بك في منصة مسار",
        "streak-title": "حماس التعلم",
        "progress-title": "التقدم العام",
        "live-now": "مباشر الآن",
        "quick-access": "الوصول السريع",
        "recent-activity": "النشاط الأخير",

        // Home Page
        "welcome-hero": "أهلاً يا بطل",
        "welcome-subtitle": "واصل تقدمك، أنت تصنع مستقبلك الآن!",
        "start-studying": "ابدأ المذاكرة",
        "test-yourself": "اختبر نفسك",
        "my-stats": "إحصائياتي",
        "click-details": "اضغط لعرض التفاصيل",
        "my-notes": "ملاحظاتي",
        "click-add-note": "اضغط لإضافة ملاحظة",
        "my-weekly-goals": "أهدافي الأسبوعية",
        "favorites": "المفضلة",
        "saved-content": "المحتوى المحفوظ",
        "subjects": "المواد",
        "daily-activity": "نشاطك اليومي",
        "day-streak": "يوم متتالي",
        "best-day": "أفضل",
        "days": "يوم",

        // Profile
        "profile-verified": "موثق",
        "profile-not-verified": "غير موثق",
        "profile-edit": "تعديل الملف",
        "profile-college": "الكلية",
        "profile-department": "القسم",

        // Quiz
        "quiz-start": "بدء الاختبار",
        "quiz-submit": "تسليم الإجابة",
        "quiz-next": "التالي",
        "quiz-prev": "السابق",
        "quiz-result": "النتيجة",
        "quiz-time": "الوقت المتبقي",

        // Common
        "loading": "جاري التحميل...",
        "error": "حدث خطأ",
        "success": "تم بنجاح",
        "confirm-delete": "هل أنت متأكد من الحذف؟",
        "no-data": "لا توجد بيانات",

        // Sidebar Extended
        "register-attendance": "تسجيل الحضور",
        "nav-attendance": "سجل حضوري",
        "nav-notifications": "الإشعارات",
        "nav-settings": "الإعدادات",
        "nav-dark-mode": "الوضع الداكن",
        "nav-light-mode": "الوضع الفاتح",
        "qr-attendance": "عرض QR الحضور",
        "attendance-records": "سجلات الحضور",
        "attendance-stats": "إحصائيات الحضور",

        // Profile & Social
        "followers": "متابعين",
        "following": "يتابع",
        "follow": "متابعة",
        "unfollow": "إلغاء المتابعة",
        "follows-you": "يتابعك",
        "report-user": "إبلاغ",
        "block-user": "حظر",
        "points": "النقاط",
        "best-streak": "أفضل Streak",
        "grades-log": "سجل الدرجات",
        "my-exams": "امتحاناتي الأخيرة",
        "suggested-users": "اقتراحات المتابعة",

        // Admin Dashboard Cards
        "urgent-alert": "تنبيه عام",
        "announcement-bar": "شريط الإعلانات",
        "connected-devices": "الأجهزة المتصلة",
        "login-logs": "سجل الدخول",
        "statistics": "الإحصائيات",
        "scheduled-notifications": "إشعارات مجدولة",
        "advanced-export": "تصدير متقدم",
        "quiz-attempts": "محاولات الكويز",
        "bonus-all": "بونص للجميع",
        "copy-emails": "نسخ الإيميلات",
        "reset-results": "تصفير النتائج",
        "wipe-platform": "فرمتة المنصة",
        "all-colleges": "كل الكليات",
        "all-departments": "كل الأقسام",
        "search-student": "بحث بالاسم أو الإيميل...",
        "online-first": "Online أولاً",
        "verified-only": "موثقين فقط",
        "student-count": "طالب",
        "loading-students": "جاري تحميل قاعدة بيانات الطلاب...",
        "no-students": "لا يوجد طلاب مسجلين",
        "student-management": "إدارة الطلاب والمستخدمين",

        // Chat & Messages
        "group-chat": "الملتقى الجامعي",
        "write-message": "اكتب رسالتك هنا...",
        "send": "إرسال",
        "reply": "رد",
        "delete-msg": "حذف الرسالة",
        "edit-msg": "تعديل الرسالة",
        "voice-record": "تسجيل صوتي",
        "attach-file": "إرفاق ملف",
        "chat-locked": "المحادثة مغلقة حالياً",

        // Reports
        "reports": "البلاغات",
        "spam": "سبام / رسائل مزعجة",
        "inappropriate": "محتوى غير لائق",
        "harassment": "تحرش / إساءة",
        "fake-account": "حساب مزيف",
        "other-reason": "سبب آخر",
        "send-report": "إرسال البلاغ",

        // Notifications
        "notifications": "الإشعارات",
        "no-notifications": "لا توجد إشعارات",
        "mark-all-read": "تحديد الكل كمقروء",

        // Modals & Forms
        "select-college": "اختر الكلية",
        "select-department": "اختر القسم",
        "save-continue": "حفظ ومتابعة",
        "update-name": "تحديث الاسم",
        "your-full-name": "اسمك الثلاثي",
        "verify-identity": "التحقق من الهوية",
        "upload-id": "رفع صورة الكارنيه",

        // Buttons & Actions
        "refresh": "تحديث",
        "download": "تحميل",
        "upload": "رفع",
        "share": "مشاركة",
        "copy": "نسخ",
        "close": "إغلاق",
        "confirm": "تأكيد",
        "cancel": "إلغاء",
        "yes": "نعم",
        "no": "لا",
        "ok": "حسناً",
        "retry": "إعادة المحاولة",

        // UI & Validation
        "text-required": "النص مطلوب",
        "text-too-short": "النص قصير جداً",
        "text-too-long": "النص طويل جداً",
        "minimum": "على الأقل",
        "no-file-selected": "لم يتم اختيار ملف",
        "file-type-not-supported": "نوع الملف غير مدعوم",
        "file-too-large": "الملف كبير جداً (الحد الأقصى 10MB)",
        "sound-enabled": "🔔 تم تفعيل صوت الإشعارات",
        "sound-disabled": "🔕 تم إيقاف صوت الإشعارات",
        "toggle-sound": "تبديل الصوت",
        "clear-all": "مسح الكل",
        "no-internet": "لا يوجد اتصال بالإنترنت",
        "connection-restored": "تم استعادة الاتصال",

        // Streak & Gamification
        "streak-week": "🔥 أسبوع كامل! حافظ على نشاطك",
        "streak-month": "🏆 شهر كامل من النشاط! أنت بطل",
        "consecutive-days": "أيام متتالية",
        "start-today-rewards": "ابدأ اليوم واحصل على مكافآت يومية!",

        // Bookmarks & Notes
        "removed-from-favorites": "تم الإزالة من المفضلة",
        "added-to-favorites": "❤️ تم الإضافة للمفضلة",
        "note-deleted": "تم حذف الملاحظة",
        "note-saved": "📝 تم حفظ الملاحظة",
        "save-error": "حدث خطأ في الحفظ",
        "goal-set": "✅ تم تحديد هدف الأسبوع",
        "goal-achieved": "🎉 أحسنت! أنجزت هدف الأسبوع",

        // Features.js Panels & Stats
        "please-login": "يرجى تسجيل الدخول أولاً",
        "note": "ملاحظة",
        "lesson-id-optional": "معرف الدرس (اختياري)",
        "new": "جديد",
        "write-note-here": "اكتب ملاحظتك هنا...",
        "save-note": "حفظ الملاحظة",
        "no-notes-yet": "لا توجد ملاحظات بعد",
        "general-note": "ملاحظة عامة",
        "complete-100-xp": "إتمام 100 XP",
        "weekly-goal": "هدف الأسبوع",
        "week": "أسبوع",
        "change-goal": "تغيير الهدف",
        "btn-save": "حفظ",
        "my-weekly-goal": "هدفي الأسبوعي",
        "goal-saved": "✅ تم حفظ الهدف",
        "saved-items": "عنصر محفوظ",
        "no-favorites": "لا توجد عناصر في المفضلة",
        "tap-heart-to-add": "اضغط على قلب ❤️ لإضافة محتوى",
        "login-to-view-stats": "سجل دخولك لعرض الإحصائيات",
        "completed-quizzes": "كويز مكتمل",
        "average-score": "متوسط الدرجات",
        "xp-points": "نقاط XP",
        "days-on-platform": "يوم على المنصة",
        "current-streak": "Streak الحالي",
        "error-loading-stats": "خطأ في تحميل الإحصائيات",
        "please-login-first": "سجل دخولك أولاً",
        "locale": "ar-EG",
        "user": "مستخدم",

        // Auth.js Messages
        "name-too-short": "يرجى كتابة الاسم الثلاثي (5 حروف على الأقل)",
        "saving": "جاري الحفظ...",
        "name-updated": "✅ تم تحديث اسمك بنجاح!",
        "error-try-again": "حدث خطأ، حاول مرة أخرى",
        "save-and-enter": "حفظ والدخول للمنصة 🚀",
        "select-id-first": "يرجى اختيار صورة الكارنيه أولاً",
        "uploading-verifying": "جاري الرفع والتحقق...",
        "id-uploaded": "✅ تم رفع الهوية بنجاح. سيتم مراجعتها من قبل الإدارة.",
        "upload-failed": "فشل الرفع",
        "upload-id-activate": "رفع الكارنيه وتفعيل الحساب",
        "select-college-required": "يرجى اختيار الكلية",
        "select-department-required": "يرجى اختيار القسم",
        "error-occurred": "حدث خطأ",
        "uploading-photo": "جاري رفع الصورة...",
        "photo-upload-failed": "فشل رفع الصورة",
        "uploading-cover": "جاري رفع صورة الغلاف...",
        "cover-upload-failed": "فشل رفع صورة الغلاف",
        "theme-changed": "✅ تم تغيير لون الثيم",
        "name-cannot-be-empty": "⚠️ لا يمكن ترك الاسم فارغاً!",
        "profile-updated": "✅ تم تحديث بياناتك بنجاح",
        "save-changes": "حفظ التغييرات",
        "no-exam-details": "لا توجد تفاصيل للامتحان",
        "login-required": "يجب تسجيل الدخول",
        "account-banned": "⛔ تم حظر حسابك من قبل الإدارة.",
        "banned-from-platform": "⛔ تم حظرك من المنصة. تواصل مع الإدارة لمزيد من المعلومات.",
        "data-loading-error": "حدث خطأ في تحميل البيانات",
        "failed": "فشل",
        "error": "حدث خطأ",

        // Quiz.js - Anti-Cheat
        "warning": "تحذير",
        "remaining": "متبقي",
        "attempts": "محاولات",
        "quiz-ended-cheating": "تم إنهاء الاختبار بسبب محاولات غش متكررة",
        "quiz-cancelled": "تم إلغاء الاختبار",
        "violations-log": "سجل المخالفات",
        "btn-back": "العودة",

        // Quiz.js - Display
        "quizzes-restricted": "الاختبارات محظورة",
        "wait-verification": "يرجى انتظار توثيق حسابك للوصول للاختبارات",
        "searching-quizzes": "جاري البحث عن اختبارات كليتك...",
        "update-college-first": "يرجى تحديث بيانات كليتك في الملف الشخصي أولاً.",
        "no-quizzes-available": "لا توجد اختبارات متاحة حالياً.",
        "general-activity": "نشاط عام",
        "no-description": "لا يوجد وصف.",
        "minutes": "دقيقة",
        "attempts-ended": "انتهت المحاولات",
        "retry-quiz": "إعادة الاختبار",
        "start-quiz": "بدء الاختبار",
        "no-quizzes-for-dept": "لا توجد اختبارات متاحة لقسمك",
        "error-loading-exams": "حدث خطأ في تحميل الامتحانات.",

        // Support.js
        "technical-support": "الدعم الفني",
        "we-are-here-to-help": "نحن هنا لمساعدتك",
        "describe-issue": "مرحباً بك. صف مشكلتك وسنقوم بالرد عليك.",
        "attach-image": "إرفاق صورة",
        "write-message": "اكتب رسالتك...",
        "attached-image": "صورة مرفقة",
        "send-failed": "فشل الإرسال",
        "no-access": "⛔ ليس لديك صلاحية الوصول.",
        "support-dashboard": "لوحة الدعم الفني والتذاكر",
        "active-tickets": "التذاكر النشطة",
        "select-student": "حدد طالباً من القائمة لعرض المشكلة والرد عليها",
        "write-reply": "اكتب الرد هنا...",
        "btn-send": "إرسال",
        "no-tickets": "لا توجد تذاكر حالياً.",
        "chat-start": "بداية المحادثة.",
        "delete-chat-warning": "⚠️ تحذير: حذف المحادثة لا يمكن التراجع عنه!"
    },
    en: {
        // Navigation
        "nav-home": "Home",
        "nav-profile": "My Profile",
        "nav-sections": "Courses",
        "nav-assignments": "Assignments",
        "nav-quiz": "Quizzes",
        "nav-leaderboard": "Leaderboard",
        "nav-scores": "Grades",
        "nav-chat": "AI Assistant",
        "nav-support": "Support",
        "nav-messages": "Messages",
        "nav-menu": "Menu",

        // Admin Panel
        "admin-panel": "Admin Panel",
        "admin-cms": "Content Manager",
        "admin-quiz": "Quiz Manager",
        "admin-users": "Student Management",
        "admin-assign": "Assignments",
        "admin-live": "Live Stream",
        "admin-settings": "Settings",
        "admin-id-review": "ID Review",
        "admin-support": "Support Tickets",

        // Buttons
        "btn-login": "Login",
        "btn-logout": "Logout",
        "btn-back": "Back",
        "btn-save": "Save",
        "btn-cancel": "Cancel",
        "btn-submit": "Submit",
        "btn-delete": "Delete",
        "btn-edit": "Edit",
        "btn-add": "Add",
        "btn-search": "Search",

        // Settings
        "theme-dark": "Dark Mode",
        "theme-light": "Light Mode",
        "lang-ar": "Arabic",
        "lang-en": "English",
        "switch-to-en": "English",
        "switch-to-ar": "عربي",

        // Home Screen
        "welcome-msg": "Welcome to Masar Platform",
        "streak-title": "Learning Streak",
        "progress-title": "Overall Progress",
        "live-now": "Live Now",
        "quick-access": "Quick Access",
        "recent-activity": "Recent Activity",

        // Home Page
        "welcome-hero": "Hey Champion",
        "welcome-subtitle": "Keep progressing, you're building your future!",
        "start-studying": "Start Studying",
        "test-yourself": "Test Yourself",
        "my-stats": "My Stats",
        "click-details": "Click to view details",
        "my-notes": "My Notes",
        "click-add-note": "Click to add a note",
        "my-weekly-goals": "Weekly Goals",
        "favorites": "Favorites",
        "saved-content": "Saved Content",
        "subjects": "Subjects",
        "daily-activity": "Daily Activity",
        "day-streak": "day streak",
        "best-day": "Best",
        "days": "days",

        // Profile
        "profile-verified": "Verified",
        "profile-not-verified": "Not Verified",
        "profile-edit": "Edit Profile",
        "profile-college": "College",
        "profile-department": "Department",

        // Quiz
        "quiz-start": "Start Quiz",
        "quiz-submit": "Submit",
        "quiz-next": "Next",
        "quiz-prev": "Previous",
        "quiz-result": "Result",
        "quiz-time": "Time Left",

        // Common
        "loading": "Loading...",
        "error": "An error occurred",
        "success": "Success!",
        "confirm-delete": "Are you sure you want to delete?",
        "no-data": "No data available",

        // Sidebar Extended
        "register-attendance": "Register Attendance",
        "nav-attendance": "My Attendance",
        "nav-notifications": "Notifications",
        "nav-settings": "Settings",
        "nav-dark-mode": "Dark Mode",
        "nav-light-mode": "Light Mode",
        "qr-attendance": "Show Attendance QR",
        "attendance-records": "Attendance Records",
        "attendance-stats": "Attendance Stats",

        // Profile & Social
        "followers": "Followers",
        "following": "Following",
        "follow": "Follow",
        "unfollow": "Unfollow",
        "follows-you": "Follows you",
        "report-user": "Report",
        "block-user": "Block",
        "points": "Points",
        "best-streak": "Best Streak",
        "grades-log": "Grades Log",
        "my-exams": "My Recent Exams",
        "suggested-users": "Suggested Users",

        // Admin Dashboard Cards
        "urgent-alert": "Public Alert",
        "announcement-bar": "Announcement Bar",
        "connected-devices": "Connected Devices",
        "login-logs": "Login Logs",
        "statistics": "Statistics",
        "scheduled-notifications": "Scheduled Notifications",
        "advanced-export": "Advanced Export",
        "quiz-attempts": "Quiz Attempts",
        "bonus-all": "Bonus for All",
        "copy-emails": "Copy Emails",
        "reset-results": "Reset Results",
        "wipe-platform": "Wipe Platform",
        "all-colleges": "All Colleges",
        "all-departments": "All Departments",
        "search-student": "Search by name or email...",
        "online-first": "Online First",
        "verified-only": "Verified Only",
        "student-count": "student",
        "loading-students": "Loading students database...",
        "no-students": "No registered students",
        "student-management": "Student Management",

        // Chat & Messages
        "group-chat": "University Hub",
        "write-message": "Write your message...",
        "send": "Send",
        "reply": "Reply",
        "delete-msg": "Delete Message",
        "edit-msg": "Edit Message",
        "voice-record": "Voice Record",
        "attach-file": "Attach File",
        "chat-locked": "Chat is currently locked",

        // Reports
        "reports": "Reports",
        "spam": "Spam / Annoying Messages",
        "inappropriate": "Inappropriate Content",
        "harassment": "Harassment / Abuse",
        "fake-account": "Fake Account",
        "other-reason": "Other Reason",
        "send-report": "Send Report",

        // Notifications
        "notifications": "Notifications",
        "no-notifications": "No notifications",
        "mark-all-read": "Mark all as read",

        // Modals & Forms
        "select-college": "Select College",
        "select-department": "Select Department",
        "save-continue": "Save & Continue",
        "update-name": "Update Name",
        "your-full-name": "Your Full Name",
        "verify-identity": "Verify Identity",
        "upload-id": "Upload ID Card",

        // Buttons & Actions
        "refresh": "Refresh",
        "download": "Download",
        "upload": "Upload",
        "share": "Share",
        "copy": "Copy",
        "close": "Close",
        "confirm": "Confirm",
        "cancel": "Cancel",
        "yes": "Yes",
        "no": "No",
        "ok": "OK",
        "retry": "Retry",

        // UI & Validation
        "text-required": "Text is required",
        "text-too-short": "Text is too short",
        "text-too-long": "Text is too long",
        "minimum": "minimum",
        "no-file-selected": "No file selected",
        "file-type-not-supported": "File type not supported",
        "file-too-large": "File is too large (Max 10MB)",
        "sound-enabled": "🔔 Notification sound enabled",
        "sound-disabled": "🔕 Notification sound disabled",
        "toggle-sound": "Toggle Sound",
        "clear-all": "Clear All",
        "no-internet": "No internet connection",
        "connection-restored": "Connection restored",

        // Streak & Gamification
        "streak-week": "🔥 One week streak! Keep going",
        "streak-month": "🏆 One month streak! You're a champion",
        "consecutive-days": "consecutive days",
        "start-today-rewards": "Start today and earn daily rewards!",

        "removed-from-favorites": "Removed from favorites",
        "added-to-favorites": "❤️ Added to favorites",
        "note-deleted": "Note deleted",
        "note-saved": "📝 Note saved",
        "save-error": "Error saving",
        "goal-set": "✅ Weekly goal set",
        "goal-achieved": "🎉 Great job! Weekly goal achieved",

        // Features.js Panels & Stats
        "please-login": "Please login first",
        "note": "note",
        "lesson-id-optional": "Lesson ID (optional)",
        "new": "New",
        "write-note-here": "Write your note here...",
        "save-note": "Save Note",
        "no-notes-yet": "No notes yet",
        "general-note": "General note",
        "complete-100-xp": "Complete 100 XP",
        "weekly-goal": "Weekly Goal",
        "week": "Week",
        "change-goal": "Change Goal",
        "btn-save": "Save",
        "my-weekly-goal": "My Weekly Goal",
        "goal-saved": "✅ Goal saved",
        "saved-items": "saved item",
        "no-favorites": "No items in favorites",
        "tap-heart-to-add": "Tap ❤️ to add content",
        "login-to-view-stats": "Login to view stats",
        "completed-quizzes": "Quiz completed",
        "average-score": "Average Score",
        "xp-points": "XP Points",
        "days-on-platform": "Days on platform",
        "current-streak": "Current Streak",
        "error-loading-stats": "Error loading stats",
        "please-login-first": "Please login first",
        "locale": "en-US",
        "user": "User",

        // Auth.js Messages
        "name-too-short": "Please enter your full name (at least 5 characters)",
        "saving": "Saving...",
        "name-updated": "✅ Name updated successfully!",
        "error-try-again": "An error occurred, please try again",
        "save-and-enter": "Save & Enter Platform 🚀",
        "select-id-first": "Please select your ID card image first",
        "uploading-verifying": "Uploading and verifying...",
        "id-uploaded": "✅ ID uploaded successfully. Will be reviewed by admin.",
        "upload-failed": "Upload failed",
        "upload-id-activate": "Upload ID & Activate Account",
        "select-college-required": "Please select your college",
        "select-department-required": "Please select your department",
        "error-occurred": "An error occurred",
        "uploading-photo": "Uploading photo...",
        "photo-upload-failed": "Photo upload failed",
        "uploading-cover": "Uploading cover photo...",
        "cover-upload-failed": "Cover photo upload failed",
        "theme-changed": "✅ Theme color changed",
        "name-cannot-be-empty": "⚠️ Name cannot be empty!",
        "profile-updated": "✅ Profile updated successfully",
        "save-changes": "Save Changes",
        "no-exam-details": "No exam details available",
        "login-required": "Login required",
        "account-banned": "⛔ Your account has been banned by admin.",
        "banned-from-platform": "⛔ You have been banned from the platform. Contact admin for more info.",
        "data-loading-error": "Error loading data",
        "failed": "Failed",
        "error": "An error occurred",

        // Quiz.js - Anti-Cheat
        "warning": "Warning",
        "remaining": "remaining",
        "attempts": "attempts",
        "quiz-ended-cheating": "Quiz ended due to repeated cheating attempts",
        "quiz-cancelled": "Quiz Cancelled",
        "violations-log": "Violations Log",
        "btn-back": "Back",

        // Quiz.js - Display
        "quizzes-restricted": "Quizzes Restricted",
        "wait-verification": "Please wait for your account verification to access quizzes",
        "searching-quizzes": "Searching for your college quizzes...",
        "update-college-first": "Please update your college info in your profile first.",
        "no-quizzes-available": "No quizzes available currently.",
        "general-activity": "General Activity",
        "no-description": "No description.",
        "minutes": "minutes",
        "attempts-ended": "Attempts Ended",
        "retry-quiz": "Retry Quiz",
        "start-quiz": "Start Quiz",
        "no-quizzes-for-dept": "No quizzes available for your department",
        "error-loading-exams": "Error loading exams.",

        // Support.js
        "technical-support": "Technical Support",
        "we-are-here-to-help": "We are here to help you",
        "describe-issue": "Welcome! Describe your issue and we will reply.",
        "attach-image": "Attach Image",
        "write-message": "Write your message...",
        "attached-image": "Attached image",
        "send-failed": "Send failed",
        "no-access": "⛔ You don't have access permission.",
        "support-dashboard": "Support Dashboard & Tickets",
        "active-tickets": "Active Tickets",
        "select-student": "Select a student from the list to view their issue and reply",
        "write-reply": "Write your reply here...",
        "btn-send": "Send",
        "no-tickets": "No tickets currently.",
        "chat-start": "Start of conversation.",
        "delete-chat-warning": "⚠️ Warning: Deleting chat cannot be undone!"
    }
};

// الحصول على اللغة الحالية
export const getCurrentLanguage = () => {
    return localStorage.getItem('nebras-lang') || 'ar';
};

// دالة لتطبيق اللغة على الصفحة
export const applyLanguage = (lang) => {
    // 1. تغيير اتجاه الصفحة
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;

    // 2. تحديث النصوص بناءً على مفاتيح data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });

    // 3. تحديث أزرار اللغة
    const langToggleText = document.getElementById('lang-toggle-text');
    const langBadge = document.getElementById('current-lang-badge');

    if (langToggleText) {
        langToggleText.textContent = lang === 'ar' ? 'English' : 'عربي';
    }
    if (langBadge) {
        langBadge.textContent = lang === 'ar' ? 'AR' : 'EN';
    }

    // 4. تبديل مواقع العناصر حسب اللغة (RTL/LTR)
    const sidebar = document.getElementById('sidebar');
    const menuToggleBtn = document.getElementById('mobile-menu-btn');

    if (sidebar) {
        if (lang === 'ar') {
            // عربي: السايدبار على اليمين
            sidebar.classList.remove('left-0', 'border-r', '-translate-x-full');
            sidebar.classList.add('right-0', 'border-l', 'translate-x-full');
        } else {
            // إنجليزي: السايدبار على اليسار
            sidebar.classList.remove('right-0', 'border-l', 'translate-x-full');
            sidebar.classList.add('left-0', 'border-r', '-translate-x-full');
        }
    }

    if (menuToggleBtn) {
        if (lang === 'ar') {
            menuToggleBtn.classList.remove('left-4');
            menuToggleBtn.classList.add('right-4');
        } else {
            menuToggleBtn.classList.remove('right-4');
            menuToggleBtn.classList.add('left-4');
        }
    }

    // 5. حفظ التفضيل في التخزين المحلي
    localStorage.setItem('nebras-lang', lang);

    // 6. إرسال event للتطبيقات الأخرى
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
};

// تبديل اللغة
export const toggleLanguage = () => {
    const currentLang = getCurrentLanguage();
    const newLang = currentLang === 'ar' ? 'en' : 'ar';
    applyLanguage(newLang);

    // إظهار toast
    window.showToast?.(newLang === 'ar' ? 'تم التغيير للعربية' : 'Changed to English', 'success');
};

// الحصول على ترجمة
export const t = (key) => {
    const lang = getCurrentLanguage();
    return translations[lang][key] || key;
};

// تهيئة اللغة عند التحميل
export const initLanguage = () => {
    const savedLang = localStorage.getItem('nebras-lang') || 'ar';
    applyLanguage(savedLang);
};

// تفعيل الدوال على window
window.toggleLanguage = toggleLanguage;
window.getCurrentLanguage = getCurrentLanguage;
window.t = t;

// تبديل الثيم من السايدبار
window.toggleSidebarTheme = () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // تحديث الأيقونة والنص
    const icon = document.getElementById('sidebar-theme-icon');
    const text = document.getElementById('sidebar-theme-text');
    const lang = getCurrentLanguage();

    if (icon) {
        icon.className = `fas ${isDark ? 'fa-sun' : 'fa-moon'} w-6 text-center text-yellow-500`;
    }
    if (text) {
        text.textContent = isDark
            ? (lang === 'ar' ? 'الوضع الفاتح' : 'Light Mode')
            : (lang === 'ar' ? 'الوضع الداكن' : 'Dark Mode');
    }
};

// تهيئة عند التحميل
document.addEventListener('DOMContentLoaded', () => {
    initLanguage();

    // تحديث ثيم الأيقونة
    const isDark = document.documentElement.classList.contains('dark');
    const icon = document.getElementById('sidebar-theme-icon');
    const text = document.getElementById('sidebar-theme-text');
    const lang = getCurrentLanguage();

    if (icon) {
        icon.className = `fas ${isDark ? 'fa-sun' : 'fa-moon'} w-6 text-center text-yellow-500`;
    }
    if (text) {
        text.textContent = isDark
            ? (lang === 'ar' ? 'الوضع الفاتح' : 'Light Mode')
            : (lang === 'ar' ? 'الوضع الداكن' : 'Dark Mode');
    }
});