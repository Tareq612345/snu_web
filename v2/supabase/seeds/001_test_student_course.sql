begin;

insert into public.colleges(name_ar,name_en,code)
values('كلية الحاسبات والمعلومات','Faculty of Computers and Information','TEST-CI')
on conflict(code) do update set name_ar=excluded.name_ar,name_en=excluded.name_en;

insert into public.departments(college_id,name_ar,name_en,code)
select id,'علوم الحاسب','Computer Science','TEST-CS'
from public.colleges where code='TEST-CI'
on conflict(code) do update set college_id=excluded.college_id,name_ar=excluded.name_ar,name_en=excluded.name_en;

insert into public.profiles(id,full_name,university_id,role,college_id,department_id,current_level,is_active)
select u.id,'طالب تجريبي','STU-TEST-001','student',c.id,d.id,1,true
from auth.users u
join public.colleges c on c.code='TEST-CI'
join public.departments d on d.code='TEST-CS'
where lower(u.email)=lower('student.test@snu.edu.eg')
on conflict(id) do update set
  full_name=excluded.full_name,
  university_id=excluded.university_id,
  role='student',
  college_id=excluded.college_id,
  department_id=excluded.department_id,
  current_level=1,
  is_active=true;

insert into public.courses(department_id,code,title,description,term,academic_year,academic_level,semester,is_published,created_by)
select d.id,'CS101','مقدمة في علوم الحاسب','مقرر تجريبي لمراجعة بوابة الطالب','الفصل الأول','2026/2027',1,1,true,a.id
from public.departments d
cross join lateral (select id from public.profiles where role='admin' and is_active order by created_at limit 1) a
where d.code='TEST-CS'
on conflict(code,term,academic_year) do update set
  department_id=excluded.department_id,
  title=excluded.title,
  description=excluded.description,
  academic_level=1,
  semester=1,
  is_published=true;

insert into public.enrollments(course_id,student_id,status,level_at_enrollment)
select c.id,p.id,'active',1
from public.courses c
join public.profiles p on p.university_id='STU-TEST-001'
where c.code='CS101' and c.term='الفصل الأول' and c.academic_year='2026/2027'
on conflict(course_id,student_id) do update set status='active',level_at_enrollment=1;

commit;

select p.full_name,p.university_id,p.role,p.current_level,c.code,c.title,c.academic_level,c.semester,e.status
from public.enrollments e
join public.profiles p on p.id=e.student_id
join public.courses c on c.id=e.course_id
where p.university_id='STU-TEST-001';
