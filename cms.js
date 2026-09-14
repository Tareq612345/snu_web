// ============================================================
// cms.js - إدارة المحتوى التعليمي، الملاحظات، الكويزات، والإشعارات
// ============================================================

import { db, auth, SUPER_ADMIN_EMAIL } from './firebase.js';
import { UNIVERSITY_STRUCTURE } from './structure.js';
import {
    collection, addDoc, getDocs, query, orderBy, doc, getDoc,
    deleteDoc, updateDoc, setDoc, onSnapshot, where, limit, writeBatch
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- الإعدادات السحابية (Cloudinary) ---
const CLOUDINARY_CLOUD_NAME = "dsdldwwhx";
const CLOUDINARY_UPLOAD_PRESET = "ml_default";

let quill = null;
let allSectionsCacheForQuiz = []; // متغير لتخزين المواد للكويز

// تهيئة مكتبة تغيير حجم الصور في المحرر
if (window.Quill && window.ImageResize) {
    try {
        if (!Quill.imports['modules/imageResize']) Quill.register('modules/imageResize', window.ImageResize);
    } catch (e) { console.warn("Quill ImageResize Error:", e); }
}

// ============================================================
// 1. أدوات المساعدة (Upload to Firebase Storage)
// ============================================================

import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { storage } from './firebase.js';

// ضغط الصور قبل الرفع
const compressImage = (file, maxWidth = 1200, quality = 0.7) => {
    return new Promise((resolve) => {
        // إذا لم تكن صورة، إرجاعها كما هي
        if (!file.type.startsWith('image/')) {
            resolve(file);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // تصغير الأبعاد مع الحفاظ على النسبة
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                if (height > maxWidth) {
                    width = (width * maxWidth) / height;
                    height = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    console.log(`📦 Image compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
                    resolve(compressedFile);
                }, 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

// رفع الملفات فعلياً إلى Cloudinary (لحل مشكلة مساحة Firebase)
export const uploadToCloudinary = async (file) => {
    try {
        // ضغط الصورة إذا كانت صورة وحجمها كبير
        let processedFile = file;
        if (file.type && file.type.startsWith('image/') && file.size > 500 * 1024) { // أكبر من 500KB
            processedFile = await compressImage(file, 1200, 0.7);
        }

        const formData = new FormData();
        formData.append('file', processedFile);
        formData.append('upload_preset', 'ml_default');

        // الاعتماد على دوال Cloudinary الافتراضية
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await res.json();
        
        if (data.secure_url) {
            console.log('✅ File uploaded to Cloudinary:', data.secure_url);
            return data.secure_url;
        } else {
            console.error("Cloudinary Upload Error Response:", data);
            throw new Error(data.error?.message || "فشل الرفع إلى Cloudinary");
        }
    } catch (error) {
        console.error("Cloudinary Error:", error);
        throw error;
    }
};

// ============================================================
// عرض PDF ملء الشاشة مع دعم Zoom المستقل
// ============================================================
window.openPDFFullscreen = (pdfUrl, allowDownload = true) => {
    // إزالة أي modal قديم
    document.getElementById('pdf-fullscreen-modal')?.remove();

    const pdfJsUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(pdfUrl)}`;

    const modal = document.createElement('div');
    modal.id = 'pdf-fullscreen-modal';
    modal.className = 'fixed inset-0 bg-black z-[9999] flex flex-col';
    modal.innerHTML = `
        <!-- Header -->
        <div class="flex items-center justify-between p-3 bg-surface-900 text-white">
            <span class="font-bold text-sm"><i class="fas fa-file-pdf text-red-500 ml-2"></i>عارض PDF</span>
            <div class="flex gap-2">
                ${allowDownload ? `<a href="${pdfUrl}" download class="bg-accent-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-accent-700 transition">
                    <i class="fas fa-download ml-1"></i>تحميل
                </a>` : ''}
                <button onclick="document.getElementById('pdf-fullscreen-modal').remove()" class="bg-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 transition">
                    <i class="fas fa-times ml-1"></i>إغلاق
                </button>
            </div>
        </div>
        
        <!-- PDF Viewer - يدعم الزوم المستقل -->
        <div class="flex-1 overflow-auto touch-pan-x touch-pan-y" style="-webkit-overflow-scrolling: touch;">
            <iframe 
                src="${pdfJsUrl}" 
                class="w-full h-full border-0" 
                style="min-height: 100vh;"
                allowfullscreen
            ></iframe>
        </div>
        
        <!-- Zoom Tip -->
        <div class="bg-surface-800 text-center py-2 text-xs text-surface-400">
            💡 استخدم أزرار الـ + و - في الشريط العلوي للـ PDF للتكبير
        </div>
    `;

    document.body.appendChild(modal);

    // منع scroll الصفحة الأصلية
    document.body.style.overflow = 'hidden';

    // استعادة scroll عند الإغلاق
    modal.addEventListener('remove', () => {
        document.body.style.overflow = '';
    });
};

// ============================================================
// وضع القراءة الكامل للـ PDF (Reading Mode) - يدعم Drive و PDF
// ============================================================
window.openFullscreenPDF = (pdfUrl, allowDownload = true) => {
    // إزالة أي modal قديم
    document.getElementById('reading-mode-modal')?.remove();

    // تحديد نوع الرابط
    const isDriveLink = pdfUrl.includes('drive.google.com') || pdfUrl.includes('docs.google.com');

    let embedUrl;
    let downloadUrl = pdfUrl;

    if (isDriveLink) {
        // تحويل رابط Drive للعرض
        const folderMatch = pdfUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
        if (folderMatch) {
            embedUrl = `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#grid`;
            downloadUrl = pdfUrl; // Folders cannot easily be downloaded directly
        } else {
            const fileIdMatch = pdfUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || pdfUrl.match(/id=([a-zA-Z0-9_-]+)/);
            if (fileIdMatch) {
                embedUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
                downloadUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
            } else {
                embedUrl = pdfUrl.replace('/view', '/preview').replace('/open?', '/file/d/');
            }
        }
    } else {
        // رابط PDF مباشر - استخدام pdf.js
        embedUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(pdfUrl)}`;
    }

    const modal = document.createElement('div');
    modal.id = 'reading-mode-modal';
    modal.className = 'fixed inset-0 bg-black z-[9999] flex flex-col';
    modal.innerHTML = `
        <!-- Header -->
        <div class="flex items-center justify-between p-3 bg-gradient-to-r from-primary-900 to-primary-900 text-white shadow-lg">
            <div class="flex items-center gap-3">
                <i class="fas fa-book-reader text-2xl text-primary-300"></i>
                <div>
                    <span class="font-bold text-lg">وضع القراءة</span>
                    <p class="text-xs text-primary-200 opacity-80">${isDriveLink ? 'Google Drive Viewer' : 'يمكنك التكبير والتصغير بحرية'}</p>
                </div>
            </div>
            <div class="flex gap-2">
                ${allowDownload ? `<a href="${downloadUrl}" ${isDriveLink ? 'target="_blank"' : 'download'} class="bg-accent-600 hover:bg-accent-700 px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-lg">
                    <i class="fas fa-download"></i>
                    <span class="hidden sm:inline">تحميل</span>
                </a>
                <a href="${pdfUrl}" target="_blank" class="bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-lg">
                    <i class="fas fa-external-link-alt"></i>
                    <span class="hidden sm:inline">فتح خارجياً</span>
                </a>` : ''}
                <button id="close-reading-mode" class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-lg">
                    <i class="fas fa-times"></i>
                    <span class="hidden sm:inline">إغلاق</span>
                </button>
            </div>
        </div>
        
        <!-- PDF/Drive Viewer Container -->
        <div class="flex-1 relative bg-surface-900">
            ${isDriveLink ? `
                <!-- Google Drive Embed - إخفاء شريط التحميل العلوي -->
                <div class="absolute top-0 right-0 w-20 h-14 bg-surface-900 z-10"></div>
                <iframe 
                    src="${embedUrl}" 
                    class="w-full h-full border-0"
                    style="min-height: calc(100vh - 60px);"
                    allow="autoplay"
                    allowfullscreen
                ></iframe>
            ` : `
                <!-- PDF.js Viewer -->
                <iframe 
                    src="${embedUrl}" 
                    class="w-full h-full border-0"
                    style="min-height: calc(100vh - 60px);"
                    allowfullscreen
                ></iframe>
            `}
        </div>
    `;

    document.body.appendChild(modal);

    // منع scroll الصفحة الأصلية
    document.body.style.overflow = 'hidden';

    // Close button
    document.getElementById('close-reading-mode').onclick = () => {
        modal.remove();
        document.body.style.overflow = '';
    };

    // ESC key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.body.style.overflow = '';
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
};

const transformUrlForEmbed = (url, allowDownload = true) => {
    if (!url) return '';
    let processedUrl = url.trim();
    if (processedUrl.startsWith('n/file/d/')) processedUrl = 'https://drive.google.com/' + processedUrl.substring(2);
    const lowerUrl = processedUrl.toLowerCase();

    if (processedUrl.includes('drive.google.com') || processedUrl.includes('docs.google.com') || processedUrl.match(/\/d\/([a-zA-Z0-9_-]{25,})/)) {
        let embedUrl = processedUrl;
        const folderMatch = processedUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
        if (folderMatch) {
            embedUrl = `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#grid`;
        } else {
            const fileMatch = processedUrl.match(/\/d\/([a-zA-Z0-9_-]{25,})/) || processedUrl.match(/id=([a-zA-Z0-9_-]{25,})/);
            if (fileMatch) {
                embedUrl = `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
            } else {
                embedUrl = processedUrl.replace('/view', '/preview').replace('/open?', '/file/d/');
            }
        }
        return `<div class="mt-6 border-2 border-primary-50 rounded-2xl shadow-inner bg-surface-50 dark:bg-surface-800 overflow-hidden relative">
            <!-- Header with buttons -->
            <div class="flex items-center justify-between p-3 bg-surface-100 dark:bg-surface-700 border-b dark:border-surface-600">
                <span class="text-sm font-bold text-surface-600 dark:text-surface-300"><i class="fab fa-google-drive text-primary-500 ml-2"></i>ملف Google Drive</span>
                <div class="flex gap-2 flex-wrap">
                    <button onclick="window.openFullscreenPDF('${processedUrl}', ${allowDownload})" class="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary-700 transition">
                        <i class="fas fa-book-reader ml-1"></i>وضع القراءة
                    </button>
                    ${allowDownload ? `<a href="${processedUrl}" target="_blank" class="bg-accent-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-accent-700 transition">
                        <i class="fas fa-download ml-1"></i>تحميل
                    </a>` : ''}
                </div>
            </div>
            <!-- Drive Embed -->
            <div class="h-[500px] md:h-[600px] relative">
                <div class="absolute top-0 right-0 w-16 h-14 bg-surface-100 dark:bg-surface-700 z-10 rounded-bl-xl"></div>
                <iframe src="${embedUrl}" allow="autoplay; fullscreen" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" class="w-full h-full border-0"></iframe>
            </div>
        </div>`;
    }
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        let vId = url.split('v=')[1] || url.split('.be/')[1];
        if (vId) vId = vId.split('&')[0];
        return `<div class="mt-6 aspect-video rounded-2xl overflow-hidden shadow-xl border-4 border-white dark:border-surface-700"><iframe class="w-full h-full" src="https://www.youtube.com/embed/${vId}" allowfullscreen></iframe></div>`;
    }
    if (lowerUrl.match(/\.(mp4|webm|ogg)$/i)) {
        return `<video controls class="w-full mt-6 rounded-2xl shadow-lg border-4 border-white dark:border-surface-700"><source src="${url}">متصفحك لا يدعم الفيديو.</video>`;
    }
    if (lowerUrl.includes('.pdf')) {
        // إنشاء ID فريد للـ PDF
        const pdfId = 'pdf_' + Math.random().toString(36).substr(2, 9);
        const pdfJsUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(url)}`;

        return `
            <div class="mt-6 border rounded-2xl overflow-hidden shadow-lg bg-surface-50 dark:bg-surface-800">
                <div class="flex items-center justify-between p-3 bg-surface-100 dark:bg-surface-700 border-b dark:border-surface-600 flex-wrap gap-2">
                    <span class="text-sm font-bold text-surface-600 dark:text-surface-300"><i class="fas fa-file-pdf text-red-500 ml-2"></i>ملف PDF</span>
                    <div class="flex gap-2 flex-wrap">
                        <button onclick="window.openPDFFullscreen('${url}', ${allowDownload})" class="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary-700 transition">
                            <i class="fas fa-expand ml-1"></i>فتح ملء الشاشة (Zoom)
                        </button>
                        ${allowDownload ? `<a href="${url}" download class="bg-accent-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-accent-700 transition">
                            <i class="fas fa-download ml-1"></i>تحميل
                        </a>` : ''}
                    </div>
                </div>
                <div class="h-[400px] md:h-[600px] bg-surface-200 dark:bg-surface-900 flex items-center justify-center">
                    <button onclick="window.openPDFFullscreen('${url}', ${allowDownload})" class="bg-white dark:bg-surface-800 px-8 py-6 rounded-2xl shadow-lg hover:scale-105 transition text-center">
                        <i class="fas fa-file-pdf text-6xl text-red-500 mb-4"></i>
                        <p class="font-bold text-surface-700 dark:text-surface-200">اضغط لعرض الـ PDF</p>
                        <p class="text-xs text-surface-400 mt-2">🔍 يدعم الزوم بالصابعين</p>
                    </button>
                </div>
            </div>
        `;
    }
    if (lowerUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
        return `<img src="${url}" loading="lazy" class="max-w-full rounded-2xl shadow-lg mx-auto mt-6 border-4 border-white dark:border-surface-700 hover:scale-[1.01] transition transform cursor-pointer" onclick="window.open('${url}')">`;
    }
    return `<a href="${url}" target="_blank" class="flex items-center gap-3 mt-6 p-4 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-xl border border-primary-100 dark:border-primary-800 transition hover:bg-primary-100 hover:scale-[1.02] transform"><i class="fas fa-external-link-alt text-xl"></i> <span class="font-bold underline">فتح الملف المرفق</span></a>`;
};

// ============================================================
// 2. نظام الإشعارات
// ============================================================

export const sendNotification = async (userId, message, link = '#') => {
    try {
        await addDoc(collection(db, "notifications"), {
            userId, message, link, read: false, createdAt: new Date()
        });
    } catch (e) { console.error("Notification Error:", e); }
};

export const setupNotificationListener = (userId) => {
    const q = query(collection(db, "notifications"), where("userId", "==", userId), orderBy("createdAt", "desc"), limit(20));

    onSnapshot(q, (snap) => {
        const list = document.getElementById('notification-list');
        const badge = document.getElementById('notif-badge');
        if (!list) return;

        let unread = 0;
        let html = '';

        snap.docChanges().forEach(change => {
            if (change.type === "added" && !change.doc.data().read) {
                new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => { });
            }
        });

        if (snap.empty) {
            html = '<div class="p-8 text-center text-surface-400 text-sm"><i class="fas fa-bell-slash text-2xl mb-2 block opacity-20"></i>لا توجد تنبيهات جديدة</div>';
        } else {
            snap.forEach(d => {
                const n = d.data();
                if (!n.read) unread++;
                html += `
                    <div class="p-4 border-b dark:border-surface-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer transition ${!n.read ? 'bg-primary-50/50 dark:bg-primary-500/10 border-r-4 border-r-primary-500' : ''}" 
                         onclick="window.markNotifRead('${d.id}', '${n.link}')">
                        <p class="text-sm font-bold dark:text-white leading-tight">${n.message}</p>
                        <span class="text-[10px] text-surface-400 mt-1 block font-mono">${n.createdAt?.toDate().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>`;
            });
        }
        list.innerHTML = html;
        if (badge) {
            if (unread > 0) {
                badge.classList.remove('hidden');
                badge.textContent = unread > 9 ? '+9' : unread;
            } else {
                badge.classList.add('hidden');
            }
        }
    });

    onSnapshot(doc(db, "system", "urgent_alert"), (snap) => {
        if (snap.exists()) {
            const d = snap.data();
            const diff = (new Date() - d.createdAt.toDate()) / 60000;
            if (diff < 5 && !sessionStorage.getItem('alert_' + snap.id)) {
                alert(`🚨 تنبيه هام من الإدارة:\n${d.message}`);
                sessionStorage.setItem('alert_' + snap.id, '1');
            }
        }
    });
};

window.markNotifRead = async (id, link) => {
    await updateDoc(doc(db, "notifications", id), { read: true });
    if (link !== '#') window.location.hash = link;
};

// ============================================================
// 3. عرض المحتوى للطالب (مع الملاحظات الذكية)
// ============================================================

export const renderSubsectionsForUser = async (sectionId) => {
    document.querySelectorAll('.app-section').forEach(s => s.classList.add('hidden'));
    ['home-screen', 'study-sections-container', 'subsection-viewer', 'quiz-section', 'leaderboard-section', 'scores-section', 'assignments-section', 'admin-view-area', 'profile-section', 'admin-settings-section'].forEach(id => document.getElementById(id)?.classList.add('hidden'));

    const viewer = document.getElementById('subsection-viewer');
    viewer.classList.remove('hidden');

    const contentDiv = document.getElementById('subsections-content');
    const titleHeader = document.getElementById('subsection-title');
    const progressArea = document.getElementById('progress-action-area');

    contentDiv.innerHTML = '<div class="text-center p-20"><i class="fas fa-circle-notch fa-spin text-5xl text-primary-600"></i><p class="mt-4 font-bold text-surface-500">جاري تحضير الدرس...</p></div>';

    try {
        const secDoc = await getDoc(doc(db, "study_sections", sectionId));
        titleHeader.textContent = secDoc.exists() ? secDoc.data().title : 'الدرس';

        const q = query(collection(db, "study_sections", sectionId, "subsections"), orderBy("createdAt", "asc"));
        const snapshot = await getDocs(q);

        contentDiv.innerHTML = '';
        if (progressArea) progressArea.innerHTML = '';

        if (snapshot.empty) return contentDiv.innerHTML = '<div class="p-20 text-center bg-white dark:bg-surface-800 rounded-3xl shadow-sm border border-dashed border-surface-300 dark:border-surface-700 text-surface-500"><i class="fas fa-folder-open text-6xl mb-4 opacity-20"></i><p class="text-xl">لا يوجد محتوى مضاف حالياً.</p></div>';

        const user = auth.currentUser;
        if (user && progressArea) checkSectionProgress(user.uid, sectionId, snapshot.size, progressArea);

        snapshot.forEach(async (docSnap) => {
            const data = docSnap.data();
            const subId = docSnap.id;
            const sectionCard = document.createElement('div');

            sectionCard.className = "bg-white dark:bg-surface-800 p-8 rounded-[2.5rem] shadow-xl mb-12 border border-surface-100 dark:border-surface-700 animate-fade-in relative overflow-hidden";

            let htmlContent = `
                <div class="flex justify-between items-start mb-8 relative z-10">
                    <h2 class="text-3xl font-black text-primary-800 dark:text-primary-400 flex items-center gap-3">
                        <span class="bg-primary-100 dark:bg-primary-900/50 w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-sm">
                            ${data.isBookMode ? '📘' : '📺'}
                        </span>
                        ${data.title}
                    </h2>
                    <div class="flex items-center gap-2">
                        ${data.isBookMode && data.fileUrl ? `<button onclick="window.openFullscreenPDF('${data.fileUrl}', ${data.allowDownload !== false})" class="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-lg"><i class="fas fa-book-reader"></i>وضع القراءة</button>` : ''}
                        <button onclick="window.shareLesson('${sectionId}', '${data.title}')" class="bg-accent-100 hover:bg-accent-200 text-accent-700 p-2 rounded-xl transition" title="مشاركة على واتساب">
                            <i class="fab fa-whatsapp text-lg"></i>
                        </button>
                    </div>
                </div>
                <div class="prose dark:prose-invert max-w-none mb-10 text-lg leading-relaxed text-surface-700 dark:text-surface-300">${data.content || ''}</div>
                <div class="mb-10 relative z-10">${transformUrlForEmbed(data.fileUrl, data.allowDownload !== false)}</div>
            `;

            htmlContent += `
                <div class="mt-10 p-6 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800/50 rounded-3xl relative group transition hover:shadow-lg hover:border-amber-300">
                    <div class="flex justify-between items-center mb-4">
                        <h4 class="font-black text-amber-800 dark:text-amber-500 flex items-center gap-2"><i class="fas fa-sticky-note text-xl"></i> مذكراتي لهذا الدرس</h4>
                        <span id="save-status-${subId}" class="text-[10px] font-bold px-3 py-1 rounded-full bg-white dark:bg-surface-800 shadow-sm opacity-0 transition-opacity"></span>
                    </div>
                    <textarea id="note-${subId}" class="w-full h-32 p-4 bg-white/60 dark:bg-surface-900/60 rounded-2xl border-none focus:ring-4 focus:ring-amber-200 dark:focus:ring-amber-900/50 text-surface-800 dark:text-white placeholder-amber-800/30 dark:placeholder-amber-200/30 resize-y transition shadow-inner" placeholder="سجّل ملاحظاتك هنا.. (يتم الحفظ تلقائياً)"></textarea>
                </div>
                <div class="mt-12 pt-8 border-t-2 border-dashed border-surface-100 dark:border-surface-700">
                    <h4 class="font-black text-surface-700 dark:text-surface-300 flex items-center gap-2 mb-6 text-lg"><i class="fas fa-comments text-primary-500"></i> ساحة النقاش</h4>
                    <div id="comments-list-${subId}" class="space-y-3 mb-6 max-h-[500px] overflow-y-auto custom-scrollbar p-2 bg-surface-50/50 dark:bg-surface-900/30 rounded-2xl"></div>
                    <div class="flex gap-3 items-center bg-white dark:bg-surface-700 p-2 rounded-2xl shadow-lg border border-surface-100 dark:border-surface-600">
                        <img src="${user?.photoURL || 'https://via.pui-avatars.com/api/?background=random&name=Userlaceholder.com/40'}" class="w-10 h-10 rounded-full border-2 border-primary-100 shadow-sm">
                        <div class="flex-grow"><input type="text" id="comment-input-${subId}" placeholder="اكتب سؤالك..." class="w-full p-3 bg-transparent border-none outline-none dark:text-white text-sm"></div>
                        <button id="btn-comment-${subId}" class="w-12 h-12 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition shadow-lg flex items-center justify-center"><i class="fas fa-paper-plane"></i></button>
                    </div>
                </div>`;

            sectionCard.innerHTML = htmlContent;
            contentDiv.appendChild(sectionCard);

            setTimeout(async () => {
                const noteArea = document.getElementById(`note-${subId}`);
                const statusSpan = document.getElementById(`save-status-${subId}`);
                const noteRef = doc(db, "users", user.uid, "notes", subId);
                const noteSnap = await getDoc(noteRef);
                if (noteSnap.exists()) noteArea.value = noteSnap.data().text;

                let saveTimeout;
                noteArea.addEventListener('input', () => {
                    statusSpan.textContent = 'جاري الكتابة...';
                    statusSpan.className = 'text-[10px] font-bold text-amber-600 bg-white dark:bg-surface-800 px-3 py-1 rounded-full opacity-100';
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(async () => {
                        try {
                            await setDoc(noteRef, { text: noteArea.value, sectionId, updatedAt: new Date() }, { merge: true });
                            statusSpan.textContent = '✅ تم الحفظ';
                            statusSpan.className = 'text-[10px] font-bold text-accent-600 bg-white dark:bg-surface-800 px-3 py-1 rounded-full opacity-100';
                            setTimeout(() => statusSpan.style.opacity = '0', 2000);
                        } catch (e) { statusSpan.textContent = '❌ فشل الحفظ'; }
                    }, 1000);
                });
                setupCommentsSystem(sectionId, subId);
            }, 200);
        });
        if (user) { await setDoc(doc(db, "user_progress", `${user.uid}_${sectionId}`), { userId: user.uid, sectionId, lastAccessed: new Date() }, { merge: true }); }
    } catch (e) { console.error("Render Error:", e); contentDiv.innerHTML = '<p class="text-red-500 text-center font-bold">فشل تحميل المحتوى.</p>'; }
};

const setupCommentsSystem = (sectionId, subId) => {
    const list = document.getElementById(`comments-list-${subId}`);
    const input = document.getElementById(`comment-input-${subId}`);
    const btn = document.getElementById(`btn-comment-${subId}`);
    if (!list) return;

    const q = query(collection(db, "study_sections", sectionId, "subsections", subId, "comments"), orderBy("createdAt", "desc"), limit(50));
    onSnapshot(q, (snap) => {
        list.innerHTML = '';
        if (snap.empty) { list.innerHTML = '<p class="text-center text-surface-400 text-xs py-4 italic">لا توجد تعليقات.</p>'; return; }
        snap.forEach(d => {
            const c = d.data();
            list.innerHTML += `<div class="flex gap-3 animate-fade-in group w-full"><img src="${c.userPhoto || 'https://via.pui-avatars.com/api/?background=random&name=Userlaceholder.com/40'}" class="w-8 h-8 rounded-full border border-primary-100 self-start shadow-sm"><div class="flex-grow min-w-0"><div class="bg-primary-50/50 dark:bg-surface-700/50 p-3 rounded-2xl rounded-tr-none"><div class="flex justify-between items-center mb-1"><span class="font-black text-xs text-primary-700 dark:text-primary-400">${c.userName}</span><span class="text-[9px] text-surface-400 font-mono">${c.createdAt?.toDate().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span></div><p class="text-sm text-surface-700 dark:text-surface-200 break-words leading-snug">${c.text}</p></div></div></div>`;
        });
    });

    const postComment = async () => {
        const text = input.value.trim(); const user = auth.currentUser;
        if (!text || !user) return alert("يجب تسجيل الدخول");
        btn.disabled = true;
        try { await addDoc(collection(db, "study_sections", sectionId, "subsections", subId, "comments"), { text, userName: user.displayName || 'طالب', userPhoto: user.photoURL, userId: user.uid, createdAt: new Date() }); input.value = ''; }
        catch (e) { console.error(e); } finally { btn.disabled = false; input.focus(); }
    };
    btn.onclick = postComment;
    input.onkeypress = (e) => { if (e.key === 'Enter') postComment(); };
};

const checkSectionProgress = async (userId, sectionId, totalSubsections, container) => {
    const progressRef = doc(db, "user_progress", `${userId}_${sectionId}`);
    const snap = await getDoc(progressRef);
    if (snap.exists() && snap.data().completed) {
        container.innerHTML = `<div class="bg-accent-100 text-accent-700 px-4 py-2 rounded-2xl font-bold text-xs shadow-sm flex items-center gap-2 border border-accent-200"><i class="fas fa-check-circle text-lg"></i> تم إكمال المادة</div>`;
    } else {
        container.innerHTML = `<button id="mark-complete-btn" class="bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 px-5 py-2.5 rounded-2xl font-bold text-xs shadow-md hover:shadow-lg transition transform active:scale-95 border border-primary-100 dark:border-surface-600 flex items-center gap-2"><i class="far fa-circle"></i> تحديد كمكتمل</button>`;
        document.getElementById('mark-complete-btn').onclick = async () => { if (confirm("هل أتممت دراسة هذه المادة؟")) { await setDoc(progressRef, { userId, sectionId, completed: true, date: new Date() }, { merge: true }); checkSectionProgress(userId, sectionId, totalSubsections, container); updateGlobalProgress(); new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3').play().catch(() => { }); } };
    }
};

export const updateGlobalProgress = async () => {
    const user = auth.currentUser; if (!user) return;
    const sectionsSnap = await getDocs(collection(db, "study_sections")); if (sectionsSnap.empty) return;
    const q = query(collection(db, "user_progress"), where("userId", "==", user.uid), where("completed", "==", true));
    const progressSnap = await getDocs(q);
    const percent = Math.min(100, Math.round((progressSnap.size / sectionsSnap.size) * 100));
    const circle = document.getElementById('progress-circle'); const text = document.getElementById('progress-text');
    if (circle && text) { circle.style.strokeDashoffset = 175.9 * (1 - percent / 100); text.textContent = `${percent}%`; document.getElementById('user-progress-widget').classList.remove('hidden'); }
};

export const loadAssignmentsForUser = async () => {
    ['home-screen', 'study-sections-container', 'subsection-viewer', 'quiz-section', 'leaderboard-section', 'scores-section', 'assignments-section', 'admin-view-area', 'profile-section', 'admin-settings-section'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('assignments-section').classList.remove('hidden');
    const list = document.getElementById('assignments-list');

    // التحقق من التوثيق
    if (!window.isUserVerified) {
        list.innerHTML = `
            <div class="p-10 bg-orange-50 dark:bg-orange-900/20 rounded-3xl text-center border-2 border-orange-200 dark:border-orange-800">
                <i class="fas fa-lock text-5xl text-orange-500 mb-4 block"></i>
                <h3 class="font-bold text-orange-700 dark:text-orange-400 text-xl mb-2">الواجبات محظورة</h3>
                <p class="text-orange-600 dark:text-orange-400">يرجى انتظار توثيق حسابك للوصول للواجبات</p>
            </div>
        `;
        return;
    }

    list.innerHTML = '<div class="p-20 text-center"><i class="fas fa-spinner fa-spin text-4xl text-primary-500"></i></div>';
    const user = auth.currentUser; if (!user) return;
    const userDoc = await getDoc(doc(db, "users", user.uid)); const userData = userDoc.exists() ? userDoc.data() : null;
    if (!userData || !userData.collegeId) { list.innerHTML = '<div class="p-10 bg-red-50 text-red-600 rounded-3xl text-center font-bold">يرجى استكمال بيانات الكلية أولاً.</div>'; return; }
    const q = query(collection(db, "assignments"), orderBy("deadline", "asc")); const snap = await getDocs(q); list.innerHTML = '';
    let hasAssignments = false;
    for (const docSnap of snap.docs) {
        const d = docSnap.data();
        if (d.collegeId === userData.collegeId && (d.departmentId === 'all' || d.departmentId === userData.departmentId)) {
            hasAssignments = true; const assignId = docSnap.id;
            const subSnap = await getDoc(doc(db, "assignments", assignId, "submissions", user.uid));
            const userSub = subSnap.exists() ? subSnap.data() : null;
            let statusHTML = userSub ? (userSub.grade ? `<div class="bg-accent-100 p-4 rounded-2xl text-center"><p class="text-xs text-accent-600 font-bold">تم التصحيح</p><p class="text-3xl font-black text-accent-700">${userSub.grade}%</p></div>` : `<div class="bg-primary-50 p-4 rounded-2xl text-center text-primary-600 font-black">في انتظار التصحيح</div>`) : `<div class="flex flex-col gap-2 w-full md:w-64"><input type="file" id="file-${assignId}" class="hidden"><button onclick="document.getElementById('file-${assignId}').click()" class="bg-white text-primary-600 py-3 rounded-xl font-bold border-2 border-dashed border-primary-200 hover:border-primary-500 transition text-sm">اختر ملف الحل</button><button id="upload-btn-${assignId}" class="bg-primary-600 text-white py-3 rounded-xl font-black shadow-lg hover:bg-primary-700 transition text-sm">تسليم الواجب</button></div>`;
            const div = document.createElement('div');
            div.className = "bg-white dark:bg-surface-800 p-6 md:p-8 rounded-[2rem] shadow-lg border-r-8 border-primary-500 mb-6 flex flex-col md:flex-row justify-between items-center gap-6 transition hover:scale-[1.01]";
            div.innerHTML = `<div class="flex-grow text-right w-full"><h3 class="text-2xl font-black dark:text-white mb-2">${d.title}</h3><p class="text-surface-500 dark:text-surface-400 text-sm mb-4 leading-relaxed">${d.description}</p><div class="flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-wider text-surface-400"><span class="bg-surface-100 dark:bg-surface-700 px-3 py-1 rounded-lg"><i class="far fa-clock"></i> ${d.deadline}</span><span class="bg-primary-50 dark:bg-primary-900/30 text-primary-500 px-3 py-1 rounded-lg">${d.sectionTitle}</span></div>${userSub && userSub.feedback ? `<div class="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 rounded-xl text-xs text-yellow-800 dark:text-yellow-500"><strong>📝 ملاحظة المدرس:</strong> ${userSub.feedback}</div>` : ''}</div>${statusHTML}`;
            list.appendChild(div);
            const upBtn = document.getElementById(`upload-btn-${assignId}`);
            if (upBtn) { upBtn.onclick = async () => { const fileInput = document.getElementById(`file-${assignId}`); if (!fileInput.files.length) return alert("اختر الملف أولاً"); upBtn.textContent = "جاري الرفع..."; upBtn.disabled = true; try { const url = await uploadToCloudinary(fileInput.files[0]); await setDoc(doc(db, "assignments", assignId, "submissions", user.uid), { studentName: user.displayName, userId: user.uid, fileUrl: url, submittedAt: new Date(), grade: null }); alert("✅ تم التسليم!"); loadAssignmentsForUser(); } catch (e) { alert("خطأ: " + e.message); upBtn.textContent = "تسليم الواجب"; upBtn.disabled = false; } }; }
        }
    }
    if (!hasAssignments) list.innerHTML = '<div class="p-20 text-center opacity-30 font-bold text-xl"><i class="fas fa-check-circle text-6xl mb-4 block"></i>لا توجد واجبات.</div>';
};

export const checkLiveSession = async () => {
    const btn = document.getElementById('live-session-btn'); if (!btn) return;
    onSnapshot(doc(db, "system", "live_session"), (doc) => { if (doc.exists() && doc.data().isActive) { btn.classList.remove('hidden'); btn.href = doc.data().link; btn.target = '_blank'; } else { btn.classList.add('hidden'); } });
};

export const loadStudySections = async () => {
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'leaderboard-section', 'scores-section', 'assignments-section', 'admin-view-area', 'profile-section', 'admin-settings-section'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('study-sections-container').classList.remove('hidden');
    const list = document.getElementById('sections-list');

    // التحقق من التوثيق
    if (!window.isUserVerified) {
        list.innerHTML = `
            <div class="col-span-full p-10 bg-orange-50 dark:bg-orange-900/20 rounded-3xl text-center border-2 border-orange-200 dark:border-orange-800">
                <i class="fas fa-lock text-5xl text-orange-500 mb-4 block"></i>
                <h3 class="font-bold text-orange-700 dark:text-orange-400 text-xl mb-2">محتوى محظور</h3>
                <p class="text-orange-600 dark:text-orange-400">يرجى انتظار توثيق حسابك للوصول للمحتوى الدراسي</p>
            </div>
        `;
        return;
    }

    list.innerHTML = '<div class="col-span-full p-20 text-center"><i class="fas fa-circle-notch fa-spin text-4xl text-primary-600"></i></div>';
    const user = auth.currentUser; if (!user) return;
    const userDoc = await getDoc(doc(db, "users", user.uid)); const userData = userDoc.exists() ? userDoc.data() : null;
    if (!userData || !userData.collegeId) { list.innerHTML = '<div class="col-span-full p-10 bg-red-50 text-red-600 rounded-3xl text-center font-bold">حدد كليتك في البروفايل أولاً.</div>'; return; }
    const snap = await getDocs(query(collection(db, "study_sections"), orderBy("createdAt", "desc"))); list.innerHTML = '';
    let hasContent = false;
    snap.forEach(d => {
        const data = d.data();

        // دعم الأنظمة المختلفة:
        // 1. targets (الجديد مع الأقسام)
        // 2. targetColleges (القديم بالكليات فقط)
        // 3. collegeId/departmentId (الأقدم)
        let canView = false;

        if (data.targets) {
            // النظام الجديد مع الأقسام
            canView = data.targets.some(t => {
                if (t.collegeId === 'all') return true;
                if (t.collegeId !== userData.collegeId) return false;
                if (t.departmentId === 'all') return true;
                return t.departmentId === userData.departmentId;
            });
        } else if (data.targetColleges) {
            // النظام القديم (كليات فقط)
            canView = data.targetColleges.includes('all') || data.targetColleges.includes(userData.collegeId);
        } else {
            // النظام الأقدم
            canView = data.collegeId === 'general' ||
                (data.collegeId === userData.collegeId &&
                    (data.departmentId === 'all' || data.departmentId === userData.departmentId));
        }

        if (canView) {
            hasContent = true;
            const card = document.createElement('div');
            card.className = "group bg-white dark:bg-surface-800 p-8 rounded-[2rem] shadow-xl border-b-8 border-primary-600 hover:scale-[1.03] transition-all relative overflow-hidden";
            card.innerHTML = `
                <button onclick="event.stopPropagation(); window.toggleFavorite('section', '${d.id}', '${data.title}')" class="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-white/80 dark:bg-surface-700/80 shadow-lg flex items-center justify-center hover:scale-110 transition" id="fav-section-${d.id}">
                    <i class="far fa-heart text-red-400 text-lg"></i>
                </button>
                <a href="#section/${d.id}" class="block">
                    <div class="absolute -top-10 -right-10 w-32 h-32 bg-primary-50 dark:bg-primary-900/30 rounded-full transition-all group-hover:scale-150"></div>
                    <div class="relative z-10">
                        <h3 class="text-2xl font-black dark:text-white mb-2 tracking-tight">${data.title}</h3>
                        <p class="text-xs text-primary-500 font-bold uppercase tracking-widest bg-primary-50 dark:bg-primary-900/20 px-3 py-1 rounded-full w-fit">مادة دراسية</p>
                    </div>
                    <div class="mt-8 flex justify-end">
                        <span class="w-12 h-12 bg-primary-600 text-white rounded-2xl flex items-center justify-center shadow-lg group-hover:rotate-12 transition-transform"><i class="fas fa-arrow-left"></i></span>
                    </div>
                </a>
            `;
            list.appendChild(card);
            // Check if already favorite
            window.checkIfFavorite?.('section', d.id);
        }
    });
    if (!hasContent) list.innerHTML = '<div class="col-span-full p-20 text-center opacity-30 font-black text-xl">لا توجد مواد مضافة لك حالياً</div>';
};

// ============================================================
// 6. لوحة تحكم الأدمن (CMS Admin Panel) + إدارة الكويزات
// ============================================================

export const openCmsView = async () => {
    document.getElementById('admin-view-area').classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('admin-view-title').textContent = 'إدارة المحتوى الدراسي';

    // إنشاء قائمة الكليات والأقسام
    const collegesWithDepts = UNIVERSITY_STRUCTURE.map(c => `
        <div class="college-group bg-white/10 rounded-xl p-3 mb-2">
            <label class="flex items-center gap-2 cursor-pointer font-bold mb-2">
                <input type="checkbox" name="target-college" value="${c.id}" class="w-4 h-4 accent-primary-500 college-checkbox" data-college="${c.id}">
                <span class="text-sm">🎓 ${c.name}</span>
                <span class="text-xs opacity-50 mr-auto">(${c.departments.length} قسم)</span>
            </label>
            <div class="departments-list hidden pr-6 space-y-1" id="depts-${c.id}">
                <label class="flex items-center gap-2 cursor-pointer text-xs opacity-80 hover:opacity-100">
                    <input type="checkbox" name="target-dept-${c.id}" value="all" class="w-3 h-3 accent-accent-500" checked>
                    <span>✓ كل الأقسام</span>
                </label>
                ${c.departments.map(d => `
                    <label class="flex items-center gap-2 cursor-pointer text-xs opacity-80 hover:opacity-100">
                        <input type="checkbox" name="target-dept-${c.id}" value="${d.id}" class="w-3 h-3 accent-primary-500 dept-checkbox">
                        <span>${d.name}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');

    document.getElementById('admin-view-content').innerHTML = `
        <div class="mb-10 bg-primary-900 text-white p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
            <div class="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <div class="relative z-10">
                <h3 class="font-black text-2xl mb-6 flex items-center gap-2"><i class="fas fa-plus-circle"></i> إضافة مادة جديدة</h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <input type="text" id="new-section-title" placeholder="اسم المادة" class="p-4 border-none rounded-2xl bg-white/10 placeholder-white/50 text-white font-bold outline-none focus:ring-2 focus:ring-white/50">
                    <div class="flex items-center gap-4">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" id="all-colleges-check" class="w-5 h-5 accent-accent-500" checked>
                            <span class="font-bold">📌 لكل الكليات والأقسام</span>
                        </label>
                    </div>
                </div>
                
                <div id="colleges-selection" class="hidden mb-4">
                    <p class="text-sm opacity-70 mb-3">اختر الكليات والأقسام المستهدفة:</p>
                    <div class="max-h-64 overflow-y-auto custom-scrollbar p-2 bg-white/5 rounded-xl">
                        ${collegesWithDepts}
                    </div>
                </div>
                
                <button id="add-section-btn" class="w-full md:w-auto bg-white text-primary-900 px-8 py-4 rounded-2xl font-black hover:bg-primary-50 transition shadow-lg">
                    <i class="fas fa-plus ml-2"></i> إنشاء المادة
                </button>
            </div>
        </div>
        
        <style>
            .cms-folder-card {
                padding: 1.25rem; border-radius: 1.25rem; cursor: pointer; text-align: center;
                color: white; transition: all 0.2s; position: relative; overflow: hidden;
            }
            .cms-folder-card:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(0,0,0,0.15); }
        </style>
        <div id="sections-list-admin" class="grid grid-cols-1 gap-4"></div>
        
        <!-- Edit Modal -->
        <div id="edit-section-modal" class="hidden fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <div class="bg-white dark:bg-surface-800 w-full max-w-2xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl animate-scale-in flex flex-col">
                <div class="bg-gradient-to-r from-primary-600 to-primary-600 text-white p-6 flex justify-between items-center flex-shrink-0">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-edit text-2xl"></i>
                        <div>
                            <h3 class="font-bold text-lg">تعديل المادة</h3>
                            <p id="edit-section-name" class="text-sm opacity-70"></p>
                        </div>
                    </div>
                    <button onclick="document.getElementById('edit-section-modal').classList.add('hidden')" class="hover:bg-white/20 p-2 rounded-full transition"><i class="fas fa-times"></i></button>
                </div>
                <div class="p-6 overflow-y-auto">
                    <input type="hidden" id="edit-section-id">
                    <div class="mb-4">
                        <label class="block text-sm font-bold text-surface-700 dark:text-surface-300 mb-2">اسم المادة</label>
                        <input type="text" id="edit-section-title" class="w-full p-3 border rounded-xl dark:bg-surface-700 dark:text-white dark:border-surface-600 font-bold">
                    </div>
                    <div class="mb-4">
                        <label class="flex items-center gap-2 cursor-pointer mb-3">
                            <input type="checkbox" id="edit-all-colleges" class="w-5 h-5 accent-accent-500">
                            <span class="font-bold dark:text-white">📌 لكل الكليات والأقسام</span>
                        </label>
                        <div id="edit-colleges-list" class="max-h-64 overflow-y-auto custom-scrollbar p-3 bg-surface-50 dark:bg-surface-700 rounded-xl">
                            ${UNIVERSITY_STRUCTURE.map(c => `
                                <div class="edit-college-group bg-white dark:bg-surface-600 rounded-xl p-3 mb-2">
                                    <label class="flex items-center gap-2 cursor-pointer font-bold mb-2">
                                        <input type="checkbox" name="edit-target-college" value="${c.id}" class="w-4 h-4 accent-primary-500 edit-college-checkbox" data-college="${c.id}">
                                        <span class="text-sm dark:text-white">🎓 ${c.name}</span>
                                    </label>
                                    <div class="edit-departments-list hidden pr-6 space-y-1" id="edit-depts-${c.id}">
                                        <label class="flex items-center gap-2 cursor-pointer text-xs opacity-80 hover:opacity-100">
                                            <input type="checkbox" name="edit-target-dept-${c.id}" value="all" class="w-3 h-3 accent-accent-500 edit-all-depts" checked>
                                            <span class="dark:text-surface-200">✓ كل الأقسام</span>
                                        </label>
                                        ${c.departments.map(d => `
                                            <label class="flex items-center gap-2 cursor-pointer text-xs opacity-80 hover:opacity-100">
                                                <input type="checkbox" name="edit-target-dept-${c.id}" value="${d.id}" class="w-3 h-3 accent-primary-500 edit-dept-checkbox">
                                                <span class="dark:text-surface-200">${d.name}</span>
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <button onclick="window.saveSectionEdit()" class="w-full bg-gradient-to-r from-primary-600 to-primary-600 text-white py-3 rounded-xl font-bold hover:shadow-lg transition">
                        <i class="fas fa-save ml-2"></i> حفظ التغييرات
                    </button>
                </div>
            </div>
        </div>
    `;

    // Toggle colleges selection
    const allCollegesCheck = document.getElementById('all-colleges-check');
    const collegesSelection = document.getElementById('colleges-selection');
    allCollegesCheck.onchange = () => {
        collegesSelection.classList.toggle('hidden', allCollegesCheck.checked);
    };

    // Toggle departments when college is checked
    document.querySelectorAll('.college-checkbox').forEach(cb => {
        cb.onchange = () => {
            const collegeId = cb.dataset.college;
            const deptsDiv = document.getElementById(`depts-${collegeId}`);
            if (deptsDiv) {
                deptsDiv.classList.toggle('hidden', !cb.checked);
            }
        };
    });

    // Add section button
    document.getElementById('add-section-btn').onclick = async () => {
        const title = document.getElementById('new-section-title').value.trim();
        const allColleges = document.getElementById('all-colleges-check').checked;

        if (!title) return alert("يرجى إدخال اسم المادة");

        let targets = [];

        if (allColleges) {
            targets = [{ collegeId: 'all', departmentId: 'all' }];
        } else {
            // جمع الكليات والأقسام المختارة
            document.querySelectorAll('input[name="target-college"]:checked').forEach(collegeCheckbox => {
                const collegeId = collegeCheckbox.value;
                const selectedDepts = Array.from(document.querySelectorAll(`input[name="target-dept-${collegeId}"]:checked`)).map(d => d.value);

                if (selectedDepts.includes('all') || selectedDepts.length === 0) {
                    targets.push({ collegeId, departmentId: 'all' });
                } else {
                    selectedDepts.forEach(deptId => {
                        targets.push({ collegeId, departmentId: deptId });
                    });
                }
            });

            if (targets.length === 0) return alert("يرجى اختيار كلية واحدة على الأقل");
        }

        await addDoc(collection(db, "study_sections"), {
            title,
            targets,
            createdAt: new Date()
        });

        // 🔔 إرسال إشعارات إضافة المادة
        try {
            const { sendNotificationToUsers } = await import('./notifications.js');
            if (allColleges) {
                await sendNotificationToUsers('📚 مادة جديدة', `تم إضافة مادة عامة: ${title}`, 'new_content', { type: 'all' });
            } else {
                for (const t of targets) {
                    let targetObj = { type: 'colleges', collegeIds: [t.collegeId] };
                    if (t.departmentId !== 'all') {
                        targetObj = { type: 'departments', departmentIds: [t.departmentId] };
                    }
                    await sendNotificationToUsers('📚 مادة جديدة', `تم إضافة مادة: ${title}`, 'new_content', targetObj);
                }
            }
        } catch(e) { console.error('Notif error', e); }

        window.showToast?.("✅ تم إنشاء المادة بنجاح", "success");
        openCmsView();
    };

    // Load sections list
    const snap = await getDocs(query(collection(db, "study_sections"), orderBy("createdAt", "desc")));

    // Store data globally for navigation
    window.cmsSectionsData = {};
    window.cmsGeneralSections = [];

    snap.forEach(d => {
        const data = d.data();
        const section = { id: d.id, ...data };

        if (data.targets) {
            // الفورمات الجديد - targets array
            const isAll = data.targets.some(t => t.collegeId === 'all');
            if (isAll) {
                window.cmsGeneralSections.push(section);
            } else {
                data.targets.forEach(t => {
                    if (!window.cmsSectionsData[t.collegeId]) window.cmsSectionsData[t.collegeId] = {};
                    if (!window.cmsSectionsData[t.collegeId][t.departmentId]) window.cmsSectionsData[t.collegeId][t.departmentId] = [];
                    if (!window.cmsSectionsData[t.collegeId][t.departmentId].find(s => s.id === section.id)) {
                        window.cmsSectionsData[t.collegeId][t.departmentId].push(section);
                    }
                });
            }
        } else if (data.targetColleges && Array.isArray(data.targetColleges)) {
            // الفورمات القديم - targetColleges array
            if (data.targetColleges.includes('all')) {
                window.cmsGeneralSections.push(section);
            } else {
                data.targetColleges.forEach(colId => {
                    if (!window.cmsSectionsData[colId]) window.cmsSectionsData[colId] = {};
                    if (!window.cmsSectionsData[colId]['all']) window.cmsSectionsData[colId]['all'] = [];
                    if (!window.cmsSectionsData[colId]['all'].find(s => s.id === section.id)) {
                        window.cmsSectionsData[colId]['all'].push(section);
                    }
                });
            }
        } else {
            // مفيش استهداف - عامة
            window.cmsGeneralSections.push(section);
        }
    });

    // Show root level (colleges)
    window.cmsBrowse();
};

// دالة التصفح الرئيسية
window.cmsBrowse = (collegeId = null, deptId = null) => {
    const list = document.getElementById('sections-list-admin');
    if (!list) return;

    // حفظ الموقع الحالي للاستخدام في الحذف الجماعي
    window._cmsCurrentCollege = collegeId;
    window._cmsCurrentDept = deptId;

    let html = '';

    // Breadcrumb محسن
    html += `<div class="col-span-full mb-4 flex items-center justify-between bg-white dark:bg-surface-800 p-3 px-4 rounded-xl shadow-sm border dark:border-surface-700">
        <div class="flex items-center gap-2 text-sm">
            <button onclick="window.cmsBrowse()" class="text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition">
                <i class="fas fa-home"></i> الرئيسية
            </button>`;

    if (collegeId) {
        const college = UNIVERSITY_STRUCTURE.find(c => c.id === collegeId);
        html += `<i class="fas fa-chevron-left text-surface-300 text-xs"></i>
            <button onclick="window.cmsBrowse('${collegeId}')" class="${deptId ? 'text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30' : 'text-surface-600 dark:text-surface-300'} px-2 py-1 rounded-lg font-bold transition">
                🎓 ${college?.name || collegeId}
            </button>`;
    }

    if (deptId && collegeId) {
        const college = UNIVERSITY_STRUCTURE.find(c => c.id === collegeId);
        const dept = college?.departments.find(d => d.id === deptId);
        html += `<i class="fas fa-chevron-left text-surface-300 text-xs"></i>
            <span class="text-surface-600 dark:text-surface-300 font-bold px-2 py-1">📁 ${dept?.name || deptId}</span>`;
    }
    html += `</div>`; // end breadcrumb text

    // أزرار الأدوات حسب المستوى
    if (collegeId) {
        const college = UNIVERSITY_STRUCTURE.find(c => c.id === collegeId);
        const collegeName = college?.name || collegeId;
        html += `<div class="flex items-center gap-2">`;
        if (deptId) {
            const dept = college?.departments.find(d => d.id === deptId);
            const deptName = dept?.name || deptId;
            html += `<button onclick="window.cmsDeleteBulk('dept', '${collegeId}', '${deptId}', '${deptName.replace(/'/g, "\\'")}')" class="text-xs bg-red-50 dark:bg-red-900/30 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 dark:hover:bg-red-900/50 transition flex items-center gap-1" title="حذف كل مواد القسم"><i class="fas fa-trash-alt"></i> حذف مواد القسم</button>`;
        } else {
            html += `<button onclick="window.cmsDeleteBulk('college', '${collegeId}', null, '${collegeName.replace(/'/g, "\\'")}')" class="text-xs bg-red-50 dark:bg-red-900/30 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 dark:hover:bg-red-900/50 transition flex items-center gap-1" title="حذف كل مواد الكلية"><i class="fas fa-trash-alt"></i> حذف كل مواد الكلية</button>`;
        }
        html += `</div>`;
    }
    html += `</div>`; // end breadcrumb bar

    // Content based on level
    if (!collegeId) {
        // Root level - show colleges + general
        // حساب إجمالي المواد
        let totalSections = window.cmsGeneralSections.length;
        UNIVERSITY_STRUCTURE.forEach(c => {
            const cd = window.cmsSectionsData[c.id];
            if (cd) Object.values(cd).forEach(arr => totalSections += arr.length);
        });

        html += `<div class="col-span-full mb-4 flex items-center justify-between">
            <span class="text-sm font-bold text-surface-400 dark:text-surface-500"><i class="fas fa-database text-primary-500 ml-1"></i> إجمالي المواد: ${totalSections}</span>
        </div>`;

        html += `
        <div class="col-span-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            ${window.cmsGeneralSections.length > 0 ? `
            <div onclick="window.cmsShowGeneral()" class="cms-folder-card bg-gradient-to-br from-accent-600 to-primary-700 group">
                <div class="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition">
                    <i class="fas fa-globe-africa text-3xl text-white"></i>
                </div>
                <h4 class="font-black text-base text-white">المواد العامة</h4>
                <p class="text-xs text-white/70 mt-1">${window.cmsGeneralSections.length} مادة</p>
            </div>` : ''}
            
            ${UNIVERSITY_STRUCTURE.map(college => {
            const collegeData = window.cmsSectionsData[college.id];
            let count = 0;
            if (collegeData) Object.values(collegeData).forEach(depts => count += depts.length);

            return `
                <div onclick="window.cmsBrowse('${college.id}')" class="cms-folder-card ${count > 0 ? 'bg-gradient-to-br from-primary-600 to-primary-700' : 'bg-gradient-to-br from-surface-500 to-surface-600'} group">
                    <div class="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition">
                        <i class="fas fa-university text-3xl text-white"></i>
                    </div>
                    <h4 class="font-black text-base text-white truncate">${college.name}</h4>
                    <p class="text-xs text-white/70 mt-1">${count} مادة · ${college.departments.length} قسم</p>
                </div>`;
        }).join('')}
        </div>`;

    } else if (!deptId) {
        // College level - show departments
        const college = UNIVERSITY_STRUCTURE.find(c => c.id === collegeId);
        const collegeData = window.cmsSectionsData[collegeId] || {};

        // حساب إجمالي مواد الكلية
        let totalCollegeSections = 0;
        Object.values(collegeData).forEach(arr => totalCollegeSections += arr.length);

        html += `<div class="col-span-full mb-3 flex items-center gap-2">
            <span class="text-sm font-bold text-surface-400 dark:text-surface-500"><i class="fas fa-university text-primary-500 ml-1"></i> ${totalCollegeSections} مادة في هذه الكلية</span>
        </div>`;

        html += `
        <div class="col-span-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            ${college.departments.map(dept => {
            const deptSections = collegeData[dept.id] || [];
            const allSections = collegeData['all'] || [];
            const sections = [...deptSections, ...allSections.filter(s => !deptSections.find(d => d.id === s.id))];

            return `
                <div onclick="window.cmsBrowse('${collegeId}', '${dept.id}')" class="cms-folder-card ${sections.length > 0 ? 'bg-gradient-to-br from-primary-600 to-primary-700' : 'bg-gradient-to-br from-surface-500 to-surface-600'} group">
                    <div class="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition">
                        <i class="fas fa-folder text-3xl text-white"></i>
                    </div>
                    <h4 class="font-black text-base text-white truncate">${dept.name}</h4>
                    <p class="text-xs text-white/70 mt-1">${sections.length} مادة</p>
                </div>`;
        }).join('')}
        </div>`;

    } else {
        // Department level - show subjects with search
        const collegeData = window.cmsSectionsData[collegeId] || {};
        const deptSections = collegeData[deptId] || [];
        const allSections = collegeData['all'] || [];
        const sections = [...deptSections, ...allSections.filter(s => !deptSections.find(d => d.id === s.id))];

        // شريط البحث + العداد
        html += `<div class="col-span-full mb-3 flex items-center gap-3">
            <div class="flex-1 relative">
                <i class="fas fa-search absolute top-1/2 -translate-y-1/2 right-3 text-surface-400 text-sm"></i>
                <input type="text" id="cms-search-input" placeholder="بحث في المواد..." class="w-full p-2.5 pr-9 border rounded-xl dark:bg-surface-700 dark:text-white dark:border-surface-600 text-sm outline-none focus:ring-2 focus:ring-primary-500" oninput="window.cmsFilterSections()">
            </div>
            <span class="text-sm font-bold text-surface-400 dark:text-surface-500 whitespace-nowrap">${sections.length} مادة</span>
        </div>`;

        if (sections.length === 0) {
            html += `<div class="col-span-full text-center py-16 bg-surface-50 dark:bg-surface-800 rounded-2xl border-2 border-dashed dark:border-surface-700">
                <i class="fas fa-folder-open text-5xl text-surface-300 dark:text-surface-600 mb-4"></i>
                <p class="text-surface-400 font-bold">لا توجد مواد في هذا القسم</p>
                <p class="text-xs text-surface-400 mt-1">اضغط "إضافة مادة جديدة" بالأعلى لإنشاء مادة</p>
            </div>`;
        } else {
            html += `<div id="cms-sections-list-inner" class="col-span-full grid grid-cols-1 md:grid-cols-2 gap-3">
                ${sections.map(s => {
                const createdAt = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
                return `
                <div class="cms-section-card flex justify-between items-center p-4 bg-white dark:bg-surface-800 rounded-2xl shadow-sm border border-surface-100 dark:border-surface-700 hover:shadow-md hover:border-primary-400 transition group" data-title="${s.title}">
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <div class="w-11 h-11 bg-primary-50 dark:bg-primary-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                            <i class="fas fa-book text-xl text-primary-500"></i>
                        </div>
                        <div class="min-w-0">
                            <span class="font-bold text-sm dark:text-white block truncate">${s.title}</span>
                            ${createdAt ? `<span class="text-[10px] text-surface-400"><i class="far fa-calendar-alt ml-1"></i>${createdAt}</span>` : ''}
                        </div>
                    </div>
                    <div class="flex gap-1.5 mr-2">
                        <button onclick="window.openEditSection('${s.id}', '${s.title.replace(/'/g, "\\'")}', null)" class="w-9 h-9 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 hover:bg-yellow-500 hover:text-white transition flex items-center justify-center text-sm" title="تعديل"><i class="fas fa-pen"></i></button>
                        <button onclick="window.location.hash='admin/cms/${s.id}'" class="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 hover:bg-primary-600 hover:text-white transition flex items-center justify-center text-sm" title="فتح الدروس"><i class="fas fa-folder-open"></i></button>
                        <button onclick="window.delSec('${s.id}', '${s.title.replace(/'/g, "\\'")}')" class="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-600 hover:text-white transition flex items-center justify-center text-sm" title="حذف"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            }).join('')}
            </div>`;
        }
    }

    list.innerHTML = html;
};

// بحث في المواد
window.cmsFilterSections = () => {
    const query = (document.getElementById('cms-search-input')?.value || '').trim().toLowerCase();
    document.querySelectorAll('.cms-section-card').forEach(card => {
        const title = (card.dataset.title || '').toLowerCase();
        card.style.display = title.includes(query) ? '' : 'none';
    });
};

// حذف جماعي (كلية كاملة / قسم كامل)
window.cmsDeleteBulk = async (level, collegeId, deptId, name) => {
    const label = level === 'college' ? `كل مواد كلية "${name}"` : `كل مواد قسم "${name}"`;
    const confirmation = prompt(`⚠️ تحذير!\nسيتم حذف ${label} نهائياً.\n\nللتأكيد اكتب: حذف`);
    if (confirmation !== 'حذف') return;

    try {
        const snap = await getDocs(collection(db, "study_sections"));
        const batch = writeBatch(db);
        let count = 0;

        snap.forEach(d => {
            const data = d.data();
            if (!data.targets) return;

            const matches = data.targets.some(t => {
                if (t.collegeId === 'all') return false; // لا تحذف المواد العامة
                if (level === 'college') return t.collegeId === collegeId;
                if (level === 'dept') return t.collegeId === collegeId && (t.departmentId === deptId || t.departmentId === 'all');
                return false;
            });

            if (matches) {
                batch.delete(d.ref);
                count++;
            }
        });

        if (count === 0) {
            window.showToast?.('لا توجد مواد لحذفها', 'info');
            return;
        }

        await batch.commit();
        window.showToast?.(`✅ تم حذف ${count} مادة بنجاح`, 'success');
        openCmsView();
    } catch (e) {
        console.error('Bulk delete error:', e);
        window.showToast?.('حدث خطأ أثناء الحذف الجماعي', 'error');
    }
};

// عرض المواد العامة
window.cmsShowGeneral = () => {
    const list = document.getElementById('sections-list-admin');
    if (!list) return;

    let html = `<div class="col-span-full mb-4 flex items-center justify-between bg-white dark:bg-surface-800 p-3 px-4 rounded-xl shadow-sm border dark:border-surface-700">
        <div class="flex items-center gap-2 text-sm">
            <button onclick="window.cmsBrowse()" class="text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition">
                <i class="fas fa-home"></i> الرئيسية
            </button>
            <i class="fas fa-chevron-left text-surface-300 text-xs"></i>
            <span class="text-surface-600 dark:text-surface-300 font-bold px-2 py-1">📚 المواد العامة</span>
        </div>
        <span class="text-sm font-bold text-surface-400">${window.cmsGeneralSections.length} مادة</span>
    </div>`;

    // بحث
    html += `<div class="col-span-full mb-3">
        <div class="relative">
            <i class="fas fa-search absolute top-1/2 -translate-y-1/2 right-3 text-surface-400 text-sm"></i>
            <input type="text" id="cms-search-input" placeholder="بحث في المواد العامة..." class="w-full p-2.5 pr-9 border rounded-xl dark:bg-surface-700 dark:text-white dark:border-surface-600 text-sm outline-none focus:ring-2 focus:ring-primary-500" oninput="window.cmsFilterSections()">
        </div>
    </div>`;

    html += `<div id="cms-sections-list-inner" class="col-span-full grid grid-cols-1 md:grid-cols-2 gap-3">
        ${window.cmsGeneralSections.map(s => {
        const createdAt = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
        return `
        <div class="cms-section-card flex justify-between items-center p-4 bg-white dark:bg-surface-800 rounded-2xl shadow-sm border border-surface-100 dark:border-surface-700 hover:shadow-md hover:border-accent-400 transition group" data-title="${s.title}">
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="w-11 h-11 bg-accent-50 dark:bg-accent-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i class="fas fa-book text-xl text-accent-500"></i>
                </div>
                <div class="min-w-0">
                    <span class="font-bold text-sm dark:text-white block truncate">${s.title}</span>
                    ${createdAt ? `<span class="text-[10px] text-surface-400"><i class="far fa-calendar-alt ml-1"></i>${createdAt}</span>` : ''}
                </div>
            </div>
            <div class="flex gap-1.5 mr-2">
                <button onclick="window.openEditSection('${s.id}', '${s.title.replace(/'/g, "\\'")}', null)" class="w-9 h-9 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 hover:bg-yellow-500 hover:text-white transition flex items-center justify-center text-sm" title="تعديل"><i class="fas fa-pen"></i></button>
                <button onclick="window.location.hash='admin/cms/${s.id}'" class="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 hover:bg-primary-600 hover:text-white transition flex items-center justify-center text-sm" title="فتح الدروس"><i class="fas fa-folder-open"></i></button>
                <button onclick="window.delSec('${s.id}', '${s.title.replace(/'/g, "\\'")}')" class="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-600 hover:text-white transition flex items-center justify-center text-sm" title="حذف"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('')}
    </div>`;

    list.innerHTML = html;

    setTimeout(() => {
        document.querySelectorAll('.edit-college-checkbox').forEach(cb => {
            cb.onchange = () => {
                const collegeId = cb.dataset.college;
                const deptsDiv = document.getElementById(`edit-depts-${collegeId}`);
                if (deptsDiv) deptsDiv.classList.toggle('hidden', !cb.checked);
            };
        });
    }, 100);
};

// فتح نافذة تعديل المادة
window.openEditSection = (id, title, targets) => {
    document.getElementById('edit-section-modal').classList.remove('hidden');
    document.getElementById('edit-section-id').value = id;
    document.getElementById('edit-section-title').value = title;
    document.getElementById('edit-section-name').textContent = title;

    // Reset all checkboxes first
    document.querySelectorAll('input[name="edit-target-college"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('.edit-departments-list').forEach(div => div.classList.add('hidden'));
    document.querySelectorAll('.edit-dept-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.edit-all-depts').forEach(cb => cb.checked = true);

    // Check if all colleges
    const isAllColleges = !targets || targets.some(t => t.collegeId === 'all');
    document.getElementById('edit-all-colleges').checked = isAllColleges;

    if (!isAllColleges && targets) {
        // Set checkboxes based on targets
        targets.forEach(t => {
            const collegeCheckbox = document.querySelector(`input[name="edit-target-college"][value="${t.collegeId}"]`);
            if (collegeCheckbox) {
                collegeCheckbox.checked = true;
                const deptsDiv = document.getElementById(`edit-depts-${t.collegeId}`);
                if (deptsDiv) {
                    deptsDiv.classList.remove('hidden');

                    if (t.departmentId === 'all') {
                        deptsDiv.querySelector('.edit-all-depts').checked = true;
                    } else {
                        deptsDiv.querySelector('.edit-all-depts').checked = false;
                        const deptCheckbox = deptsDiv.querySelector(`input[value="${t.departmentId}"]`);
                        if (deptCheckbox) deptCheckbox.checked = true;
                    }
                }
            }
        });
    }

    // Add event listeners for college checkboxes in edit modal
    document.querySelectorAll('.edit-college-checkbox').forEach(cb => {
        cb.onchange = () => {
            const collegeId = cb.dataset.college;
            const deptsDiv = document.getElementById(`edit-depts-${collegeId}`);
            if (deptsDiv) {
                deptsDiv.classList.toggle('hidden', !cb.checked);
            }
        };
    });
};

// حفظ تعديلات المادة
window.saveSectionEdit = async () => {
    const id = document.getElementById('edit-section-id').value;
    const title = document.getElementById('edit-section-title').value.trim();
    const allColleges = document.getElementById('edit-all-colleges').checked;

    if (!title) return alert("يرجى إدخال اسم المادة");

    let targets = [];

    if (allColleges) {
        targets = [{ collegeId: 'all', departmentId: 'all' }];
    } else {
        // جمع الكليات والأقسام المختارة
        document.querySelectorAll('input[name="edit-target-college"]:checked').forEach(collegeCheckbox => {
            const collegeId = collegeCheckbox.value;
            const selectedDepts = Array.from(document.querySelectorAll(`input[name="edit-target-dept-${collegeId}"]:checked`)).map(d => d.value);

            if (selectedDepts.includes('all') || selectedDepts.length === 0) {
                targets.push({ collegeId, departmentId: 'all' });
            } else {
                selectedDepts.forEach(deptId => {
                    targets.push({ collegeId, departmentId: deptId });
                });
            }
        });

        if (targets.length === 0) return alert("يرجى اختيار كلية واحدة على الأقل");
    }

    await updateDoc(doc(db, "study_sections", id), { title, targets });

    document.getElementById('edit-section-modal').classList.add('hidden');
    window.showToast?.("✅ تم تحديث المادة بنجاح", "success");
    openCmsView();
};

window.delSec = async (id, title = '') => {
    const label = title ? `المادة "${title}"` : 'هذه المادة';
    if (!confirm(`⚠️ حذف ${label} وجميع دروسها نهائياً؟\n\nلا يمكن التراجع عن هذا الإجراء.`)) return;
    try {
        await deleteDoc(doc(db, "study_sections", id));
        window.showToast?.(`✅ تم حذف ${label} بنجاح`, 'success');
        openCmsView();
    } catch (e) {
        console.error('Delete error:', e);
        window.showToast?.('حدث خطأ أثناء الحذف', 'error');
    }
};

export const openAdminSubsectionEditor = async (sid) => {
    document.getElementById('admin-view-area').classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('admin-view-title').textContent = `إدارة الدروس والمحتوى`;
    document.getElementById('admin-view-content').innerHTML = `
        <div class="mb-10 bg-white dark:bg-surface-800 p-8 rounded-[2.5rem] shadow-2xl border-t-8 border-primary-600">
            <h3 class="text-2xl font-black mb-6 dark:text-white flex items-center gap-2"><i class="fas fa-edit"></i> إضافة / تعديل درس</h3>
            <input type="hidden" id="sub-id">
            <input type="text" id="sub-title" placeholder="عنوان الدرس" class="w-full p-4 rounded-2xl border dark:bg-surface-700 dark:border-surface-600 dark:text-white mb-4 outline-none focus:ring-2 focus:ring-primary-500 font-bold">
            
            <div class="flex flex-wrap gap-4 mb-4">
                <label class="flex items-center gap-2 font-bold dark:text-white cursor-pointer bg-surface-50 dark:bg-surface-700 px-4 py-2 rounded-xl border border-surface-200 dark:border-surface-600 hover:bg-primary-50 transition">
                    <input type="checkbox" id="is-book" class="w-5 h-5 accent-primary-600"> وضع الكتاب (Book Mode)
                </label>
                <label class="flex items-center gap-2 font-bold dark:text-white cursor-pointer bg-accent-50 dark:bg-accent-900/30 px-4 py-2 rounded-xl border border-accent-200 dark:border-accent-700 hover:bg-accent-100 transition">
                    <input type="checkbox" id="allow-download" class="w-5 h-5 accent-accent-600" checked> 
                    <i class="fas fa-download text-accent-600"></i>
                    السماح بالتنزيل
                </label>
            </div>
            
            <div id="editor-wrap" class="mb-6 border rounded-2xl overflow-hidden shadow-inner">
                <div id="editor" class="bg-white text-black h-80"></div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div>
                    <label class="block text-xs font-black text-surface-400 mb-2 uppercase">رابط فيديو (YouTube) أو ملف خارجي:</label>
                    <input type="text" id="sub-url" class="w-full p-4 rounded-2xl border dark:bg-surface-700 dark:text-white outline-none" placeholder="https://...">
                </div>
                <div>
                    <label class="block text-xs font-black text-surface-400 mb-2 uppercase">أو رفع ملف مباشر (PDF/Image):</label>
                    <input type="file" id="sub-file" class="w-full p-3 border rounded-2xl dark:bg-surface-700 text-surface-500">
                </div>
            </div>
            
            <div class="flex gap-3">
                <button id="save-sub" class="flex-1 bg-primary-600 text-white px-10 py-4 rounded-2xl font-black shadow-lg hover:bg-primary-700 transition transform hover:-translate-y-1">حفظ الدرس</button>
                <button id="cancel-sub" class="hidden bg-surface-200 text-surface-600 px-6 py-4 rounded-2xl font-bold hover:bg-surface-300 transition">إلغاء</button>
            </div>
        </div>
        <div id="sub-list" class="space-y-3 pb-20"></div>
    `;
    setTimeout(async () => { if (document.getElementById('editor')) { await window.loadQuill?.(); quill = new Quill('#editor', { theme: 'snow', modules: { toolbar: [['bold', 'italic', 'underline'], [{ 'header': 1 }, { 'header': 2 }], ['link', 'image', 'video'], ['clean']] } }); } }, 100);

    document.getElementById('save-sub').onclick = async () => {
        const t = document.getElementById('sub-title').value;
        if (!t) return window.showToast?.("العنوان مطلوب", "error");
        const btn = document.getElementById('save-sub');
        btn.disabled = true;
        btn.textContent = 'جاري المعالجة...';
        const subId = document.getElementById('sub-id').value;
        const subRawUrl = document.getElementById('sub-url').value.trim();
        const fileUrl = document.getElementById('sub-file').files[0] ? await uploadToCloudinary(document.getElementById('sub-file').files[0]) : subRawUrl;
        const allowDownload = document.getElementById('allow-download').checked;
        const data = {
            title: t,
            isBookMode: document.getElementById('is-book').checked,
            content: quill.root.innerHTML,
            fileUrl,
            allowDownload,
            createdAt: new Date()
        };
        const isNew = !subId;
        if (subId) await updateDoc(doc(db, "study_sections", sid, "subsections", subId), data);
        else await addDoc(collection(db, "study_sections", sid, "subsections"), data);

        // 🔔 إرسال إشعار للطلاب عند إضافة محتوى جديد
        if (isNew) {
            try {
                const sectionDoc = await getDoc(doc(db, "study_sections", sid));
                let sectionTitle = 'مادة';
                let targetUsers = { type: 'all' };

                if (sectionDoc.exists()) {
                    const sData = sectionDoc.data();
                    sectionTitle = sData.title || 'مادة';
                    if (sData.departmentId) {
                        targetUsers = { type: 'departments', departmentIds: [sData.departmentId] };
                    } else if (sData.collegeId) {
                        targetUsers = { type: 'colleges', collegeIds: [sData.collegeId] };
                    }
                }

                const { sendNotificationToUsers } = await import('./notifications.js');
                await sendNotificationToUsers(
                    '📚 محتوى جديد!',
                    `تم إضافة "${t}" في مادة ${sectionTitle}`,
                    'new_content',
                    targetUsers
                );
            } catch (e) { console.error('Notification error:', e); }
        }

        window.showToast?.("✅ تم الحفظ بنجاح", "success");
        window.location.reload();
    };
    loadSubAdminList(sid);
};

const loadSubAdminList = async (sid) => {
    const list = document.getElementById('sub-list');
    const snap = await getDocs(query(collection(db, "study_sections", sid, "subsections"), orderBy("createdAt", "asc")));
    snap.forEach(d => {
        const data = d.data();
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-5 bg-white dark:bg-surface-800 rounded-2xl shadow-sm border border-surface-100 dark:border-surface-700";
        const allowDownloadBadge = data.allowDownload !== false
            ? '<span class="bg-accent-100 text-accent-600 px-2 py-1 rounded text-xs"><i class="fas fa-download"></i></span>'
            : '<span class="bg-red-100 text-red-600 px-2 py-1 rounded text-xs"><i class="fas fa-ban"></i></span>';
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="font-bold dark:text-white">${data.title}</span>
                ${allowDownloadBadge}
            </div>
            <div class="flex gap-2">
                <button class="bg-primary-50 text-primary-600 px-4 py-2 rounded-xl text-xs font-bold" onclick="window.editSubFull('${d.id}', '${data.title}', ${data.isBookMode}, '${data.fileUrl || ''}', ${data.allowDownload !== false})">✏️ تعديل</button>
                <button class="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-xs font-bold" onclick="window.delSubFinal('${sid}','${d.id}')">🗑️ حذف</button>
            </div>
        `;
        list.appendChild(div);
    });
};

window.editSubFull = (id, title, book, url, allowDownload = true) => {
    document.getElementById('sub-id').value = id;
    document.getElementById('sub-title').value = title;
    document.getElementById('is-book').checked = book;
    document.getElementById('sub-url').value = url || '';
    document.getElementById('allow-download').checked = allowDownload;
    document.getElementById('cancel-sub').classList.remove('hidden');
    document.getElementById('admin-view-content').scrollIntoView({ behavior: 'smooth' });
};
window.delSubFinal = async (sid, id) => { if (confirm("حذف الدرس؟")) { await deleteDoc(doc(db, "study_sections", sid, "subsections", id)); window.location.reload(); } };

// --- ✅ الجزء الذي كان ناقصاً: إدارة الكويزات (Quiz Admin) ---
export const openQuizCmsMain = async () => {
    document.getElementById('admin-view-area').classList.remove('hidden');
    ['study-sections-container', 'subsection-viewer', 'quiz-section', 'scores-section', 'assignments-section', 'profile-section', 'admin-settings-section'].forEach(id => document.getElementById(id)?.classList.add('hidden'));

    document.getElementById('admin-view-title').textContent = 'إدارة الاختبارات';
    const content = document.getElementById('admin-view-content');

    const sectionsSnap = await getDocs(collection(db, "study_sections"));
    allSectionsCacheForQuiz = [];
    sectionsSnap.forEach(doc => { allSectionsCacheForQuiz.push({ id: doc.id, ...doc.data() }); });

    const colOptions = UNIVERSITY_STRUCTURE.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    content.innerHTML = `
        <div class="mb-8 p-6 bg-primary-50 dark:bg-surface-700 rounded shadow border-l-4 border-primary-500">
            <h3 class="font-bold text-lg mb-4 dark:text-white">إضافة اختبار جديد</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input type="text" id="quiz-title" placeholder="عنوان الاختبار" class="p-3 border rounded dark:bg-surface-800 dark:text-white">
                <input type="number" id="quiz-time" placeholder="الوقت (دقيقة)" class="p-3 border rounded dark:bg-surface-800 dark:text-white">
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <select id="quiz-col-select" class="p-3 border rounded dark:bg-surface-800 dark:text-white"><option value="">-- اختر الكلية --</option>${colOptions}</select>
                <select id="quiz-dept-select" class="p-3 border rounded dark:bg-surface-800 dark:text-white" disabled><option value="all">عام لكل الكلية</option></select>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-bold mb-1 dark:text-surface-300">المادة المرتبطة (اختياري):</label>
                <select id="quiz-section-select" class="w-full p-3 border rounded dark:bg-surface-800 dark:text-white" disabled><option value="general">نشاط عام (بدون مادة)</option></select>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input type="number" id="quiz-attempts" placeholder="عدد المحاولات (0 = مفتوح)" class="p-3 border rounded dark:bg-surface-800 dark:text-white" value="1">
                <div class="flex items-center gap-2 p-3 bg-white dark:bg-surface-800 border rounded"><input type="checkbox" id="quiz-random" class="w-5 h-5"><label class="dark:text-surface-200">أسئلة عشوائية</label></div>
            </div>
            <textarea id="quiz-desc" placeholder="وصف الاختبار / تعليمات" class="w-full p-3 border rounded mb-4 dark:bg-surface-800 dark:text-white"></textarea>
            <button id="add-quiz-btn" class="bg-primary-600 text-white px-6 py-2 rounded font-bold hover:bg-primary-700 w-full md:w-auto">إنشاء الاختبار</button>
        </div>
        <h3 class="font-bold text-xl mb-4 dark:text-white">الاختبارات الحالية</h3>
        <div id="quizzes-admin-list" class="space-y-4"></div>
    `;

    const colSelect = document.getElementById('quiz-col-select');
    const deptSelect = document.getElementById('quiz-dept-select');
    const sectionSelect = document.getElementById('quiz-section-select');

    const updateSectionsDropdown = () => {
        const selectedCol = colSelect.value; const selectedDept = deptSelect.value;
        sectionSelect.innerHTML = '<option value="general">نشاط عام (بدون مادة)</option>';
        sectionSelect.disabled = !selectedCol;
        if (selectedCol) {
            const filteredSections = allSectionsCacheForQuiz.filter(s => s.collegeId === selectedCol && (s.departmentId === 'all' || s.departmentId === selectedDept));
            filteredSections.forEach(s => { sectionSelect.innerHTML += `<option value="${s.id}">${s.title}</option>`; });
        }
    };

    colSelect.onchange = () => {
        const colId = colSelect.value; deptSelect.innerHTML = '<option value="all">عام لكل الكلية</option>'; deptSelect.disabled = !colId;
        if (colId) { const col = UNIVERSITY_STRUCTURE.find(c => c.id === colId); if (col && col.departments) { col.departments.forEach(dept => { deptSelect.innerHTML += `<option value="${dept.id}">${dept.name}</option>`; }); } }
        updateSectionsDropdown();
    };
    deptSelect.onchange = updateSectionsDropdown;

    document.getElementById('add-quiz-btn').onclick = async () => {
        const title = document.getElementById('quiz-title').value;
        const collegeId = colSelect.value;
        const departmentId = deptSelect.value;
        const sectionId = sectionSelect.value;
        const sectionTitle = sectionSelect.options[sectionSelect.selectedIndex].text;
        const timeLimit = document.getElementById('quiz-time').value;
        const attempts = document.getElementById('quiz-attempts').value;
        const description = document.getElementById('quiz-desc').value;
        const randomize = document.getElementById('quiz-random').checked;
        if (!title || !timeLimit || !collegeId) return alert("يرجى إدخال البيانات الأساسية");
        await addDoc(collection(db, "quizzes"), { title, description, timeLimit: parseInt(timeLimit), maxAttempts: parseInt(attempts) || 0, randomize, collegeId, departmentId, sectionId, sectionTitle, createdAt: new Date() });
        alert("تم إنشاء الاختبار"); openQuizCmsMain();
    };
    loadAdminQuizzes();
};

const loadAdminQuizzes = async () => {
    const list = document.getElementById('quizzes-admin-list');
    list.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner fa-spin text-primary-600"></i> جاري التحميل...</div>';
    const q = query(collection(db, "quizzes"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    list.innerHTML = '';
    if (snap.empty) { list.innerHTML = '<p class="text-center text-surface-500">لا توجد اختبارات.</p>'; return; }
    snap.forEach(d => {
        const data = d.data();
        const div = document.createElement('div');
        div.className = "flex flex-col md:flex-row justify-between items-center p-4 bg-white dark:bg-surface-800 rounded shadow mb-3";
        div.innerHTML = `<div class="mb-2 md:mb-0"><h4 class="font-bold text-lg dark:text-white">${data.title}</h4><p class="text-xs text-primary-600 font-bold mb-1">${data.sectionTitle || 'عام'} | ${data.departmentId}</p><p class="text-xs text-surface-500">${data.timeLimit} دقيقة</p></div><div class="flex gap-2"><button class="mng-questions-btn bg-primary-100 text-primary-700 px-4 py-1 rounded font-bold text-sm" onclick="window.openQuizQuestionsEditor('${d.id}', '${data.title}')">إدارة الأسئلة</button><button class="del-quiz-btn bg-red-100 text-red-700 px-4 py-1 rounded font-bold text-sm" onclick="window.deleteQuiz('${d.id}')">حذف</button></div>`;
        list.appendChild(div);
    });
};

window.deleteQuiz = async (id) => { if (confirm("حذف الاختبار؟")) { await deleteDoc(doc(db, "quizzes", id)); loadAdminQuizzes(); } };

window.openQuizQuestionsEditor = async (quizId, quizTitle) => {
    const content = document.getElementById('admin-view-content');
    content.innerHTML = `<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold dark:text-white">أسئلة: <span class="text-primary-600">${quizTitle}</span></h3><button onclick="window.openQuizCmsMain()" class="text-sm bg-surface-200 px-3 py-1 rounded">عودة</button></div><div class="mb-8 p-4 bg-surface-50 dark:bg-surface-800 border rounded"><h4 class="font-bold mb-3 dark:text-white">إضافة سؤال</h4><input type="text" id="q-text" placeholder="نص السؤال" class="w-full p-2 mb-3 border rounded dark:bg-surface-700 dark:text-white"><div class="grid grid-cols-2 gap-2 mb-3"><input type="text" id="opt-1" placeholder="الخيار 1" class="p-2 border rounded dark:bg-surface-700 dark:text-white"><input type="text" id="opt-2" placeholder="الخيار 2" class="p-2 border rounded dark:bg-surface-700 dark:text-white"><input type="text" id="opt-3" placeholder="الخيار 3" class="p-2 border rounded dark:bg-surface-700 dark:text-white"><input type="text" id="opt-4" placeholder="الخيار 4" class="p-2 border rounded dark:bg-surface-700 dark:text-white"></div><input type="text" id="correct-ans" placeholder="الإجابة الصحيحة" class="w-full p-2 mb-3 border rounded bg-accent-50 dark:bg-accent-900 dark:text-white"><button id="add-q-btn" class="w-full bg-primary-600 text-white py-2 rounded font-bold hover:bg-primary-700">إضافة السؤال</button></div><div id="questions-list" class="space-y-3"></div>`;
    document.getElementById('add-q-btn').onclick = async () => { const text = document.getElementById('q-text').value; const options = [document.getElementById('opt-1').value, document.getElementById('opt-2').value, document.getElementById('opt-3').value, document.getElementById('opt-4').value].filter(o => o); const correctAnswer = document.getElementById('correct-ans').value; if (!text || options.length < 2 || !correctAnswer) return alert("أكمل بيانات السؤال"); await addDoc(collection(db, "quizzes", quizId, "questions"), { text, options, correctAnswer, createdAt: new Date() }); window.openQuizQuestionsEditor(quizId, quizTitle); };
    const list = document.getElementById('questions-list'); const snap = await getDocs(query(collection(db, "quizzes", quizId, "questions"), orderBy("createdAt", "asc"))); list.innerHTML = '';
    snap.forEach((d, idx) => { const q = d.data(); list.innerHTML += `<div class="bg-white dark:bg-surface-700 p-3 rounded shadow mb-2"><div class="flex justify-between"><span class="font-bold text-primary-600 dark:text-primary-400">س${idx + 1}: ${q.text}</span><button class="text-red-500 font-bold" onclick="window.deleteQuestion('${quizId}', '${d.id}', '${quizTitle}')">×</button></div><p class="text-xs text-surface-500 mt-1">الإجابة: ${q.correctAnswer}</p></div>`; });
};

window.deleteQuestion = async (quizId, qId, title) => { if (confirm("حذف السؤال؟")) { await deleteDoc(doc(db, "quizzes", quizId, "questions", qId)); window.openQuizQuestionsEditor(quizId, title); } };

// ============================================================
// مشاركة الدرس على واتساب
// ============================================================
window.shareLesson = (sectionId, title) => {
    const url = `${window.location.origin}/#section/${sectionId}`;
    const text = `📚 شوف الدرس ده على منصة مسار!\n\n📖 ${title}\n\n🔗 ${url}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
};