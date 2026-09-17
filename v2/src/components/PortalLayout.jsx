import {useEffect,useState} from 'react';
import {NavLink,Outlet,useLocation} from 'react-router-dom';
import Brand from './Brand';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';
import {useAuth} from '../context/AuthContext';

const links={
  student:[['/student','home','الرئيسية'],['/student/courses','book','موادي'],['/student/materials','file','المكتبة'],['/student/announcements','news','الإعلانات'],['/student/assignments','file','الواجبات'],['/student/quizzes','shield','الاختبارات'],['/student/attendance','calendar','الحضور'],['/student/notifications','news','الإشعارات'],['/student/support','comment','الدعم'],['/student/profile','profile','الملف الشخصي']],
  faculty:[['/faculty','home','الرئيسية'],['/faculty/courses','book','المقررات'],['/faculty/materials','file','المواد'],['/faculty/upload','upload','رفع مادة'],['/faculty/announcements','news','الإعلانات'],['/faculty/assignments','file','الواجبات والدرجات'],['/faculty/quizzes','shield','الاختبارات'],['/faculty/attendance','calendar','الحضور'],['/faculty/students','users','الطلاب'],['/faculty/notifications','news','الإشعارات'],['/faculty/profile','profile','الملف الشخصي']],
  admin:[['/admin','admin','لوحة الإدارة'],['/admin/users','users','المستخدمون'],['/admin/academic','building','الهيكل الأكاديمي'],['/admin/roster','users','التسجيل والتدريس'],['/admin/announcements','news','الإعلانات'],['/admin/assignments','file','الواجبات'],['/admin/quizzes','shield','الاختبارات'],['/admin/attendance','calendar','الحضور'],['/admin/notifications','news','الإشعارات'],['/admin/support','comment','الدعم'],['/admin/profile','profile','الملف الشخصي']]
};
const labels={student:'بوابة الطالب',faculty:'بوابة أعضاء هيئة التدريس',admin:'بوابة الإدارة'};
const roles={student:'طالب',faculty:'عضو هيئة تدريس',admin:'مسؤول النظام'};

export default function PortalLayout({type}){
  const {profile,signOut}=useAuth();
  const location=useLocation();
  const [menuOpen,setMenuOpen]=useState(false);
  const displayName=profile?.full_name||'مستخدم الجامعة';
  const initial=displayName.trim().charAt(0)||'ج';

  useEffect(()=>setMenuOpen(false),[location.pathname]);
  useEffect(()=>{
    document.body.classList.toggle('portalMenuOpen',menuOpen);
    return()=>document.body.classList.remove('portalMenuOpen');
  },[menuOpen]);

  return <div className={`portal portal-${type}`}>
    <a className="skipLink" href="#main-content">تخطَّ إلى المحتوى</a>
    <header className="mobilePortalBar">
      <Brand/>
      <button className="mobileMenuButton" type="button" aria-label="فتح القائمة" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}>
        <span/><span/><span/>
      </button>
    </header>
    <button className={`portalOverlay ${menuOpen?'isOpen':''}`} type="button" aria-label="إغلاق القائمة" onClick={()=>setMenuOpen(false)}/>
    <aside className={`portalSidebar ${menuOpen?'isOpen':''}`} aria-label={labels[type]}>
      <div className="mobileDrawerHead">
        <strong>{labels[type]}</strong>
        <button type="button" onClick={()=>setMenuOpen(false)} aria-label="إغلاق القائمة">×</button>
      </div>
      <div className="sidebarBrand"><Brand/></div>
      <div className="identity">
        <div className="userAvatar" aria-hidden="true">{initial}</div>
        <div><span>{roles[type]}</span><strong>{displayName}</strong><small>{profile?.university_id||'جامعة السويس الأهلية'}</small></div>
      </div>
      <span className="navLabel">القائمة الرئيسية</span>
      <nav aria-label={labels[type]}>{links[type].map(([to,icon,label])=><NavLink key={to} to={to} end={to===`/${type}`}><Icon name={icon}/><span>{label}</span><Icon name="arrow" size={16}/></NavLink>)}</nav>
      <div className="sidebarFooter"><ThemeToggle/><button className="logout" onClick={signOut}><Icon name="logout"/>تسجيل الخروج</button><small>منصة تعليمية آمنة</small></div>
    </aside>
    <main id="main-content">
      <header className="portalTopbar"><div className="topbarTitle"><span className="topbarMark"><Icon name="graduate"/></span><div><strong>{labels[type]}</strong><small>جامعة السويس الأهلية</small></div></div><div className="academicYear"><span/><div><small>العام الجامعي</small><strong>2026 / 2027</strong></div></div></header>
      <section className="page"><Outlet/></section>
    </main>
  </div>;
}
