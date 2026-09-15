import {useEffect,useState} from 'react';
import Icon from '../components/Icon';
import {getSupabase} from '../lib/supabase';
import {cleanText,isUuid,validateMaterial} from '../lib/validation';
import {useAuth} from '../context/AuthContext';

const Stat=({icon,label,value})=><article className="stat"><Icon name={icon}/><div><strong>{value}</strong><span>{label}</span></div></article>;

export function StudentHome(){return <><div className="pageTitle"><div><span>مرحباً بك</span><h1>لوحة الطالب</h1><p>تابع موادك وآخر الملفات الأكاديمية.</p></div></div><div className="stats"><Stat icon="book" label="المقررات الحالية" value="—"/><Stat icon="file" label="ملفات جديدة" value="—"/><Stat icon="calendar" label="مهام قادمة" value="—"/><Stat icon="news" label="إعلانات" value="—"/></div><Courses/></>}
export function FacultyHome(){return <><div className="pageTitle"><div><span>مساحة العمل الأكاديمية</span><h1>لوحة عضو هيئة التدريس</h1><p>إدارة المقررات ونشر المواد للطلاب.</p></div></div><div className="stats"><Stat icon="book" label="المقررات" value="—"/><Stat icon="users" label="الطلاب" value="—"/><Stat icon="file" label="المواد المنشورة" value="—"/><Stat icon="upload" label="مسودات" value="—"/></div><Courses faculty/></>}

export function Courses({faculty=false}){
  const {profile}=useAuth();
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let live=true;
    (async()=>{
      const db=await getSupabase();
      if(!db||!profile){if(live)setLoading(false);return;}
      const relation=faculty?'course_staff!inner(profile_id)':'enrollments!inner(student_id,status)';
      const field=faculty?'course_staff.profile_id':'enrollments.student_id';
      let query=db.from('courses').select(`id,code,title,term,academic_year,${relation}`).eq(field,profile.id);
      if(!faculty)query=query.eq('enrollments.status','active').eq('is_published',true);
      const {data,error}=await query.order('code').limit(24);
      if(live){setRows(data||[]);setFailed(Boolean(error));setLoading(false);}
    })();
    return()=>{live=false;};
  },[profile,faculty]);
  return <div className="contentBlock"><div className="blockHead"><div><h2>{faculty?'مقرراتي':'المقررات الحالية'}</h2><p>المحتوى الأكاديمي المتاح خلال الفصل الحالي</p></div></div>{loading?<p className="muted">جاري التحميل…</p>:failed?<div className="empty"><h3>تعذر تحميل المقررات</h3><p>حاول تحديث الصفحة لاحقًا.</p></div>:rows.length?<div className="courseGrid">{rows.map(c=><article className="courseCard" key={c.id}><span>{c.code}</span><Icon name="book"/><h3>{c.title}</h3><p>{c.term} • {c.academic_year}</p><button type="button" disabled>فتح المقرر قريبًا</button></article>)}</div>:<div className="empty"><Icon name="book"/><h3>لا توجد مقررات مرتبطة بالحساب</h3><p>ستظهر المقررات هنا بعد تسجيلها من الإدارة.</p></div>}</div>;
}

export const Materials=()=> <EmptyPage title="المكتبة والملفات" text="الكتب والمذكرات والمحاضرات المنشورة في مقرراتك." icon="download"/>;
export const Announcements=()=> <EmptyPage title="الإعلانات" text="التحديثات الرسمية الخاصة بمقرراتك والجامعة." icon="news"/>;
export const Students=()=> <EmptyPage title="الطلاب" text="قوائم الطلاب المسجلين في مقرراتك." icon="users"/>;
function EmptyPage({title,text,icon}){return <div className="contentBlock"><div className="blockHead"><div><h1>{title}</h1><p>{text}</p></div></div><div className="empty"><Icon name={icon}/><h3>لا توجد بيانات لعرضها الآن</h3></div></div>}

export function UploadMaterial(){
  const {profile}=useAuth();
  const [file,setFile]=useState(null);
  const [title,setTitle]=useState('');
  const [courseId,setCourseId]=useState('');
  const [courses,setCourses]=useState([]);
  const [loadingCourses,setLoadingCourses]=useState(true);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [fileKey,setFileKey]=useState(0);

  useEffect(()=>{
    let active=true;
    (async()=>{
      const db=await getSupabase();
      if(!db||!profile){if(active)setLoadingCourses(false);return;}
      let query=db.from('courses').select('id,code,title').order('code').limit(50);
      if(profile.role!=='admin')query=query.select('id,code,title,course_staff!inner(profile_id)').eq('course_staff.profile_id',profile.id);
      const {data}=await query;
      if(active){setCourses(data||[]);setLoadingCourses(false);}
    })();
    return()=>{active=false;};
  },[profile]);

  async function submit(e){
    e.preventDefault();
    const fileError=validateMaterial(file);
    const safeTitle=cleanText(title,160);
    if(fileError||!isUuid(courseId)||!courses.some(course=>course.id===courseId)||safeTitle.length<3){
      setMessage(fileError||'تحقق من المقرر والعنوان.');
      return;
    }
    setBusy(true);
    setMessage('');
    const path=`${courseId}/${crypto.randomUUID()}`;
    try{
      const db=await getSupabase();
      if(!db)throw new Error('not-configured');
      const {error:uploadError}=await db.storage.from('course-materials').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
      if(uploadError){setMessage('فشل رفع الملف.');return;}
      const {error}=await db.from('materials').insert({course_id:courseId,title:safeTitle,file_path:path,file_name:cleanText(file.name,180),mime_type:file.type,size_bytes:file.size,uploaded_by:profile.id,status:'published'});
      if(error){
        await db.storage.from('course-materials').remove([path]);
        setMessage('فشل حفظ بيانات الملف.');
      }else{
        setMessage('تم رفع المادة ونشرها بنجاح.');
        setFile(null);
        setTitle('');
        setFileKey(value=>value+1);
      }
    }catch{
      setMessage('تعذر الاتصال بالخدمة. حاول لاحقًا.');
    }finally{
      setBusy(false);
    }
  }

  return <div className="contentBlock narrow"><div className="blockHead"><div><h1>رفع مادة علمية</h1><p>الحد الأقصى 25MB للملف.</p></div></div><form className="uploadForm" onSubmit={submit}><label>المقرر<select value={courseId} onChange={e=>setCourseId(e.target.value)} disabled={loadingCourses||busy} required><option value="">{loadingCourses?'جاري تحميل المقررات…':'اختر المقرر'}</option>{courses.map(course=><option key={course.id} value={course.id}>{course.code} — {course.title}</option>)}</select></label><label>عنوان المادة<input value={title} onChange={e=>setTitle(e.target.value)} maxLength="160" disabled={busy} required/></label><label className="drop"><Icon name="upload"/><strong>{file?file.name:'اختر ملفًا للرفع'}</strong><span>PDF أو PowerPoint أو Word</span><input key={fileKey} type="file" accept=".pdf,.ppt,.pptx,.doc,.docx" onChange={e=>setFile(e.target.files[0]||null)} disabled={busy} required/></label>{message&&<p role="status">{message}</p>}<button disabled={busy||loadingCourses||!courses.length}>{busy?'جاري الرفع…':'رفع ونشر'}</button></form></div>;
}
