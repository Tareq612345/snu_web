/**
 * split-admin.js — Script to split admin.js into modules
 * Run: node split-admin.js
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync('admin.js', 'utf8');
const lines = src.split(/\r?\n/);
const outDir = path.join(__dirname, 'js', 'admin');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const SHARED_IMPORT = `import {
    db, auth, SUPER_ADMIN_EMAIL, storage,
    UNIVERSITY_STRUCTURE,
    collection, getDocs, query, orderBy, doc, setDoc, deleteDoc,
    addDoc, getDoc, updateDoc, writeBatch, where, serverTimestamp, limit, arrayRemove,
    ref, deleteObject,
    sendNotification, openAdminSupportDashboard,
    allSectionsCache, currentSelectedScopes, editingAdminEmail,
    setAllSectionsCache, setCurrentSelectedScopes, setEditingAdminEmail
} from './_shared.js';\n\n`;

// Define modules with their line ranges (0-indexed)
const modules = {
    'logs.js': [
        [19, 37],      // logAdminAction + window._logAdminAction
        [4138, 4601],  // openDeviceSessionsView, openBlocksDashboard, forceLogoutUser, etc.
        [4506, 4601],  // openLoginLogsView
        [6567, 6644],  // openAdminActivityLog
    ],
    'settings.js': [
        [2904, 3111],  // Maintenance Mode + Whitelist
    ],
    'reports.js': [
        [4730, 4936],  // Reports System
    ],
    'stats.js': [
        [3773, 3869],  // openStatisticsDashboard
        [4603, 4729],  // openAdvancedStatsDashboard
        [5067, 5275],  // openAdvancedExport + export functions
    ],
    'content.js': [
        [56, 335],     // Assignments
        [336, 401],    // Live Session
        [1259, 1383],  // Scores
        [3499, 3772],  // Grades Upload
        [3939, 4137],  // Exams + Question Bank
        [5276, 5447],  // Content Management
        [5448, 5703],  // Quiz Attempts Manager
    ],
    'notifications.js': [
        [2317, 2601],  // Announcement Control
        [4937, 5066],  // Scheduled Notifications
        [5704, 5866],  // Scheduled Announcements
        [6135, 6381],  // Broadcast Notification Panel
    ],
    'admins.js': [
        [1384, 1966],  // Admin Management View + forms
        [2236, 2295],  // deleteAdmin, startEditAdmin
        [6645, 6803],  // editAdminPermissions, setupDangerousPermissionConfirm, notifyNewAdmin, checkExpiredAdmins
    ],
    'users.js': [
        [38, 55],      // canManageSection
        [402, 896],    // Users Log View + filters
        [897, 1258],   // ID Review Dashboard
        [1966, 2235],  // Global functions (verify, ban, etc.)
        [2602, 2862],  // openBonusModal, openBadgeManager, toggleChatBan, etc.
        [2862, 2903],  // window assignments block
        [2872, 2903],  // filterStudentsBySearch (window), + other window assignments
        [3111, 3451],  // Student Filtering & Targeted Notifications + Excel Export
        [3870, 3938],  // editStudentData, saveStudentData
        [5867, 6134],  // Banned Users Dashboard + deleteUserPermanently
        [6382, 6566],  // editMyProfileData, editUserDataAsAdmin
    ],
};

// Instead of complex extraction, let me just create the module files
// by extracting specific line ranges and wrapping with the shared import

for (const [filename, ranges] of Object.entries(modules)) {
    let content = SHARED_IMPORT;
    content += `// ============================================================\n`;
    content += `// ${filename} — Auto-extracted from admin.js\n`;
    content += `// ============================================================\n\n`;

    const usedLines = new Set();

    // Sort ranges and merge overlaps
    const sortedRanges = ranges.sort((a, b) => a[0] - b[0]);
    const mergedRanges = [];
    for (const [start, end] of sortedRanges) {
        if (mergedRanges.length > 0 && start <= mergedRanges[mergedRanges.length - 1][1]) {
            mergedRanges[mergedRanges.length - 1][1] = Math.max(mergedRanges[mergedRanges.length - 1][1], end);
        } else {
            mergedRanges.push([start, end]);
        }
    }

    for (const [start, end] of mergedRanges) {
        const section = lines.slice(start, end).join('\n');
        // Remove import statements (they come from _shared.js now)
        const cleaned = section
            .replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
            .replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '');
        content += cleaned + '\n\n';
    }

    const outPath = path.join(outDir, filename);
    fs.writeFileSync(outPath, content, 'utf8');
    console.log(`✅ Created: ${filename} (${mergedRanges.map(r => `L${r[0] + 1}-${r[1]}`).join(', ')})`);
}

// Create admin.js aggregator
const aggregator = `// ============================================================
// admin.js - Aggregator (Entry Point)
// ============================================================
// This file imports all admin sub-modules.
// The actual code lives in js/admin/*.js

import './js/admin/_shared.js';
import './js/admin/logs.js';
import './js/admin/settings.js';
import './js/admin/reports.js';
import './js/admin/stats.js';
import './js/admin/content.js';
import './js/admin/notifications.js';
import './js/admin/admins.js';
import './js/admin/users.js';
`;

fs.writeFileSync('admin.js', aggregator, 'utf8');
console.log('\n✅ admin.js converted to aggregator');
console.log('✅ Backup saved as admin.js.backup');
console.log('\n🎉 Refactoring complete! All modules are in js/admin/');
