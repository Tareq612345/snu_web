// ============================================================
// _shared.js — مشترك بين جميع ملفات الأدمن
// ============================================================

import { db, auth, SUPER_ADMIN_EMAIL, storage } from '../../firebase.js';
import { UNIVERSITY_STRUCTURE } from '../../structure.js';
import {
    collection, getDocs, query, orderBy, doc, setDoc, deleteDoc,
    addDoc, getDoc, updateDoc, writeBatch, where, serverTimestamp, limit, arrayRemove
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { sendNotification } from '../../cms.js';
import { openAdminSupportDashboard } from '../../support.js';

// --- متغيرات عامة للاستخدام الداخلي ---
export let allSectionsCache = [];
export let currentSelectedScopes = new Set();
export let editingAdminEmail = null;

// Setters for shared state (since let exports are read-only from other modules)
export const setAllSectionsCache = (val) => { allSectionsCache = val; };
export const setCurrentSelectedScopes = (val) => { currentSelectedScopes = val; };
export const setEditingAdminEmail = (val) => { editingAdminEmail = val; };

// Re-export everything for convenience
export {
    db, auth, SUPER_ADMIN_EMAIL, storage,
    UNIVERSITY_STRUCTURE,
    collection, getDocs, query, orderBy, doc, setDoc, deleteDoc,
    addDoc, getDoc, updateDoc, writeBatch, where, serverTimestamp, limit, arrayRemove,
    ref, deleteObject,
    sendNotification,
    openAdminSupportDashboard
};
