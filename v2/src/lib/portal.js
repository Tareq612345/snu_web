const valid=new Set(['student','faculty','admin']);
const configured=String(import.meta.env.VITE_PORTAL_TYPE||'').toLowerCase();
export const portalScope=valid.has(configured)?configured:'all';
export const portalAllows=role=>portalScope==='all'||portalScope===role||role==='admin';
export const roleHome=role=>role==='admin'?'/admin':role==='faculty'?'/faculty':'/student';
export const loginHome=role=>role==='admin'&&portalScope!=='all'?`/${portalScope}`:roleHome(role);
export const portalName=portalScope==='student'?'بوابة الطالب':portalScope==='faculty'?'بوابة أعضاء هيئة التدريس':portalScope==='admin'?'بوابة الإدارة':'البوابة التعليمية';
