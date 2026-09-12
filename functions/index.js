// ============================================================
// Firebase Cloud Functions v2 - Masar Platform
// إرسال الإشعارات التلقائية
// ============================================================

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

// ============================================================
// 1. إشعار عند نشر منشور جديد
// ============================================================
exports.onNewPost = onDocumentCreated('admin_posts/{postId}', async (event) => {
    const snap = event.data;
    if (!snap) return null;

    const post = snap.data();
    const postId = event.params.postId;

    console.log('📝 New post created:', postId);

    try {
        // تحديد المستخدمين المستهدفين
        let usersQuery = db.collection('users').where('fcmToken', '!=', null);

        // لو المنشور مستهدف لكليات معينة
        if (post.target?.type === 'colleges' && post.target.collegeIds?.length > 0) {
            usersQuery = usersQuery.where('collegeId', 'in', post.target.collegeIds);
        }
        // لو مستهدف لأقسام معينة
        else if (post.target?.type === 'departments' && post.target.departmentIds?.length > 0) {
            usersQuery = usersQuery.where('departmentId', 'in', post.target.departmentIds);
        }

        const usersSnap = await usersQuery.get();

        if (usersSnap.empty) {
            console.log('No users with FCM tokens found');
            return null;
        }

        // تجميع الـ tokens
        const tokens = [];
        usersSnap.forEach(doc => {
            const token = doc.data().fcmToken;
            if (token) tokens.push(token);
        });

        if (tokens.length === 0) return null;

        // إعداد الإشعار
        const notification = {
            title: '📢 منشور جديد من الإدارة',
            body: post.content?.substring(0, 100) || 'لديك منشور جديد',
        };

        const message = {
            notification,
            data: {
                type: 'post',
                postId: postId,
                url: '/#posts'
            },
            tokens: tokens
        };

        // إرسال الإشعارات
        const response = await messaging.sendEachForMulticast(message);
        console.log(`✅ Sent ${response.successCount} notifications, ${response.failureCount} failed`);

        return null;
    } catch (error) {
        console.error('Error sending post notification:', error);
        return null;
    }
});

// ============================================================
// 2. إشعار للأدمن عند رفع كارنيه جديد
// ============================================================
exports.onNewIdCard = onDocumentUpdated('system/pendingIds', async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    if (!before || !after) return null;

    // تحقق إن الـ count زاد (رفع جديد)
    if (after.count <= before.count) return null;

    console.log('🆔 New ID card uploaded by:', after.lastUploader);

    try {
        // جلب الـ token بتاع الـ super admin
        const SUPER_ADMIN_EMAIL = 'tareq612345@gmail.com';

        // البحث عن المستخدم الأدمن
        const adminQuery = await db.collection('users')
            .where('email', '==', SUPER_ADMIN_EMAIL)
            .where('fcmToken', '!=', null)
            .get();

        if (adminQuery.empty) {
            console.log('Admin user not found or no FCM token');
            return null;
        }

        const adminToken = adminQuery.docs[0].data().fcmToken;

        // إرسال الإشعار
        const message = {
            notification: {
                title: '🆔 كارنيه جديد للمراجعة',
                body: `${after.lastUploader} رفع كارنيه جديد`,
            },
            data: {
                type: 'id_card',
                url: '/#id-review'
            },
            token: adminToken
        };

        await messaging.send(message);
        console.log('✅ Admin notification sent');

        return null;
    } catch (error) {
        console.error('Error sending ID notification:', error);
        return null;
    }
});

// ============================================================
// 3. إشعار للطالب عند رد على الدعم الفني
// ============================================================
exports.onSupportReply = onDocumentCreated('support_chats/{chatId}/messages/{messageId}', async (event) => {
    const snap = event.data;
    if (!snap) return null;

    const message = snap.data();
    const chatId = event.params.chatId;

    // لو الرسالة من الأدمن (رد على الطالب)
    if (!message.isStaff) return null;

    console.log('💬 Staff replied to support chat:', chatId);

    try {
        // جلب بيانات الطالب
        const userDoc = await db.collection('users').doc(chatId).get();

        if (!userDoc.exists) return null;

        const userData = userDoc.data();
        const token = userData.fcmToken;

        if (!token) {
            console.log('User has no FCM token');
            return null;
        }

        // إرسال الإشعار
        const notif = {
            notification: {
                title: '💬 رد من الدعم الفني',
                body: message.text?.substring(0, 100) || 'لديك رد جديد',
            },
            data: {
                type: 'support',
                url: '/#support'
            },
            token: token
        };

        await messaging.send(notif);
        console.log('✅ Support notification sent to user');

        return null;
    } catch (error) {
        console.error('Error sending support notification:', error);
        return null;
    }
});

// ============================================================
// 4. إشعار عند تنبيه عام
// ============================================================
exports.onUrgentAlert = onDocumentCreated('urgent_alerts/{alertId}', async (event) => {
    const snap = event.data;
    if (!snap) return null;

    const alert = snap.data();

    console.log('🚨 Urgent alert created');

    try {
        // جلب كل المستخدمين
        const usersSnap = await db.collection('users')
            .where('fcmToken', '!=', null)
            .get();

        if (usersSnap.empty) return null;

        const tokens = [];
        usersSnap.forEach(doc => {
            const token = doc.data().fcmToken;
            if (token) tokens.push(token);
        });

        if (tokens.length === 0) return null;

        const message = {
            notification: {
                title: '🚨 تنبيه عاجل!',
                body: alert.message || 'لديك تنبيه مهم',
            },
            data: {
                type: 'urgent',
                url: '/'
            },
            tokens: tokens
        };

        const response = await messaging.sendEachForMulticast(message);
        console.log(`✅ Urgent alert sent to ${response.successCount} users`);

        return null;
    } catch (error) {
        console.error('Error sending urgent alert:', error);
        return null;
    }
});

// ============================================================
// 5. إشعار من نظام الإشعارات الداخلي (CMS Alerts الطريقة الصامتة)
// ============================================================
exports.onQueueNotification = onDocumentCreated('notifications_queue/{notifId}', async (event) => {
    const snap = event.data;
    if (!snap) return null;

    const notif = snap.data();
    console.log('📬 Process notification queue:', notif.title);

    try {
        let usersQuery = db.collection('users').where('fcmToken', '!=', null);

        // التوجيه المخصص
        if (notif.targetUsers && typeof notif.targetUsers === 'object') {
            if (notif.targetUsers.type === 'colleges' && notif.targetUsers.collegeIds?.length > 0) {
                usersQuery = usersQuery.where('collegeId', 'in', notif.targetUsers.collegeIds);
            } else if (notif.targetUsers.type === 'departments' && notif.targetUsers.departmentIds?.length > 0) {
                usersQuery = usersQuery.where('departmentId', 'in', notif.targetUsers.departmentIds);
            }
        }

        const usersSnap = await usersQuery.get();
        if (usersSnap.empty) {
            console.log('No targets found for notif:', notif.title);
            return null;
        }

        const tokens = [];
        usersSnap.forEach(doc => {
            const token = doc.data().fcmToken;
            if (token) tokens.push(token);
        });

        if (tokens.length === 0) return null;

        const message = {
            notification: {
                title: notif.title || 'إشعار جديد',
                body: notif.body || 'لديك إشعار من النظام',
            },
            data: {
                type: notif.type || 'info',
                url: '/'
            },
            tokens: tokens
        };

        const response = await messaging.sendEachForMulticast(message);
        console.log(`✅ Queue Notification sent to ${response.successCount} users`);

        await snap.ref.update({ status: 'sent' });
        return null;
    } catch (error) {
        console.error('Error sending queue notification:', error);
        await snap.ref.update({ status: 'error', error: error.message });
        return null;
    }
});

console.log('🚀 Masar Cloud Functions v2 loaded');
