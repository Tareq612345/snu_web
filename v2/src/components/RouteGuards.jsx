import {Navigate} from 'react-router-dom';
import {useAuth} from '../context/AuthContext';
import ClientDeterrence from './ClientDeterrence';

export function Protected({role,children}){
  const {session,profile,loading}=useAuth();
  if(loading)return <div className="fullLoader">جاري تحميل البوابة…</div>;
  if(!session)return <Navigate to="/login" replace/>;
  if(!profile)return <div className="setupNotice">الحساب مسجل، لكن ملفه الجامعي لم يُنشأ بعد أو تم تعطيله. تواصل مع إدارة النظام.</div>;
  if(role&&profile.role!==role&&profile.role!=='admin')return <Navigate to={profile.role==='faculty'?'/faculty':'/student'} replace/>;
  return <><ClientDeterrence role={profile.role}/>{children}</>;
}
