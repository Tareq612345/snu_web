import {NavLink,Outlet} from 'react-router-dom';
import Brand from './Brand';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';
import {useAuth} from '../context/AuthContext';

const links={
  student:[['/student','home','الرئيسية'],['/student/courses','book','موادي'],['/student/materials','file','المكتبة والملفات'],['/student/announcements','news','الإعلانات'],['/student/profile','profile','الملف الشخصي']],
  faculty:[['/faculty','home','الرئيسية'],['/faculty/courses','book','المقررات'],['/faculty/materials','file','المواد والتعليقات'],['/faculty/upload','upload','رفع مادة علمية'],['/faculty/students','users','الطلاب'],['/faculty/profile','profile','الملف الشخصي']],
  admin:[['/admin','admin','لوحة الإدارة'],['/admin/users','users','المستخدمون'],['/admin/profile','profile','الملف الشخصي']]
};
const labels={student:'بوابة الطالب',faculty:'بوابة أعضاء هيئة التدريس',admin:'بوابة الإدارة'};

export default function PortalLayout({type}){
  const {profile,signOut}=useAuth();
  return <div className="portal"><aside><Brand/><div className="identity"><span>{labels[type]}</span><strong>{profile?.full_name||'مستخدم الجامعة'}</strong><small>{profile?.university_id||''}</small></div><nav>{links[type].map(([to,icon,label])=><NavLink key={to} to={to} end={to===`/${type}`}><Icon name={icon}/><span>{label}</span><b>‹</b></NavLink>)}</nav><ThemeToggle/><button className="logout" onClick={signOut}><Icon name="logout"/>تسجيل الخروج</button></aside><main><header><div><Icon name="graduate"/><span>{labels[type]}</span></div><small>العام الجامعي 2026/2027</small></header><section className="page"><Outlet/></section></main></div>;
}
