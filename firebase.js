// firebase.js - إعدادات الاتصال بقاعدة البيانات والخدمات

// استيراد مكتبات Firebase من CDN (لعدم الحاجة لـ Node.js)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

// إعدادات المشروع (Configuration)
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDHy2Uq4RDsDkQKhYKRPijCUeWGfA_34YM",
    authDomain: "web54-f36f4.firebaseapp.com",
    projectId: "web54-f36f4",
    storageBucket: "web54-f36f4.firebasestorage.app",
    messagingSenderId: "771323059906",
    appId: "1:771323059906:web:fae9e7c24364589778655b",
    measurementId: "G-070FYEB76P"
};

// تهيئة التطبيق
const app = initializeApp(FIREBASE_CONFIG);

// البريد الإلكتروني للمالك (Super Admin)
// هذا الإيميل يملك صلاحيات كاملة تلقائياً ولا يمكن حذفه
export const SUPER_ADMIN_EMAIL = "tareq612345@gmail.com";

// تصدير الخدمات لاستخدامها في باقي الملفات
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const provider = new GoogleAuthProvider();

