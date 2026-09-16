begin;

-- Inactive or unprovisioned identities must never inherit academic access.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.profiles where id=auth.uid() and is_active)
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path=public
as $$
  select role from public.profiles where id=auth.uid() and is_active
$$;

create or replace function public.teaches_course(course uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.current_role()='admin'
    or (
      public.is_active_user()
      and exists(select 1 from public.course_staff where course_id=course and profile_id=auth.uid())
    )
$$;

revoke all on function public.is_active_user() from public,anon;
revoke all on function public.current_role() from public,anon;
revoke all on function public.teaches_course(uuid) from public,anon;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.teaches_course(uuid) to authenticated;

-- Read access is denied immediately when a profile is disabled.
drop policy if exists "authenticated reads structure" on public.colleges;
create policy "active users read structure" on public.colleges for select to authenticated using(public.is_active_user());
drop policy if exists "authenticated reads departments" on public.departments;
create policy "active users read departments" on public.departments for select to authenticated using(public.is_active_user());

drop policy if exists "profile reads self" on public.profiles;
create policy "profile reads self" on public.profiles for select to authenticated
using((id=auth.uid() and is_active) or public.current_role()='admin');

drop policy if exists "students read enrolled courses" on public.courses;
create policy "students read enrolled courses" on public.courses for select to authenticated
using(public.is_active_user() and (
  public.current_role()='admin' or public.teaches_course(id)
  or exists(select 1 from public.enrollments e where e.course_id=id and e.student_id=auth.uid() and e.status='active')
));

drop policy if exists "read own course staff" on public.course_staff;
create policy "read own course staff" on public.course_staff for select to authenticated
using(public.is_active_user() and (profile_id=auth.uid() or public.current_role()='admin'));

drop policy if exists "read relevant enrollments" on public.enrollments;
create policy "read relevant enrollments" on public.enrollments for select to authenticated
using(public.is_active_user() and (student_id=auth.uid() or public.teaches_course(course_id)));

drop policy if exists "read published materials" on public.materials;
create policy "read published materials" on public.materials for select to authenticated
using(public.is_active_user() and (
  public.teaches_course(course_id)
  or (status='published' and exists(
    select 1 from public.enrollments e
    where e.course_id=materials.course_id and e.student_id=auth.uid() and e.status='active'
  ))
));

drop policy if exists "read relevant announcements" on public.announcements;
create policy "read relevant announcements" on public.announcements for select to authenticated
using(public.is_active_user() and (
  course_id is null or public.teaches_course(course_id)
  or exists(select 1 from public.enrollments e where e.course_id=announcements.course_id and e.student_id=auth.uid() and e.status='active')
));

drop policy if exists "read relevant assignments" on public.assignments;
create policy "read relevant assignments" on public.assignments for select to authenticated
using(public.is_active_user() and (
  public.teaches_course(course_id)
  or exists(select 1 from public.enrollments e where e.course_id=assignments.course_id and e.student_id=auth.uid() and e.status='active')
));

drop policy if exists "read relevant submissions" on public.submissions;
create policy "read relevant submissions" on public.submissions for select to authenticated
using(public.is_active_user() and (
  student_id=auth.uid()
  or public.teaches_course((select a.course_id from public.assignments a where a.id=assignment_id))
));

-- Only admins manage official roster and teaching assignments.
drop policy if exists "admins manage course staff" on public.course_staff;
create policy "admins manage course staff" on public.course_staff for all to authenticated
using(public.current_role()='admin') with check(public.current_role()='admin');
drop policy if exists "admins manage enrollments" on public.enrollments;
create policy "admins manage enrollments" on public.enrollments for all to authenticated
using(public.current_role()='admin') with check(public.current_role()='admin');

alter table public.enrollments drop constraint if exists enrollments_status_allowed;
alter table public.enrollments add constraint enrollments_status_allowed check(status in ('active','suspended','dropped'));

-- A comment cannot be reassigned to another author or material after creation.
create or replace function public.guard_comment_update()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
begin
  if new.author_id is distinct from old.author_id or new.material_id is distinct from old.material_id then
    raise exception 'Comment ownership and material are immutable';
  end if;
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function public.guard_comment_update() from public,anon,authenticated;
drop trigger if exists guard_comment_update on public.material_comments;
create trigger guard_comment_update before update on public.material_comments
for each row execute function public.guard_comment_update();

drop policy if exists "read comments for visible materials" on public.material_comments;
create policy "read comments for visible materials" on public.material_comments for select to authenticated
using(public.is_active_user() and exists(select 1 from public.materials m where m.id=material_id));
drop policy if exists "create comments for visible materials" on public.material_comments;
create policy "create comments for visible materials" on public.material_comments for insert to authenticated
with check(public.is_active_user() and author_id=auth.uid() and exists(select 1 from public.materials m where m.id=material_id));
drop policy if exists "authors update comments" on public.material_comments;
create policy "authors update comments" on public.material_comments for update to authenticated
using(public.is_active_user() and author_id=auth.uid()) with check(public.is_active_user() and author_id=auth.uid());
drop policy if exists "authors or admins delete comments" on public.material_comments;
create policy "authors or admins delete comments" on public.material_comments for delete to authenticated
using(public.is_active_user() and (author_id=auth.uid() or public.current_role()='admin'));

-- Submission identity is immutable. Students edit content only; faculty grade only.
create or replace function public.guard_submission_update()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare actor public.user_role;
begin
  actor=public.current_role();
  if actor='student' then
    if new.assignment_id is distinct from old.assignment_id
      or new.student_id is distinct from old.student_id
      or new.grade is distinct from old.grade
      or new.feedback is distinct from old.feedback
      or new.graded_by is distinct from old.graded_by then
      raise exception 'Students cannot change submission identity or grading fields';
    end if;
    new.submitted_at=now();
  elsif actor='faculty' then
    if new.assignment_id is distinct from old.assignment_id
      or new.student_id is distinct from old.student_id
      or new.file_path is distinct from old.file_path
      or new.notes is distinct from old.notes
      or new.submitted_at is distinct from old.submitted_at then
      raise exception 'Faculty can update grading fields only';
    end if;
    if new.grade is distinct from old.grade or new.feedback is distinct from old.feedback then
      new.graded_by=auth.uid();
    end if;
  elsif actor is distinct from 'admin' then
    raise exception 'Inactive account';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_submission_update() from public,anon,authenticated;
drop trigger if exists guard_submission_update on public.submissions;
create trigger guard_submission_update before update on public.submissions
for each row execute function public.guard_submission_update();

-- Material metadata and Storage object must always reference the same course.
create or replace function public.guard_material_path()
returns trigger
language plpgsql
security definer
set search_path=public,storage,pg_catalog
as $$
declare folders text[];
begin
  folders=storage.foldername(new.file_path);
  if coalesce(array_length(folders,1),0)<>1
    or public.try_uuid(folders[1]) is distinct from new.course_id
    or public.try_uuid(storage.filename(new.file_path)) is null then
    raise exception 'Invalid material storage path';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_material_path() from public,anon,authenticated;
drop trigger if exists guard_material_path on public.materials;
create trigger guard_material_path before insert or update of course_id,file_path on public.materials
for each row execute function public.guard_material_path();

-- Storage paths must contain exactly one course folder and a UUID object name.
drop policy if exists "assigned staff upload course files" on storage.objects;
drop policy if exists "assigned staff update course files" on storage.objects;
drop policy if exists "assigned staff delete course files" on storage.objects;
create policy "assigned staff upload course files" on storage.objects for insert to authenticated with check(
  bucket_id='course-materials'
  and array_length(storage.foldername(name),1)=1
  and public.try_uuid((storage.foldername(name))[1]) is not null
  and public.try_uuid(storage.filename(name)) is not null
  and public.teaches_course(public.try_uuid((storage.foldername(name))[1]))
);
create policy "assigned staff update course files" on storage.objects for update to authenticated
using(bucket_id='course-materials' and array_length(storage.foldername(name),1)=1 and public.try_uuid(storage.filename(name)) is not null and public.teaches_course(public.try_uuid((storage.foldername(name))[1])))
with check(bucket_id='course-materials' and array_length(storage.foldername(name),1)=1 and public.try_uuid(storage.filename(name)) is not null and public.teaches_course(public.try_uuid((storage.foldername(name))[1])));
create policy "assigned staff delete course files" on storage.objects for delete to authenticated
using(bucket_id='course-materials' and array_length(storage.foldername(name),1)=1 and public.try_uuid(storage.filename(name)) is not null and public.teaches_course(public.try_uuid((storage.foldername(name))[1])));

drop policy if exists "enrolled users read course files" on storage.objects;
create policy "enrolled users read course files" on storage.objects for select to authenticated
using(bucket_id='course-materials' and public.is_active_user() and exists(
  select 1 from public.materials m where m.file_path=name and (
    public.teaches_course(m.course_id)
    or (m.status='published' and exists(
      select 1 from public.enrollments e where e.course_id=m.course_id and e.student_id=auth.uid() and e.status='active'
    ))
  )
));

alter table public.profiles drop constraint if exists profiles_avatar_path_owner;
alter table public.profiles add constraint profiles_avatar_path_owner check(
  avatar_path is null or avatar_path ~ ('^'||id::text||'/avatar[.](jpg|png|webp)$')
);
drop policy if exists "authenticated read avatars" on storage.objects;
create policy "users read allowed avatars" on storage.objects for select to authenticated
using(bucket_id='profile-avatars' and public.is_active_user() and (
  public.try_uuid((storage.foldername(name))[1])=auth.uid() or public.current_role()='admin'
));

commit;
