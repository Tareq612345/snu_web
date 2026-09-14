// ============================================================
// attendance.js - نظام تسجيل الحضور بالـ QR Code + GPS
// ============================================================

import { db, auth, SUPER_ADMIN_EMAIL } from './firebase.js';
import { UNIVERSITY_STRUCTURE, getStructureName } from './structure.js';
import {
    doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
    collection, getDocs, query, where, orderBy, serverTimestamp, arrayUnion, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ============================================================
// 1. إعدادات النظام
// ============================================================
const QR_REFRESH_INTERVAL = 30000; // 30 ثانية
const GPS_RADIUS_METERS = 5000; // 5 كيلومتر (للتجربة - يمكن تقليله لاحقاً)

let currentQRInterval = null;
let currentSessionId = null;

// ============================================================
// 2. توليد رمز QR فريد
// ============================================================
const generateUniqueCode = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `ATT-${timestamp}-${random}`;
};

// ============================================================
// 3. التحقق من الموقع GPS
// ============================================================
const verifyGPSLocation = (targetLat, targetLng, radius = GPS_RADIUS_METERS) => {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('جهازك لا يدعم تحديد الموقع GPS'));
            return;
        }

        // طلب إذن الموقع أولاً
        navigator.permissions?.query({ name: 'geolocation' }).then(result => {
            if (result.state === 'denied') {
                reject(new Error('تم رفض إذن الموقع. يرجى تفعيله من إعدادات المتصفح'));
                return;
            }
        }).catch(() => {
            // بعض المتصفحات لا تدعم permissions API
        });

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const distance = calculateDistance(latitude, longitude, targetLat, targetLng);

                if (distance <= radius) {
                    resolve({ verified: true, distance, coords: { latitude, longitude } });
                } else {
                    resolve({ verified: false, distance, coords: { latitude, longitude } });
                }
            },
            (error) => {
                let errorMsg = 'فشل الحصول على الموقع';
                switch (error.code) {
                    case 1: errorMsg = '🚫 تم رفض إذن الموقع. يرجى السماح بالوصول للموقع من إعدادات المتصفح'; break;
                    case 2: errorMsg = '📍 لا يمكن تحديد موقعك حالياً. تأكد من تفعيل GPS'; break;
                    case 3: errorMsg = '⏱️ انتهت مهلة تحديد الموقع. حاول مرة أخرى في مكان مفتوح'; break;
                }
                reject(new Error(errorMsg));
            },
            {
                enableHighAccuracy: false,  // أسرع 
                timeout: 30000,  // 30 ثانية
                maximumAge: 120000 // قبول موقع عمره دقيقتين
            }
        );
    });
};

// حساب المسافة بين نقطتين (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // radius of Earth in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // distance in meters
};

// ============================================================
// 4. إنشاء جلسة حضور جديدة (للأدمن/الدكتور)
// ============================================================
window.createAttendanceSession = async (scope = {}) => {
    const user = auth.currentUser;
    if (!user) return alert('يجب تسجيل الدخول أولاً');

    // التحقق من صلاحية الأدمن
    const hasAccess = await checkAttendanceAdminAccess(user.email, scope);
    if (!hasAccess) return alert('ليس لديك صلاحية لإنشاء جلسة حضور');

    try {
        // الحصول على الموقع الحالي للأدمن
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
        });

        const sessionData = {
            createdBy: user.uid,
            createdByEmail: user.email,
            createdByName: user.displayName,
            scope: scope, // { type: 'college'|'department'|'all', collegeId, departmentId, skipGPS }
            subjectId: scope.subjectId || null,
            subjectName: scope.subjectName || 'بدون مادة',
            location: {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                radius: GPS_RADIUS_METERS
            },
            currentCode: generateUniqueCode(),
            codeGeneratedAt: serverTimestamp(),
            isActive: true,
            attendees: [],
            absentees: [], // سيُملأ عند إغلاق الجلسة
            markAbsent: scope.markAbsent || false,
            createdAt: serverTimestamp()
        };

        const sessionRef = await addDoc(collection(db, "attendance_sessions"), sessionData);
        currentSessionId = sessionRef.id;

        // تحديث الكود كل 30 ثانية
        startQRRefresh(sessionRef.id);

        return sessionRef.id;
    } catch (e) {
        console.error('Error creating session:', e);
        alert('خطأ في إنشاء الجلسة: ' + e.message);
        return null;
    }
};

// ============================================================
// 5. تحديث الـ QR Code كل 30 ثانية مع animación دائرية
// ============================================================
let countdownInterval = null;

const startQRRefresh = (sessionId) => {
    if (currentQRInterval) clearInterval(currentQRInterval);
    if (countdownInterval) clearInterval(countdownInterval);

    let secondsLeft = 30;

    // تحديث العد التنازلي كل ثانية
    countdownInterval = setInterval(() => {
        secondsLeft--;

        const timerEl = document.getElementById('qr-timer');
        const circleEl = document.getElementById('qr-countdown-circle');

        if (timerEl) {
            timerEl.textContent = secondsLeft;
            // تغيير اللون عند الاقتراب من الصفر
            if (secondsLeft <= 5) {
                timerEl.classList.remove('text-accent-500');
                timerEl.classList.add('text-red-500');
            } else {
                timerEl.classList.remove('text-red-500');
                timerEl.classList.add('text-accent-500');
            }
        }

        if (circleEl) {
            // 283 = 2 * π * 45 (circumference)
            const offset = 283 - (283 * secondsLeft / 30);
            circleEl.style.strokeDashoffset = offset;

            if (secondsLeft <= 5) {
                circleEl.setAttribute('stroke', '#ef4444');
            } else {
                circleEl.setAttribute('stroke', '#22c55e');
            }
        }

        if (secondsLeft <= 0) {
            secondsLeft = 30;
        }
    }, 1000);

    // تحديث الكود كل 30 ثانية
    currentQRInterval = setInterval(async () => {
        const newCode = generateUniqueCode();
        await updateDoc(doc(db, "attendance_sessions", sessionId), {
            currentCode: newCode,
            codeGeneratedAt: serverTimestamp()
        });

        // تحديث العرض
        updateQRDisplay(newCode);

        // إعادة العداد
        secondsLeft = 30;
    }, QR_REFRESH_INTERVAL);
};

// ============================================================
// 6. إيقاف جلسة الحضور مع تسجيل الغياب
// ============================================================
window.stopAttendanceSession = async (sessionId, skipConfirm = false) => {
    if (currentQRInterval) {
        clearInterval(currentQRInterval);
        currentQRInterval = null;
    }

    // التحقق من وجود sessionId
    if (!sessionId) {
        currentSessionId = null;
        return;
    }

    try {
        // جلب بيانات الجلسة
        const sessionDoc = await getDoc(doc(db, "attendance_sessions", sessionId));
        if (!sessionDoc.exists()) {
            currentSessionId = null;
            return;
        }

        const sessionData = sessionDoc.data();

        // إذا كان تسجيل الغياب مفعل ولم يتم التأكيد بعد
        if (sessionData.markAbsent && !skipConfirm) {
            window.showAttendanceCloseConfirm(sessionId, sessionData);
            return;
        }

        // إغلاق الجلسة
        await updateDoc(doc(db, "attendance_sessions", sessionId), {
            isActive: false,
            endedAt: serverTimestamp()
        });

        currentSessionId = null;
        window.showToast?.('تم إيقاف جلسة الحضور', 'success');
    } catch (e) {
        console.error('Error stopping session:', e);
    }
};

// ============================================================
// 6.1 نافذة تأكيد إغلاق الجلسة
// ============================================================
window.showAttendanceCloseConfirm = (sessionId, sessionData) => {
    const attendeesCount = sessionData.attendees?.length || 0;

    const confirmModal = document.createElement('div');
    confirmModal.id = 'attendance-close-confirm';
    confirmModal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4';
    confirmModal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
            <div class="text-center mb-6">
                <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-user-times text-3xl text-red-500"></i>
                </div>
                <h3 class="text-xl font-black dark:text-white mb-2">إغلاق جلسة الحضور</h3>
                <p class="text-surface-500 text-sm">📚 ${sessionData.subjectName || 'المادة'}</p>
            </div>
            
            <div class="bg-surface-50 dark:bg-surface-700/50 rounded-2xl p-4 mb-6 text-center">
                <p class="text-3xl font-black text-accent-500 mb-1">${attendeesCount}</p>
                <p class="text-sm text-surface-500">طالب حضروا</p>
            </div>
            
            <div class="flex items-center gap-3 mb-6 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-xl">
                <input type="checkbox" id="confirm-mark-absent" checked class="w-5 h-5 accent-red-500">
                <label for="confirm-mark-absent" class="text-sm font-bold text-yellow-700 dark:text-yellow-300">
                    تسجيل الطلاب الغير موجودين كغياب
                </label>
            </div>
            
            <div class="flex gap-3">
                <button onclick="document.getElementById('attendance-close-confirm').remove()" 
                    class="flex-1 py-3 rounded-xl border-2 font-bold text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 transition">
                    إلغاء
                </button>
                <button onclick="window.confirmCloseAttendance('${sessionId}')" 
                    class="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition">
                    <i class="fas fa-check"></i> تأكيد الإغلاق
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(confirmModal);
};

// ============================================================
// 6.2 تأكيد إغلاق الجلسة وتسجيل الغياب
// ============================================================
window.confirmCloseAttendance = async (sessionId) => {
    const markAbsentChecked = document.getElementById('confirm-mark-absent')?.checked;
    document.getElementById('attendance-close-confirm')?.remove();

    try {
        const sessionDoc = await getDoc(doc(db, "attendance_sessions", sessionId));
        const sessionData = sessionDoc.data();

        if (markAbsentChecked && sessionData.scope?.departmentId) {
            // جلب طلاب القسم وتسجيل الغياب
            await markAbsentStudents(sessionId, sessionData);
        }

        // إغلاق الجلسة
        await updateDoc(doc(db, "attendance_sessions", sessionId), {
            isActive: false,
            endedAt: serverTimestamp()
        });

        currentSessionId = null;
        window.showToast?.('تم إغلاق الجلسة وتسجيل الغياب', 'success');

    } catch (e) {
        console.error('Error closing session:', e);
        window.showToast?.('حدث خطأ', 'error');
    }
};

// ============================================================
// 6.3 تسجيل الغياب للطلاب الذين لم يحضروا
// ============================================================
const markAbsentStudents = async (sessionId, sessionData) => {
    try {
        // جلب طلاب القسم
        const studentsQuery = query(
            collection(db, "users"),
            where("collegeId", "==", sessionData.scope.collegeId),
            where("departmentId", "==", sessionData.scope.departmentId)
        );

        const studentsSnap = await getDocs(studentsQuery);
        const allStudents = [];
        studentsSnap.forEach(doc => {
            allStudents.push({ uid: doc.id, ...doc.data() });
        });

        // تحديد الطلاب الغائبين
        const attendees = sessionData.attendees || [];
        const absentees = allStudents.filter(s => !attendees.includes(s.uid));

        // تسجيل كل طالب غائب
        for (const student of absentees) {
            await addDoc(collection(db, "attendance_records"), {
                sessionId,
                subjectId: sessionData.subjectId,
                subjectName: sessionData.subjectName,
                studentId: student.uid,
                studentName: student.name || student.displayName,
                studentEmail: student.email,
                collegeId: student.collegeId,
                departmentId: student.departmentId,
                status: 'absent', // غياب
                timestamp: serverTimestamp(),
                createdBy: sessionData.createdByEmail
            });
        }

        // تحديث الجلسة بقائمة الغائبين
        await updateDoc(doc(db, "attendance_sessions", sessionId), {
            absentees: absentees.map(s => s.uid),
            totalStudents: allStudents.length
        });

        console.log(`Marked ${absentees.length} students as absent`);

    } catch (e) {
        console.error('Error marking absences:', e);
    }
};

// ============================================================
// 7. تسجيل حضور الطالب (مسح الـ QR)
// ============================================================
window.recordStudentAttendance = async (scannedCode) => {
    const user = auth.currentUser;
    if (!user) return { success: false, message: 'يجب تسجيل الدخول أولاً' };

    try {
        // البحث عن الجلسة النشطة بالكود
        const sessionsQuery = query(
            collection(db, "attendance_sessions"),
            where("currentCode", "==", scannedCode),
            where("isActive", "==", true),
            limit(1)
        );
        const sessionsSnap = await getDocs(sessionsQuery);

        if (sessionsSnap.empty) {
            return { success: false, message: '❌ الكود غير صالح أو منتهي الصلاحية' };
        }

        const sessionDoc = sessionsSnap.docs[0];
        const sessionData = sessionDoc.data();

        // التحقق من النطاق (كلية/قسم)
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data() || {};

        if (sessionData.scope?.type === 'college' && userData.collegeId !== sessionData.scope.collegeId) {
            return { success: false, message: '❌ هذه الجلسة ليست لكليتك' };
        }
        if (sessionData.scope?.type === 'department' &&
            (userData.collegeId !== sessionData.scope.collegeId || userData.departmentId !== sessionData.scope.departmentId)) {
            return { success: false, message: '❌ هذه الجلسة ليست لقسمك' };
        }

        // التحقق من GPS (إلا إذا تم تخطيه)
        if (!sessionData.scope?.skipGPS) {
            try {
                const gpsResult = await verifyGPSLocation(sessionData.location.lat, sessionData.location.lng, sessionData.location.radius);
                if (!gpsResult.verified) {
                    return { success: false, message: `❌ أنت خارج نطاق المحاضرة (${Math.round(gpsResult.distance)} متر)` };
                }
            } catch (gpsError) {
                return { success: false, message: gpsError.message || '❌ يجب تفعيل الموقع GPS' };
            }
        }

        // التحقق من عدم التسجيل مسبقاً
        if (sessionData.attendees?.includes(user.uid)) {
            return { success: false, message: '⚠️ تم تسجيل حضورك مسبقاً' };
        }

        // تسجيل الحضور
        await updateDoc(doc(db, "attendance_sessions", sessionDoc.id), {
            attendees: arrayUnion(user.uid)
        });

        // حفظ سجل مفصل
        await addDoc(collection(db, "attendance_records"), {
            sessionId: sessionDoc.id,
            studentId: user.uid,
            studentName: userData.displayName || user.displayName,
            studentEmail: user.email,
            collegeId: userData.collegeId,
            departmentId: userData.departmentId,
            timestamp: serverTimestamp(),
            gpsVerified: true,
            createdBy: sessionData.createdByEmail
        });

        // إضافة XP للطالب
        window.addXP?.(10, 'حضور محاضرة');

        // صوت نجاح التسجيل + اهتزاز
        try {
            const successSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            successSound.volume = 0.5;
            successSound.play().catch(() => { });

            // اهتزاز الجهاز (Haptic Feedback)
            if ('vibrate' in navigator) {
                navigator.vibrate([100, 50, 100]); // اهتزاز قصير مرتين
            }
        } catch (e) { }

        // التحقق من نسبة الحضور وإرسال تحذير لو < 75%
        checkAttendanceWarning(user.uid, sessionData.subjectId, sessionData.subjectName);

        return { success: true, message: '✅ تم تسجيل حضورك بنجاح!' };

    } catch (e) {
        console.error('Record attendance error:', e);
        return { success: false, message: 'خطأ: ' + e.message };
    }
};

// ============================================================
// 8. التحقق من صلاحية أدمن الحضور (دعم صلاحيات المادة)
// ============================================================
const checkAttendanceAdminAccess = async (email, scope) => {
    if (email === SUPER_ADMIN_EMAIL) return true;

    try {
        const adminDoc = await getDoc(doc(db, "admins", email));
        if (!adminDoc.exists()) return false;

        const adminData = adminDoc.data();

        // 1. التحقق من صلاحية أدمن المادة
        if (adminData.permissions?.subjects && scope.subjectId) {
            // لو عنده صلاحية للمادة المحددة
            if (adminData.permissions.subjects.includes(scope.subjectId)) {
                return true;
            }
        }

        // 2. لو عنده صلاحية attendance أو users
        if (adminData.permissions?.attendance || adminData.permissions?.users) {
            // صلاحية شاملة (بدون نطاق)
            if (!adminData.scope?.collegeId) return true;

            // صلاحية على مستوى الكلية
            if (scope.type === 'college' && adminData.scope.collegeId === scope.collegeId) return true;

            // صلاحية على مستوى القسم
            if (scope.type === 'department' &&
                adminData.scope.collegeId === scope.collegeId &&
                adminData.scope.departmentId === scope.departmentId) return true;
        }
    } catch (e) {
        console.error('Check admin access error:', e);
    }
    return false;
};

// ============================================================
// 8.1 التحقق من صلاحية أدمن المادة
// ============================================================
window.checkSubjectAdminAccess = async (email, subjectId) => {
    if (email === SUPER_ADMIN_EMAIL) return true;

    try {
        const adminDoc = await getDoc(doc(db, "admins", email));
        if (!adminDoc.exists()) return false;

        const adminData = adminDoc.data();

        // صلاحية attendance شاملة
        if (adminData.permissions?.attendance && !adminData.scope?.collegeId) return true;

        // صلاحية للمادة المحددة
        if (adminData.permissions?.subjects?.includes(subjectId)) return true;

    } catch (e) {
        console.error('Check subject admin error:', e);
    }
    return false;
};

// ============================================================
// 9. واجهة عرض الـ QR Code (للأدمن)
// ============================================================
window.openAttendanceAdminPanel = async () => {
    const user = auth.currentUser;
    if (!user) return alert('يجب تسجيل الدخول');

    // التحقق من الصلاحية
    const isOwner = user.email === SUPER_ADMIN_EMAIL;
    let adminData = null;

    if (!isOwner) {
        const adminDoc = await getDoc(doc(db, "admins", user.email));
        if (!adminDoc.exists() || !adminDoc.data().permissions?.attendance) {
            return alert('ليس لديك صلاحية الحضور');
        }
        adminData = adminDoc.data();
    }

    // بناء قائمة الكليات/الأقسام حسب الصلاحية
    let scopeOptions = '';
    if (isOwner) {
        scopeOptions = `
            <option value="all">🏛️ جميع الكليات والأقسام</option>
            ${UNIVERSITY_STRUCTURE.map(c => `
                <option value="college:${c.id}">🎓 ${c.name}</option>
                ${c.departments.map(d => `
                    <option value="dept:${c.id}:${d.id}">📚 ${c.name} - ${d.name}</option>
                `).join('')}
            `).join('')}
        `;
    } else if (adminData?.scope?.collegeId) {
        const college = UNIVERSITY_STRUCTURE.find(c => c.id === adminData.scope.collegeId);
        if (adminData.scope.departmentId) {
            const dept = college?.departments.find(d => d.id === adminData.scope.departmentId);
            scopeOptions = `<option value="dept:${college.id}:${dept.id}">📚 ${college?.name} - ${dept?.name}</option>`;
        } else {
            scopeOptions = `
                <option value="college:${college?.id}">🎓 ${college?.name}</option>
                ${college?.departments.map(d => `
                    <option value="dept:${college.id}:${d.id}">📚 ${college?.name} - ${d.name}</option>
                `).join('')}
            `;
        }
    }

    const modal = document.createElement('div');
    modal.id = 'attendance-admin-modal';
    modal.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div class="bg-gradient-to-r from-accent-500 to-accent-600 p-6 text-white">
                <div class="flex justify-between items-center">
                    <h2 class="text-2xl font-black flex items-center gap-3">
                        <i class="fas fa-qrcode"></i> نظام الحضور
                    </h2>
                    <button onclick="document.getElementById('attendance-admin-modal').remove(); window.stopAttendanceSession?.()" 
                        class="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition flex items-center justify-center">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <div id="attendance-admin-content" class="p-6">
                <!-- قبل بدء الجلسة -->
                <div id="session-setup">
                    <div class="mb-4">
                        <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">نطاق الحضور:</label>
                        <select id="attendance-scope" onchange="window.loadSubjectsForAttendance()" class="w-full p-4 border-2 rounded-2xl dark:bg-surface-700 dark:text-white font-bold outline-none focus:border-accent-500">
                            ${scopeOptions}
                        </select>
                    </div>
                    
                    <!-- اختيار المادة -->
                    <div class="mb-4">
                        <label class="block text-sm font-bold text-surface-600 dark:text-surface-300 mb-2">📚 المادة الدراسية:</label>
                        <select id="attendance-subject" class="w-full p-4 border-2 rounded-2xl dark:bg-surface-700 dark:text-white font-bold outline-none focus:border-accent-500">
                            <option value="">-- اختر المادة --</option>
                        </select>
                        <p class="text-xs text-surface-400 mt-1">المواد تُجلب من قائمة المحتوى الدراسي</p>
                    </div>
                    
                    <!-- خيارات إضافية -->
                    <div class="mb-4 space-y-3 bg-surface-50 dark:bg-surface-700/50 p-4 rounded-2xl">
                        <!-- تخطي GPS -->
                        <div class="flex items-center gap-3">
                            <input type="checkbox" id="skip-gps-check" class="w-5 h-5 accent-yellow-500">
                            <label for="skip-gps-check" class="text-sm font-bold text-surface-600 dark:text-surface-300">
                                <i class="fas fa-map-marker-alt text-yellow-500"></i> تخطي التحقق من الموقع
                            </label>
                        </div>
                        <!-- تسجيل الغياب -->
                        <div class="flex items-center gap-3">
                            <input type="checkbox" id="mark-absent-check" checked class="w-5 h-5 accent-red-500">
                            <label for="mark-absent-check" class="text-sm font-bold text-surface-600 dark:text-surface-300">
                                <i class="fas fa-user-times text-red-500"></i> تسجيل الغياب تلقائياً عند الإغلاق
                            </label>
                        </div>
                    </div>
                    
                    <button onclick="window.startAttendanceQR()" 
                        class="w-full bg-gradient-to-r from-accent-500 to-accent-600 text-white py-5 rounded-2xl font-black text-xl hover:shadow-lg hover:shadow-accent-500/30 transition transform hover:scale-105 flex items-center justify-center gap-3">
                        <i class="fas fa-play-circle text-2xl"></i>
                        بدء جلسة الحضور
                    </button>
                    
                    <p class="text-center text-sm text-surface-400 mt-4">
                        <i class="fas fa-info-circle"></i> سيتم توليد QR Code يتغير كل 30 ثانية
                    </p>
                </div>
                
                <!-- بعد بدء الجلسة -->
                <div id="session-active" class="hidden text-center">
                    <div id="qr-display" class="bg-white p-6 rounded-2xl shadow-inner mb-6 inline-block">
                        <!-- QR Code will be displayed here -->
                    </div>
                    <!-- Circular Countdown Timer -->
                    <div class="relative w-24 h-24 mx-auto mb-4">
                        <svg class="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="45" stroke="#e5e7eb" stroke-width="8" fill="none"/>
                            <circle id="qr-countdown-circle" cx="50" cy="50" r="45" stroke="#22c55e" stroke-width="8" fill="none" 
                                stroke-linecap="round" stroke-dasharray="283" stroke-dashoffset="0"
                                style="transition: stroke-dashoffset 1s linear;"/>
                        </svg>
                        <div class="absolute inset-0 flex items-center justify-center">
                            <span id="qr-timer" class="text-3xl font-black text-accent-500">30</span>
                        </div>
                    </div>
                    <p class="text-surface-500 mb-4">ثانية حتى التحديث</p>
                    
                    <div class="bg-surface-100 dark:bg-surface-700 rounded-2xl p-4 mb-6">
                        <div class="flex items-center justify-center gap-2 text-2xl font-black text-accent-600">
                            <i class="fas fa-users"></i>
                            <span id="attendees-count">0</span>
                        </div>
                        <p class="text-sm text-surface-500">طالب سجلوا حضورهم</p>
                    </div>
                    
                    <button onclick="window.stopAttendanceSession(window.currentAttendanceSession); document.getElementById('session-active').classList.add('hidden'); document.getElementById('session-setup').classList.remove('hidden');" 
                        class="w-full bg-red-500 hover:bg-red-600 text-white py-4 rounded-2xl font-bold transition flex items-center justify-center gap-2">
                        <i class="fas fa-stop-circle"></i> إيقاف الجلسة
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) { window.stopAttendanceSession?.(currentSessionId); modal.remove(); } };
};

// ============================================================
// 10. تحميل المواد حسب النطاق المختار (من Firestore مباشرة)
// ============================================================
window.loadSubjectsForAttendance = async () => {
    const scopeValue = document.getElementById('attendance-scope')?.value;
    const subjectSelect = document.getElementById('attendance-subject');

    console.log('🔍 loadSubjectsForAttendance called with scope:', scopeValue);

    if (!subjectSelect) {
        console.log('❌ Subject select element not found!');
        return;
    }

    subjectSelect.innerHTML = '<option value="">جاري التحميل...</option>';

    let collegeId = null;
    let deptId = null;

    if (scopeValue?.startsWith('college:')) {
        collegeId = scopeValue.split(':')[1];
    } else if (scopeValue?.startsWith('dept:')) {
        const parts = scopeValue.split(':');
        collegeId = parts[1];
        deptId = parts[2];
    } else if (scopeValue === 'all') {
        collegeId = 'all';
    }

    console.log('📍 Extracted collegeId:', collegeId, 'deptId:', deptId);

    if (!collegeId) {
        subjectSelect.innerHTML = '<option value="">-- اختر النطاق أولاً --</option>';
        return;
    }

    try {
        // جلب المواد من Firestore مباشرة
        const sectionsSnap = await getDocs(collection(db, "study_sections"));
        console.log(`📚 Found ${sectionsSnap.size} sections in study_sections`);

        // عرض بيانات أول section للتشخيص
        if (sectionsSnap.size > 0) {
            const firstDoc = sectionsSnap.docs[0];
            console.log('📋 Sample section data:', firstDoc.id, firstDoc.data()?.targets, firstDoc.data()?.targetColleges);
        }

        const subjects = [];
        sectionsSnap.forEach(doc => {
            const data = doc.data();
            const section = { id: doc.id, title: data.title || 'بدون عنوان' };

            let shouldInclude = false;

            // حالة 1: الفورمات الجديد (targets array)
            if (data.targets && Array.isArray(data.targets) && data.targets.length > 0) {
                shouldInclude = data.targets.some(t => {
                    if (t.collegeId === 'all') return true;
                    if (collegeId === 'all') return true;
                    if (t.collegeId === collegeId) {
                        if (!deptId || t.departmentId === deptId || t.departmentId === 'all' || !t.departmentId) {
                            return true;
                        }
                    }
                    return false;
                });
            }
            // حالة 2: الفورمات القديم (targetColleges array)
            else if (data.targetColleges && Array.isArray(data.targetColleges) && data.targetColleges.length > 0) {
                shouldInclude = data.targetColleges.includes('all') ||
                    data.targetColleges.includes(collegeId) ||
                    collegeId === 'all';
            }
            // حالة 3: مفيش أي استهداف = مادة عامة
            else {
                // لو مفيش استهداف، نعتبرها متاحة للكل
                shouldInclude = true;
            }

            if (shouldInclude && !subjects.find(s => s.id === section.id)) {
                subjects.push(section);
            }
        });

        console.log(`Filtered to ${subjects.length} subjects for college: ${collegeId}, dept: ${deptId}`);

        subjectSelect.innerHTML = '<option value="">-- اختر المادة --</option>';

        if (subjects.length === 0) {
            subjectSelect.innerHTML = '<option value="">لا توجد مواد مرفوعة لهذا النطاق</option>';
        } else {
            subjects.forEach(s => {
                subjectSelect.innerHTML += `<option value="${s.id}" data-name="${s.title}">${s.title}</option>`;
            });
        }

    } catch (e) {
        console.error('Load subjects error:', e);
        subjectSelect.innerHTML = '<option value="">خطأ في التحميل</option>';
    }
};

// تحميل المواد عند فتح النافذة
setTimeout(() => window.loadSubjectsForAttendance?.(), 500);

// ============================================================
// 11. بدء عرض الـ QR
// ============================================================
window.startAttendanceQR = async () => {
    const scopeValue = document.getElementById('attendance-scope').value;
    const skipGPS = document.getElementById('skip-gps-check')?.checked || false;
    const markAbsent = document.getElementById('mark-absent-check')?.checked || false;

    // الحصول على المادة المختارة
    const subjectSelect = document.getElementById('attendance-subject');
    const subjectId = subjectSelect?.value || null;
    const subjectName = subjectSelect?.options[subjectSelect.selectedIndex]?.text || 'بدون مادة';

    if (!subjectId) {
        window.showToast?.('يرجى اختيار المادة الدراسية', 'error');
        return;
    }

    let scope = { type: 'all' };

    if (scopeValue.startsWith('college:')) {
        scope = { type: 'college', collegeId: scopeValue.split(':')[1] };
    } else if (scopeValue.startsWith('dept:')) {
        const parts = scopeValue.split(':');
        scope = { type: 'department', collegeId: parts[1], departmentId: parts[2] };
    }

    // إضافة كل الخيارات
    scope.skipGPS = skipGPS;
    scope.markAbsent = markAbsent;
    scope.subjectId = subjectId;
    scope.subjectName = subjectName;

    const sessionId = await window.createAttendanceSession(scope);
    if (!sessionId) return;

    window.currentAttendanceSession = sessionId;

    const setupEl = document.getElementById('session-setup');
    const activeEl = document.getElementById('session-active');

    if (setupEl) setupEl.classList.add('hidden');
    if (activeEl) activeEl.classList.remove('hidden');

    // الحصول على الكود الحالي وعرضه
    const sessionDoc = await getDoc(doc(db, "attendance_sessions", sessionId));
    if (sessionDoc.exists()) {
        updateQRDisplay(sessionDoc.data().currentCode);
    }

    // بدء عد تنازلي
    startCountdown();

    // متابعة عدد الحاضرين
    watchAttendees(sessionId);
};

// تحديث عرض الـ QR
const updateQRDisplay = async (code) => {
    const container = document.getElementById('qr-display');
    if (!container) return;

    // تحميل مكتبة QR Code عند الحاجة
    await window.loadQRLibs?.();
    container.innerHTML = '';
    new QRCode(container, {
        text: code,
        width: 250,
        height: 250,
        colorDark: "#1f2937",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
};

// متابعة الحاضرين

const watchAttendees = (sessionId) => {
    onSnapshot(doc(db, "attendance_sessions", sessionId), (doc) => {
        const data = doc.data();
        const countEl = document.getElementById('attendees-count');
        if (countEl) countEl.textContent = data?.attendees?.length || 0;
    });
};

// ============================================================
// 11. واجهة الطالب (مسح الـ QR)
// ============================================================
window.openStudentAttendanceScanner = async () => {
    const user = auth.currentUser;
    if (!user) return alert('يجب تسجيل الدخول أولاً');

    const modal = document.createElement('div');
    modal.id = 'student-attendance-modal';
    modal.className = 'fixed inset-0 bg-black/90 z-[9999] flex flex-col items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="text-center text-white mb-6">
            <h2 class="text-2xl font-black mb-2"><i class="fas fa-camera"></i> تسجيل الحضور</h2>
            <p class="text-white/70">وجّه الكاميرا نحو الـ QR Code</p>
        </div>
        
        <div class="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden border-4 border-white/30">
            <video id="qr-video" class="w-full h-full object-cover"></video>
            <div class="absolute inset-0 border-4 border-accent-500 rounded-3xl pointer-events-none animate-pulse"></div>
        </div>
        
        <div id="scan-result" class="mt-6 text-center text-white"></div>
        
        <button onclick="window.closeAttendanceScanner()" 
            class="mt-6 bg-white/20 hover:bg-white/30 text-white px-8 py-3 rounded-full font-bold transition">
            <i class="fas fa-times"></i> إغلاق
        </button>
    `;
    document.body.appendChild(modal);

    // بدء الكاميرا
    startQRScanner();
};

// بدء الماسح
let qrScanner = null;
const startQRScanner = async () => {
    const video = document.getElementById('qr-video');
    if (!video) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        video.srcObject = stream;
        video.play();

        // استخدام مكتبة jsQR للمسح
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const scanLoop = () => {
            if (!document.getElementById('student-attendance-modal')) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }

            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code && code.data.startsWith('ATT-')) {
                    // تم المسح بنجاح
                    handleScannedCode(code.data, stream);
                    return;
                }
            }
            requestAnimationFrame(scanLoop);
        };
        requestAnimationFrame(scanLoop);

    } catch (e) {
        console.error('Camera error:', e);
        document.getElementById('scan-result').innerHTML = `
            <p class="text-red-400"><i class="fas fa-exclamation-triangle"></i> لا يمكن الوصول للكاميرا</p>
        `;
    }
};

// معالجة الكود المقروء
const handleScannedCode = async (code, stream) => {
    const resultEl = document.getElementById('scan-result');
    resultEl.innerHTML = '<i class="fas fa-spinner fa-spin text-3xl"></i>';

    const result = await window.recordStudentAttendance(code);

    if (result.success) {
        resultEl.innerHTML = `
            <div class="text-accent-400 text-xl font-bold animate-bounce">
                <i class="fas fa-check-circle text-5xl mb-3"></i>
                <p>${result.message}</p>
            </div>
        `;
        // إيقاف الكاميرا بعد النجاح
        stream.getTracks().forEach(track => track.stop());

        setTimeout(() => {
            document.getElementById('student-attendance-modal')?.remove();
        }, 2000);
    } else {
        resultEl.innerHTML = `
            <div class="text-red-400 font-bold">
                <i class="fas fa-times-circle text-3xl mb-2"></i>
                <p>${result.message}</p>
            </div>
        `;
        // متابعة المسح
        setTimeout(() => {
            resultEl.innerHTML = '';
            startQRScanner();
        }, 2000);
    }
};

// إغلاق الماسح
window.closeAttendanceScanner = () => {
    const video = document.getElementById('qr-video');
    if (video?.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    document.getElementById('student-attendance-modal')?.remove();
};

// ============================================================
// 12. سجلات الحضور (للدكتور/الأدمن)
// ============================================================
window.openAttendanceRecords = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const isOwner = user.email === SUPER_ADMIN_EMAIL;

    const modal = document.createElement('div');
    modal.id = 'attendance-records-modal';
    modal.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div class="bg-gradient-to-r from-primary-500 to-primary-600 p-6 text-white flex justify-between items-center">
                <h2 class="text-2xl font-black"><i class="fas fa-clipboard-list"></i> سجلات الحضور</h2>
                <div class="flex gap-2">
                    ${isOwner ? `
                        <button onclick="window.resetAllAttendance()" class="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-xl font-bold text-sm">
                            <i class="fas fa-trash"></i> تصفير الكل
                        </button>
                    ` : ''}
                    <button onclick="document.getElementById('attendance-records-modal').remove()" class="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition flex items-center justify-center">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div id="attendance-records-content" class="p-6 overflow-y-auto max-h-[70vh]">
                <div class="text-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-surface-400"></i></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    await loadAttendanceRecords();
};

// تحميل السجلات
const loadAttendanceRecords = async () => {
    const container = document.getElementById('attendance-records-content');
    if (!container) return;

    try {
        const user = auth.currentUser;
        let sessionsQuery = query(collection(db, "attendance_sessions"), orderBy("createdAt", "desc"), limit(50));

        // لو مش owner، نفلتر حسب المنشئ
        if (user.email !== SUPER_ADMIN_EMAIL) {
            sessionsQuery = query(
                collection(db, "attendance_sessions"),
                where("createdByEmail", "==", user.email),
                orderBy("createdAt", "desc"),
                limit(50)
            );
        }

        const sessionsSnap = await getDocs(sessionsQuery);

        if (sessionsSnap.empty) {
            container.innerHTML = '<p class="text-center text-surface-400 py-10">لا توجد سجلات حضور</p>';
            return;
        }

        let html = '<div class="space-y-4">';

        sessionsSnap.forEach(doc => {
            const data = doc.data();
            const date = data.createdAt?.toDate?.() || new Date();

            let scopeName = 'الجامعة كلها';
            if (data.scope?.type === 'college') {
                const result = getStructureName(data.scope.collegeId);
                scopeName = result.colName || data.scope.collegeId;
            } else if (data.scope?.type === 'department') {
                const result = getStructureName(data.scope.collegeId, data.scope.departmentId);
                scopeName = `${result.colName} - ${result.deptName}`;
            }

            html += `
                <div class="bg-surface-50 dark:bg-surface-700 rounded-2xl p-4 border dark:border-surface-600">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <p class="font-bold dark:text-white text-lg">${data.subjectName || 'بدون مادة'}</p>
                            <p class="text-sm text-primary-500 font-bold">${scopeName}</p>
                            <p class="text-xs text-surface-500">${date.toLocaleDateString('ar-EG')} - ${date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
                            <p class="text-xs text-surface-400">بواسطة: ${data.createdByName || data.createdByEmail}</p>
                        </div>
                        <div class="text-right">
                            <span class="px-3 py-1 rounded-full text-sm font-bold ${data.isActive ? 'bg-accent-100 text-accent-600' : 'bg-surface-200 text-surface-600'}">
                                ${data.isActive ? '🟢 نشطة' : '⚫ منتهية'}
                            </span>
                            <div class="flex gap-4 mt-2 justify-end">
                                <div class="text-center">
                                    <p class="text-xl font-black text-accent-600">${data.attendees?.length || 0}</p>
                                    <p class="text-xs text-surface-400">حاضر</p>
                                </div>
                                <div class="text-center">
                                    <p class="text-xl font-black text-red-500">${data.absentees?.length || 0}</p>
                                    <p class="text-xs text-surface-400">غائب</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="window.viewSessionAttendees('${doc.id}')" class="flex-1 bg-primary-100 dark:bg-primary-900/30 text-primary-600 py-2 rounded-xl font-bold text-sm hover:bg-primary-200 transition">
                            <i class="fas fa-users"></i> عرض التفاصيل
                        </button>
                        <button onclick="window.exportSessionToExcel('${doc.id}')" class="bg-accent-100 dark:bg-accent-900/30 text-accent-600 px-4 py-2 rounded-xl font-bold text-sm hover:bg-accent-200 transition">
                            <i class="fas fa-file-excel"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;

    } catch (e) {
        console.error('Load records error:', e);
        container.innerHTML = '<p class="text-red-500 text-center">خطأ في تحميل السجلات</p>';
    }
};

// ============================================================
// 13. عرض قائمة الحاضرين والغائبين (جميع طلاب القسم)
// ============================================================
window.viewSessionAttendees = async (sessionId) => {
    try {
        // جلب بيانات الجلسة
        const sessionDoc = await getDoc(doc(db, "attendance_sessions", sessionId));
        if (!sessionDoc.exists()) return alert('الجلسة غير موجودة');

        const sessionData = sessionDoc.data();
        const date = sessionData.createdAt?.toDate?.() || new Date();

        // جلب سجلات الحضور للجلسة
        const recordsQuery = query(
            collection(db, "attendance_records"),
            where("sessionId", "==", sessionId)
        );
        const recordsSnap = await getDocs(recordsQuery);

        // تجميع الحاضرين والغائبين من السجلات
        const attendanceMap = {};
        recordsSnap.forEach(doc => {
            const data = doc.data();
            attendanceMap[data.studentId] = {
                name: data.studentName || 'طالب',
                email: data.studentEmail || '',
                status: data.status || 'present',
                time: data.timestamp?.toDate?.()?.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) || ''
            };
        });

        // جلب جميع طلاب القسم
        let allStudents = [];
        if (sessionData.scope?.departmentId) {
            const studentsQuery = query(
                collection(db, "users"),
                where("collegeId", "==", sessionData.scope.collegeId),
                where("departmentId", "==", sessionData.scope.departmentId)
            );
            const studentsSnap = await getDocs(studentsQuery);
            studentsSnap.forEach(doc => {
                const data = doc.data();
                allStudents.push({
                    id: doc.id,
                    name: data.name || data.displayName || 'طالب',
                    email: data.email || ''
                });
            });
        }

        // تصنيف الطلاب
        const presentStudents = [];
        const absentStudents = [];

        allStudents.forEach(student => {
            if (attendanceMap[student.id]) {
                presentStudents.push({
                    ...student,
                    time: attendanceMap[student.id].time,
                    status: attendanceMap[student.id].status
                });
            } else if (sessionData.attendees?.includes(student.id)) {
                presentStudents.push({ ...student, time: '', status: 'present' });
            } else {
                absentStudents.push(student);
            }
        });

        // بناء الـ popup
        const popup = document.createElement('div');
        popup.id = 'attendees-popup';
        popup.className = 'fixed inset-0 bg-black/70 z-[10000] flex items-center justify-center p-4 animate-fade-in';
        popup.innerHTML = `
            <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
                <div class="bg-gradient-to-r from-primary-500 to-primary-600 p-5 text-white">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-xl font-black"><i class="fas fa-users"></i> سجل الحضور</h3>
                            <p class="text-sm opacity-80">${sessionData.subjectName || 'المادة'} - ${date.toLocaleDateString('ar-EG')}</p>
                        </div>
                        <button onclick="document.getElementById('attendees-popup').remove()" 
                            class="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition flex items-center justify-center">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- الإحصائيات -->
                <div class="flex gap-4 p-4 bg-surface-50 dark:bg-surface-700/50">
                    <div class="flex-1 text-center">
                        <p class="text-2xl font-black text-accent-500">${presentStudents.length}</p>
                        <p class="text-xs text-surface-500">حاضر</p>
                    </div>
                    <div class="flex-1 text-center">
                        <p class="text-2xl font-black text-red-500">${absentStudents.length}</p>
                        <p class="text-xs text-surface-500">غائب</p>
                    </div>
                    <div class="flex-1 text-center">
                        <p class="text-2xl font-black text-primary-500">${allStudents.length}</p>
                        <p class="text-xs text-surface-500">إجمالي</p>
                    </div>
                </div>
                
                <!-- التبويبات -->
                <div class="flex border-b dark:border-surface-700" id="attendance-tabs">
                    <button onclick="showAttendanceTab('present')" class="flex-1 py-3 font-bold text-accent-600 border-b-2 border-accent-500 bg-accent-50 dark:bg-accent-900/20" id="tab-present">
                        ✅ الحاضرين (${presentStudents.length})
                    </button>
                    <button onclick="showAttendanceTab('absent')" class="flex-1 py-3 font-bold text-surface-400 hover:text-red-500 transition" id="tab-absent">
                        ❌ الغائبين (${absentStudents.length})
                    </button>
                </div>
                
                <!-- قائمة الحاضرين -->
                <div id="list-present" class="p-4 overflow-y-auto max-h-[50vh]">
                    ${presentStudents.length === 0 ? '<p class="text-center text-surface-400 py-4">لا يوجد حاضرين</p>' : ''}
                    <div class="space-y-2">
                        ${presentStudents.map((s, i) => `
                            <div class="flex items-center gap-3 p-3 bg-accent-50 dark:bg-accent-900/20 rounded-xl border-r-4 border-accent-500">
                                <span class="w-8 h-8 rounded-full bg-accent-500 text-white flex items-center justify-center font-bold text-sm">${i + 1}</span>
                                <div class="flex-1">
                                    <p class="font-bold dark:text-white">${s.name}</p>
                                    <p class="text-xs text-surface-500">${s.email}</p>
                                </div>
                                <div class="text-right">
                                    <span class="text-xs bg-accent-500 text-white px-2 py-1 rounded-full">${s.status === 'absent' ? 'غائب' : 'حاضر'}</span>
                                    ${s.time ? `<p class="text-xs text-surface-400 mt-1">${s.time}</p>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <!-- قائمة الغائبين -->
                <div id="list-absent" class="p-4 overflow-y-auto max-h-[50vh] hidden">
                    ${absentStudents.length === 0 ? '<p class="text-center text-surface-400 py-4">لا يوجد غائبين 🎉</p>' : ''}
                    <div class="space-y-2">
                        ${absentStudents.map((s, i) => `
                            <div class="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border-r-4 border-red-500">
                                <span class="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-sm">${i + 1}</span>
                                <div class="flex-1">
                                    <p class="font-bold dark:text-white">${s.name}</p>
                                    <p class="text-xs text-surface-500">${s.email}</p>
                                </div>
                                <span class="text-xs bg-red-500 text-white px-2 py-1 rounded-full">غائب</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(popup);
        popup.onclick = (e) => { if (e.target === popup) popup.remove(); };

        // دالة تبديل التبويبات
        window.showAttendanceTab = (tab) => {
            const tabPresent = document.getElementById('tab-present');
            const tabAbsent = document.getElementById('tab-absent');
            const listPresent = document.getElementById('list-present');
            const listAbsent = document.getElementById('list-absent');

            if (tab === 'present') {
                tabPresent.className = 'flex-1 py-3 font-bold text-accent-600 border-b-2 border-accent-500 bg-accent-50 dark:bg-accent-900/20';
                tabAbsent.className = 'flex-1 py-3 font-bold text-surface-400 hover:text-red-500 transition';
                listPresent.classList.remove('hidden');
                listAbsent.classList.add('hidden');
            } else {
                tabAbsent.className = 'flex-1 py-3 font-bold text-red-600 border-b-2 border-red-500 bg-red-50 dark:bg-red-900/20';
                tabPresent.className = 'flex-1 py-3 font-bold text-surface-400 hover:text-accent-500 transition';
                listAbsent.classList.remove('hidden');
                listPresent.classList.add('hidden');
            }
        };

    } catch (e) {
        console.error('View attendees error:', e);
        alert('حدث خطأ في تحميل البيانات');
    }
};

// ============================================================
// 14. تصفير السجلات (للمالك فقط)
// ============================================================
window.resetAllAttendance = async () => {
    if (auth.currentUser?.email !== SUPER_ADMIN_EMAIL) {
        return alert('هذه الصلاحية للمالك فقط');
    }

    if (!confirm('⚠️ هل أنت متأكد من تصفير كل سجلات الحضور؟\n\nهذا الإجراء لا يمكن التراجع عنه!')) return;
    if (!confirm('تأكيد نهائي: سيتم حذف جميع سجلات الحضور للسنة كاملة!')) return;

    try {
        // حذف السجلات
        const recordsSnap = await getDocs(collection(db, "attendance_records"));
        const sessionsSnap = await getDocs(collection(db, "attendance_sessions"));

        const batch = [];
        recordsSnap.forEach(doc => batch.push(deleteDoc(doc.ref)));
        sessionsSnap.forEach(doc => batch.push(deleteDoc(doc.ref)));

        await Promise.all(batch);

        window.showToast?.('تم تصفير جميع السجلات', 'success');
        loadAttendanceRecords();

    } catch (e) {
        console.error('Reset error:', e);
        alert('خطأ: ' + e.message);
    }
};

// ============================================================
// 15. تصدير لـ Excel (جميع طلاب القسم)
// ============================================================
window.exportSessionToExcel = async (sessionId) => {
    try {
        window.showToast?.('جاري تحضير الملف...', 'info');

        // جلب بيانات الجلسة
        const sessionDoc = await getDoc(doc(db, "attendance_sessions", sessionId));
        if (!sessionDoc.exists()) {
            window.showToast?.('الجلسة غير موجودة', 'error');
            return;
        }

        const sessionData = sessionDoc.data();
        const date = sessionData.createdAt?.toDate?.() || new Date();

        // جلب سجلات الحضور
        const recordsQuery = query(
            collection(db, "attendance_records"),
            where("sessionId", "==", sessionId)
        );
        const recordsSnap = await getDocs(recordsQuery);

        // تجميع من سجل حضوره
        const attendanceMap = {};
        recordsSnap.forEach(doc => {
            const data = doc.data();
            attendanceMap[data.studentId] = {
                name: data.studentName || 'بدون اسم',
                email: data.studentEmail || '',
                status: data.status || 'present',
                time: data.timestamp?.toDate?.()?.toLocaleTimeString('ar-EG') || ''
            };
        });

        // جلب جميع طلاب القسم
        let allStudents = [];
        if (sessionData.scope?.departmentId) {
            const studentsQuery = query(
                collection(db, "users"),
                where("collegeId", "==", sessionData.scope.collegeId),
                where("departmentId", "==", sessionData.scope.departmentId)
            );
            const studentsSnap = await getDocs(studentsQuery);
            studentsSnap.forEach(doc => {
                const data = doc.data();
                allStudents.push({
                    id: doc.id,
                    name: data.name || data.displayName || 'بدون اسم',
                    email: data.email || ''
                });
            });
        }

        // تحضير البيانات - كل الطلاب
        let csvContent = `سجل حضور - ${sessionData.subjectName || 'المادة'}\n`;
        csvContent += `التاريخ: ${date.toLocaleDateString('ar-EG')}\n\n`;
        csvContent += "#,الاسم,الإيميل,الحالة,وقت التسجيل\n";

        let counter = 1;
        let presentCount = 0;

        // كل الطلاب
        allStudents.forEach(student => {
            const record = attendanceMap[student.id];
            // الطالب حاضر فقط لو موجود في attendance_records وstatus مش absent
            const isPresent = record && record.status !== 'absent';

            const status = isPresent ? 'حاضر' : 'غائب';
            const time = record?.time || '-';

            if (isPresent) presentCount++;

            csvContent += `${counter++},"${student.name}","${student.email}","${status}","${time}"\n`;
        });

        // إضافة ملخص
        const absentCount = allStudents.length - presentCount;

        csvContent += `\n`;
        csvContent += `الملخص:\n`;
        csvContent += `إجمالي الطلاب,${allStudents.length}\n`;
        csvContent += `الحاضرين,${presentCount}\n`;
        csvContent += `الغائبين,${absentCount}\n`;
        csvContent += `نسبة الحضور,${allStudents.length > 0 ? Math.round((presentCount / allStudents.length) * 100) : 0}%\n`;

        // إنشاء ملف وتحميله
        const BOM = '\uFEFF'; // لدعم اللغة العربية
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `حضور_${sessionData.subjectName || 'المادة'}_${date.toLocaleDateString('ar-EG').replace(/\//g, '-')}.csv`;
        a.click();

        URL.revokeObjectURL(url);
        window.showToast?.('تم تحميل الملف بنجاح', 'success');

    } catch (e) {
        console.error('Export error:', e);
        window.showToast?.('حدث خطأ في التصدير', 'error');
    }
};

// ============================================================
// 16. تصدير تقرير شامل لمادة
// ============================================================
window.exportSubjectReport = async (subjectId, subjectName) => {
    try {
        window.showToast?.('جاري تحضير التقرير...', 'info');

        // جلب كل سجلات المادة
        const recordsQuery = query(
            collection(db, "attendance_records"),
            where("subjectId", "==", subjectId)
        );
        const recordsSnap = await getDocs(recordsQuery);

        // تجميع البيانات حسب الطالب
        const studentStats = {};

        recordsSnap.forEach(doc => {
            const data = doc.data();
            if (!studentStats[data.studentId]) {
                studentStats[data.studentId] = {
                    name: data.studentName || 'بدون اسم',
                    email: data.studentEmail || '',
                    present: 0,
                    absent: 0
                };
            }
            if (data.status === 'absent') {
                studentStats[data.studentId].absent++;
            } else {
                studentStats[data.studentId].present++;
            }
        });

        // تحضير CSV
        let csvContent = "الاسم,الإيميل,الحضور,الغياب,النسبة\n";

        Object.values(studentStats).forEach(s => {
            const total = s.present + s.absent;
            const percentage = total > 0 ? Math.round((s.present / total) * 100) : 0;
            csvContent += `"${s.name}","${s.email}",${s.present},${s.absent},${percentage}%\n`;
        });

        // تحميل الملف
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `تقرير_حضور_${subjectName || 'المادة'}.csv`;
        a.click();

        URL.revokeObjectURL(url);
        window.showToast?.('تم تحميل التقرير بنجاح', 'success');

    } catch (e) {
        console.error('Export report error:', e);
        window.showToast?.('حدث خطأ', 'error');
    }
};

// ============================================================
// 17. صفحة الحضور للطالب
// ============================================================
window.openStudentAttendanceHistory = async () => {
    const user = auth.currentUser;
    if (!user) return alert('يجب تسجيل الدخول');

    const modal = document.createElement('div');
    modal.id = 'student-attendance-history';
    modal.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div class="bg-gradient-to-r from-primary-500 to-primary-600 p-6 text-white flex justify-between items-center">
                <h2 class="text-2xl font-black"><i class="fas fa-clipboard-check"></i> سجل حضوري</h2>
                <button onclick="document.getElementById('student-attendance-history').remove()" 
                    class="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition flex items-center justify-center">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div id="student-attendance-content" class="p-6 overflow-y-auto max-h-[70vh]">
                <div class="text-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-surface-400"></i></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    await loadStudentAttendanceHistory(user.uid);
};

// تحميل سجل الحضور للطالب
const loadStudentAttendanceHistory = async (studentId) => {
    const container = document.getElementById('student-attendance-content');
    if (!container) return;

    try {
        // جلب سجلات الطالب
        const recordsQuery = query(
            collection(db, "attendance_records"),
            where("studentId", "==", studentId),
            orderBy("timestamp", "desc")
        );
        const recordsSnap = await getDocs(recordsQuery);

        if (recordsSnap.empty) {
            container.innerHTML = '<p class="text-center text-surface-400 py-10">لا توجد سجلات حضور</p>';
            return;
        }

        // تجميع الإحصائيات حسب المادة
        const subjectStats = {};
        const recentRecords = [];

        recordsSnap.forEach(doc => {
            const data = doc.data();
            const subjectId = data.subjectId || 'unknown';

            if (!subjectStats[subjectId]) {
                subjectStats[subjectId] = {
                    name: data.subjectName || 'بدون مادة',
                    present: 0,
                    absent: 0
                };
            }

            if (data.status === 'absent') {
                subjectStats[subjectId].absent++;
            } else {
                subjectStats[subjectId].present++;
            }

            if (recentRecords.length < 10) {
                recentRecords.push(data);
            }
        });

        // بناء الواجهة
        let html = '';

        // إحصائيات المواد
        html += '<h3 class="font-black text-lg dark:text-white mb-4"><i class="fas fa-chart-bar text-primary-500"></i> إحصائيات المواد</h3>';
        html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">';

        Object.entries(subjectStats).forEach(([id, stats]) => {
            const total = stats.present + stats.absent;
            const percentage = total > 0 ? Math.round((stats.present / total) * 100) : 0;
            const isLow = percentage < 75;

            html += `
                <div class="p-4 rounded-2xl ${isLow ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800' : 'bg-surface-50 dark:bg-surface-700'}">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="font-bold dark:text-white">${stats.name}</h4>
                        ${isLow ? '<span class="text-xs bg-red-500 text-white px-2 py-1 rounded-full">⚠️ تحذير</span>' : ''}
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="flex-1">
                            <div class="h-3 bg-surface-200 dark:bg-surface-600 rounded-full overflow-hidden">
                                <div class="h-full ${isLow ? 'bg-red-500' : 'bg-accent-500'} rounded-full" style="width: ${percentage}%"></div>
                            </div>
                        </div>
                        <span class="text-2xl font-black ${isLow ? 'text-red-500' : 'text-accent-500'}">${percentage}%</span>
                    </div>
                    <div class="flex justify-between text-xs text-surface-500 mt-2">
                        <span>✅ حاضر: ${stats.present}</span>
                        <span>❌ غائب: ${stats.absent}</span>
                    </div>
                </div>
            `;
        });

        html += '</div>';

        // آخر السجلات
        html += '<h3 class="font-black text-lg dark:text-white mb-4"><i class="fas fa-history text-primary-500"></i> آخر السجلات</h3>';
        html += '<div class="space-y-2">';

        recentRecords.forEach(record => {
            const date = record.timestamp?.toDate?.() || new Date();
            const isAbsent = record.status === 'absent';

            html += `
                <div class="flex items-center gap-3 p-3 rounded-xl ${isAbsent ? 'bg-red-50 dark:bg-red-900/20' : 'bg-accent-50 dark:bg-accent-900/20'}">
                    <div class="w-10 h-10 rounded-full ${isAbsent ? 'bg-red-500' : 'bg-accent-500'} text-white flex items-center justify-center">
                        <i class="fas ${isAbsent ? 'fa-times' : 'fa-check'}"></i>
                    </div>
                    <div class="flex-1">
                        <p class="font-bold dark:text-white">${record.subjectName || 'بدون مادة'}</p>
                        <p class="text-xs text-surface-500">${date.toLocaleDateString('ar-EG')} - ${date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span class="text-sm font-bold ${isAbsent ? 'text-red-500' : 'text-accent-500'}">
                        ${isAbsent ? 'غائب' : 'حاضر'}
                    </span>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;

    } catch (e) {
        console.error('Load student history error:', e);
        container.innerHTML = '<p class="text-red-500 text-center">حدث خطأ</p>';
    }
};

// ============================================================
// 18. تحذير الطالب عند انخفاض الحضور < 75%
// ============================================================
const checkAttendanceWarning = async (studentId, subjectId, subjectName) => {
    try {
        const recordsQuery = query(
            collection(db, "attendance_records"),
            where("studentId", "==", studentId),
            where("subjectId", "==", subjectId)
        );
        const recordsSnap = await getDocs(recordsQuery);

        let present = 0, absent = 0;
        recordsSnap.forEach(doc => {
            if (doc.data().status === 'absent') absent++;
            else present++;
        });

        const total = present + absent;
        if (total < 3) return; // لا تحذير قبل 3 محاضرات

        const percentage = Math.round((present / total) * 100);

        if (percentage < 75) {
            // إرسال إشعار تحذيري
            window.showToast?.(`⚠️ تحذير: نسبة حضورك في ${subjectName} هي ${percentage}% فقط!`, 'warning');

            // إشعار Push لو متاح
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('⚠️ تحذير حضور', {
                    body: `نسبة حضورك في ${subjectName} هي ${percentage}% فقط! يجب أن تكون 75% على الأقل.`,
                    icon: 'https://cdn-icons-png.flaticon.com/512/3413/3413535.png'
                });
            }
        }
    } catch (e) {
        console.error('Check attendance warning error:', e);
    }
};

// ============================================================
// 19. Dashboard إحصائيات الحضور
// ============================================================
window.openAttendanceDashboard = async () => {
    const user = auth.currentUser;
    if (!user) return alert('يجب تسجيل الدخول');

    const modal = document.createElement('div');
    modal.id = 'attendance-dashboard';
    modal.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-white dark:bg-surface-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden">
            <div class="bg-gradient-to-r from-primary-500 to-primary-600 p-6 text-white flex justify-between items-center">
                <h2 class="text-2xl font-black"><i class="fas fa-chart-pie"></i> لوحة إحصائيات الحضور</h2>
                <button onclick="document.getElementById('attendance-dashboard').remove()" 
                    class="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition flex items-center justify-center">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div id="dashboard-content" class="p-6 overflow-y-auto max-h-[75vh]">
                <div class="text-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-surface-400"></i></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    await loadDashboardData();
};

const loadDashboardData = async () => {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    try {
        const user = auth.currentUser;

        // جلب الجلسات
        let sessionsQuery = query(collection(db, "attendance_sessions"), orderBy("createdAt", "desc"), limit(100));

        if (user.email !== SUPER_ADMIN_EMAIL) {
            sessionsQuery = query(
                collection(db, "attendance_sessions"),
                where("createdByEmail", "==", user.email),
                orderBy("createdAt", "desc"),
                limit(100)
            );
        }

        const sessionsSnap = await getDocs(sessionsQuery);

        // تجميع الإحصائيات
        let totalSessions = 0;
        let totalAttendees = 0;
        let totalAbsentees = 0;
        const subjectStats = {};
        const weeklyData = {};

        sessionsSnap.forEach(doc => {
            const data = doc.data();
            totalSessions++;
            totalAttendees += data.attendees?.length || 0;
            totalAbsentees += data.absentees?.length || 0;

            // إحصائيات المواد
            const subjectName = data.subjectName || 'بدون مادة';
            if (!subjectStats[subjectName]) {
                subjectStats[subjectName] = { sessions: 0, attendees: 0, absentees: 0 };
            }
            subjectStats[subjectName].sessions++;
            subjectStats[subjectName].attendees += data.attendees?.length || 0;
            subjectStats[subjectName].absentees += data.absentees?.length || 0;

            // بيانات أسبوعية
            const date = data.createdAt?.toDate?.();
            if (date) {
                const weekKey = getWeekNumber(date);
                if (!weeklyData[weekKey]) weeklyData[weekKey] = { attendees: 0, absentees: 0 };
                weeklyData[weekKey].attendees += data.attendees?.length || 0;
                weeklyData[weekKey].absentees += data.absentees?.length || 0;
            }
        });

        const avgPerSession = totalSessions > 0 ? Math.round(totalAttendees / totalSessions) : 0;
        const overallRate = (totalAttendees + totalAbsentees) > 0
            ? Math.round((totalAttendees / (totalAttendees + totalAbsentees)) * 100) : 0;

        // بناء الواجهة
        let html = `
            <!-- البطاقات الرئيسية -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div class="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-4 rounded-2xl text-center">
                    <p class="text-3xl font-black">${totalSessions}</p>
                    <p class="text-sm opacity-80">جلسة</p>
                </div>
                <div class="bg-gradient-to-br from-accent-500 to-accent-600 text-white p-4 rounded-2xl text-center">
                    <p class="text-3xl font-black">${totalAttendees}</p>
                    <p class="text-sm opacity-80">حاضر</p>
                </div>
                <div class="bg-gradient-to-br from-red-500 to-rose-600 text-white p-4 rounded-2xl text-center">
                    <p class="text-3xl font-black">${totalAbsentees}</p>
                    <p class="text-sm opacity-80">غائب</p>
                </div>
                <div class="bg-gradient-to-br from-primary-500 to-pink-600 text-white p-4 rounded-2xl text-center">
                    <p class="text-3xl font-black">${overallRate}%</p>
                    <p class="text-sm opacity-80">نسبة الحضور</p>
                </div>
            </div>

            <!-- رسم بياني بسيط -->
            <div class="bg-surface-50 dark:bg-surface-700 rounded-2xl p-4 mb-6">
                <h3 class="font-bold dark:text-white mb-4"><i class="fas fa-chart-bar text-primary-500"></i> نسبة الحضور لكل مادة</h3>
                <div class="space-y-3">
                    ${Object.entries(subjectStats).map(([name, stats]) => {
            const rate = (stats.attendees + stats.absentees) > 0
                ? Math.round((stats.attendees / (stats.attendees + stats.absentees)) * 100) : 0;
            return `
                            <div>
                                <div class="flex justify-between text-sm mb-1">
                                    <span class="font-bold dark:text-white">${name}</span>
                                    <span class="text-surface-500">${rate}% (${stats.sessions} جلسة)</span>
                                </div>
                                <div class="h-4 bg-surface-200 dark:bg-surface-600 rounded-full overflow-hidden">
                                    <div class="h-full ${rate >= 75 ? 'bg-accent-500' : 'bg-red-500'} rounded-full transition-all" style="width: ${rate}%"></div>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>

            <!-- أزرار التقارير -->
            <div class="flex flex-wrap gap-3">
                <button onclick="window.generateWeeklyReport()" class="flex-1 bg-primary-500 hover:bg-primary-600 text-white py-3 rounded-xl font-bold transition">
                    <i class="fas fa-calendar-week"></i> تقرير أسبوعي
                </button>
                <button onclick="window.generateMonthlyReport()" class="flex-1 bg-primary-500 hover:bg-primary-600 text-white py-3 rounded-xl font-bold transition">
                    <i class="fas fa-calendar-alt"></i> تقرير شهري
                </button>
                <button onclick="window.printAttendanceReport()" class="flex-1 bg-surface-500 hover:bg-surface-600 text-white py-3 rounded-xl font-bold transition">
                    <i class="fas fa-print"></i> طباعة
                </button>
            </div>
        `;

        container.innerHTML = html;

    } catch (e) {
        console.error('Load dashboard error:', e);
        container.innerHTML = '<p class="text-red-500 text-center">حدث خطأ</p>';
    }
};

// دالة مساعدة لرقم الأسبوع
const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

// ============================================================
// 20. التقارير الأسبوعية والشهرية
// ============================================================
window.generateWeeklyReport = async () => {
    await generateReport('week');
};

window.generateMonthlyReport = async () => {
    await generateReport('month');
};

const generateReport = async (period) => {
    try {
        window.showToast?.('جاري إنشاء التقرير...', 'info');

        const user = auth.currentUser;
        const now = new Date();
        let startDate;

        if (period === 'week') {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        // جلب الجلسات في الفترة
        let sessionsQuery = query(
            collection(db, "attendance_sessions"),
            where("createdAt", ">=", startDate),
            orderBy("createdAt", "desc")
        );

        if (user.email !== SUPER_ADMIN_EMAIL) {
            sessionsQuery = query(
                collection(db, "attendance_sessions"),
                where("createdByEmail", "==", user.email),
                where("createdAt", ">=", startDate),
                orderBy("createdAt", "desc")
            );
        }

        const sessionsSnap = await getDocs(sessionsQuery);

        // تحضير CSV
        let csvContent = `تقرير الحضور - ${period === 'week' ? 'أسبوعي' : 'شهري'}\n`;
        csvContent += `من: ${startDate.toLocaleDateString('ar-EG')} إلى: ${now.toLocaleDateString('ar-EG')}\n\n`;
        csvContent += "المادة,التاريخ,الحاضرين,الغائبين,النسبة\n";

        sessionsSnap.forEach(doc => {
            const data = doc.data();
            const date = data.createdAt?.toDate?.() || new Date();
            const attendees = data.attendees?.length || 0;
            const absentees = data.absentees?.length || 0;
            const total = attendees + absentees;
            const rate = total > 0 ? Math.round((attendees / total) * 100) : 0;

            csvContent += `"${data.subjectName || 'بدون مادة'}","${date.toLocaleDateString('ar-EG')}",${attendees},${absentees},${rate}%\n`;
        });

        // تحميل الملف
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `تقرير_${period === 'week' ? 'أسبوعي' : 'شهري'}_${now.toLocaleDateString('ar-EG').replace(/\//g, '-')}.csv`;
        a.click();

        URL.revokeObjectURL(url);
        window.showToast?.('تم تحميل التقرير بنجاح', 'success');

    } catch (e) {
        console.error('Generate report error:', e);
        window.showToast?.('حدث خطأ', 'error');
    }
};

// ============================================================
// 21. طباعة سجل الحضور
// ============================================================
window.printAttendanceReport = async () => {
    try {
        const user = auth.currentUser;

        // جلب آخر 50 جلسة
        let sessionsQuery = query(collection(db, "attendance_sessions"), orderBy("createdAt", "desc"), limit(50));

        if (user.email !== SUPER_ADMIN_EMAIL) {
            sessionsQuery = query(
                collection(db, "attendance_sessions"),
                where("createdByEmail", "==", user.email),
                orderBy("createdAt", "desc"),
                limit(50)
            );
        }

        const sessionsSnap = await getDocs(sessionsQuery);

        // إنشاء صفحة الطباعة
        let printContent = `
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>سجل الحضور</title>
                <style>
                    * { font-family: 'Segoe UI', Tahoma, sans-serif; }
                    body { padding: 20px; }
                    h1 { text-align: center; color: #2563eb; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 10px; text-align: center; }
                    th { background: #2563eb; color: white; }
                    tr:nth-child(even) { background: #f3f4f6; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <h1>📋 سجل الحضور</h1>
                <p style="text-align: center;">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')} - ${new Date().toLocaleTimeString('ar-EG')}</p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>المادة</th>
                            <th>التاريخ</th>
                            <th>الوقت</th>
                            <th>الحاضرين</th>
                            <th>الغائبين</th>
                            <th>النسبة</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let counter = 1;
        sessionsSnap.forEach(doc => {
            const data = doc.data();
            const date = data.createdAt?.toDate?.() || new Date();
            const attendees = data.attendees?.length || 0;
            const absentees = data.absentees?.length || 0;
            const total = attendees + absentees;
            const rate = total > 0 ? Math.round((attendees / total) * 100) : 0;

            printContent += `
                <tr>
                    <td>${counter++}</td>
                    <td>${data.subjectName || 'بدون مادة'}</td>
                    <td>${date.toLocaleDateString('ar-EG')}</td>
                    <td>${date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td style="color: green; font-weight: bold;">${attendees}</td>
                    <td style="color: red; font-weight: bold;">${absentees}</td>
                    <td style="font-weight: bold; color: ${rate >= 75 ? 'green' : 'red'};">${rate}%</td>
                </tr>
            `;
        });

        printContent += `
                    </tbody>
                </table>
                <div class="footer">
                    <p>تم إنشاء هذا التقرير بواسطة نظام الحضور الإلكتروني - مسار</p>
                </div>
                <script>window.onload = () => { window.print(); }</script>
            </body>
            </html>
        `;

        // فتح نافذة الطباعة
        const printWindow = window.open('', '_blank');
        printWindow.document.write(printContent);
        printWindow.document.close();

    } catch (e) {
        console.error('Print error:', e);
        window.showToast?.('حدث خطأ في الطباعة', 'error');
    }
};

// ============================================================
// 22. تصدير (الدوال معرفة على window object)
// ============================================================
// All functions are already attached to window object

console.log('📋 Attendance System loaded');
