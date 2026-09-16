begin;

alter table public.materials add column if not exists section_type text not null default 'general';
alter table public.materials drop constraint if exists materials_section_type_allowed;
alter table public.materials add constraint materials_section_type_allowed check(section_type in ('theory','practical','general'));
create index if not exists materials_course_section_created_idx on public.materials(course_id,section_type,created_at desc);

create or replace function public.notify_course_members(p_course_id uuid,p_title text,p_body text,p_link text)
returns void language sql security definer set search_path=public,pg_catalog as $$
  insert into public.notifications(user_id,title,body,link)
  select distinct p.id,left(p_title,160),left(p_body,500),p_link
  from public.profiles p
  where p.is_active and (
    p.role='admin'
    or exists(select 1 from public.enrollments e where e.course_id=p_course_id and e.student_id=p.id and e.status='active')
    or exists(select 1 from public.course_staff cs where cs.course_id=p_course_id and cs.profile_id=p.id)
  );
$$;
revoke all on function public.notify_course_members(uuid,text,text,text) from public,anon,authenticated;

create or replace function public.notify_material_created() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$begin
  perform public.notify_course_members(new.course_id,'مادة علمية جديدة',new.title||' — '||case new.section_type when 'theory' then 'نظري' when 'practical' then 'عملي' else 'عام' end,'/materials');return new;
end$$;
create or replace function public.notify_assignment_created() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$begin
  perform public.notify_course_members(new.course_id,'واجب جديد',new.title,'/assignments');return new;
end$$;
create or replace function public.notify_quiz_created() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$begin
  if new.is_published then perform public.notify_course_members(new.course_id,'اختبار جديد',new.title,'/quizzes');end if;return new;
end$$;
revoke all on function public.notify_material_created(),public.notify_assignment_created(),public.notify_quiz_created() from public,anon,authenticated;
drop trigger if exists notify_material_created on public.materials;create trigger notify_material_created after insert on public.materials for each row when(new.status='published') execute function public.notify_material_created();
drop trigger if exists notify_assignment_created on public.assignments;create trigger notify_assignment_created after insert on public.assignments for each row execute function public.notify_assignment_created();
drop trigger if exists notify_quiz_created on public.quizzes;create trigger notify_quiz_created after insert on public.quizzes for each row execute function public.notify_quiz_created();

do $$begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end$$;

commit;
