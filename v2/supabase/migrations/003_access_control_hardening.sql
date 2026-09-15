-- Security pass 3: reject malformed storage paths and separate submission privileges.
begin;

create or replace function public.try_uuid(value text)
returns uuid
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;
revoke all on function public.try_uuid(text) from public;
grant execute on function public.try_uuid(text) to authenticated;

-- Every storage write must use <assigned-course-uuid>/<random-object-id>.
drop policy if exists "assigned staff upload course files" on storage.objects;
drop policy if exists "assigned staff update course files" on storage.objects;
drop policy if exists "assigned staff delete course files" on storage.objects;
create policy "assigned staff upload course files" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'course-materials'
  and public.try_uuid((storage.foldername(name))[1]) is not null
  and public.teaches_course(public.try_uuid((storage.foldername(name))[1]))
);
create policy "assigned staff update course files" on storage.objects
for update to authenticated
using (
  bucket_id = 'course-materials'
  and public.try_uuid((storage.foldername(name))[1]) is not null
  and public.teaches_course(public.try_uuid((storage.foldername(name))[1]))
)
with check (
  bucket_id = 'course-materials'
  and public.try_uuid((storage.foldername(name))[1]) is not null
  and public.teaches_course(public.try_uuid((storage.foldername(name))[1]))
);
create policy "assigned staff delete course files" on storage.objects
for delete to authenticated
using (
  bucket_id = 'course-materials'
  and public.try_uuid((storage.foldername(name))[1]) is not null
  and public.teaches_course(public.try_uuid((storage.foldername(name))[1]))
);

-- Revoked or inactive enrollments must not retain academic-content access.
drop policy if exists "students read enrolled courses" on public.courses;
create policy "students read enrolled courses" on public.courses
for select to authenticated
using (
  public.current_role() = 'admin'
  or public.teaches_course(id)
  or exists (
    select 1 from public.enrollments e
    where e.course_id = id and e.student_id = auth.uid() and e.status = 'active'
  )
);

drop policy if exists "read published materials" on public.materials;
create policy "read published materials" on public.materials
for select to authenticated
using (
  public.teaches_course(course_id)
  or (
    status = 'published'
    and exists (
      select 1 from public.enrollments e
      where e.course_id = materials.course_id and e.student_id = auth.uid() and e.status = 'active'
    )
  )
);

drop policy if exists "read relevant assignments" on public.assignments;
create policy "read relevant assignments" on public.assignments
for select to authenticated
using (
  public.teaches_course(course_id)
  or exists (
    select 1 from public.enrollments e
    where e.course_id = assignments.course_id and e.student_id = auth.uid() and e.status = 'active'
  )
);

drop policy if exists "enrolled users read course files" on storage.objects;
create policy "enrolled users read course files" on storage.objects
for select to authenticated
using (
  bucket_id = 'course-materials'
  and exists (
    select 1 from public.materials m
    where m.file_path = name
      and (
        public.teaches_course(m.course_id)
        or (
          m.status = 'published'
          and exists (
            select 1 from public.enrollments e
            where e.course_id = m.course_id and e.student_id = auth.uid() and e.status = 'active'
          )
        )
      )
  )
);

-- Students can submit work, but cannot write grade, feedback, or grader identity.
drop policy if exists "students manage own submissions" on public.submissions;
create policy "read relevant submissions" on public.submissions
for select to authenticated
using (
  student_id = auth.uid()
  or public.teaches_course((select a.course_id from public.assignments a where a.id = assignment_id))
);
create policy "students create own submissions" on public.submissions
for insert to authenticated
with check (
  student_id = auth.uid()
  and grade is null and feedback is null and graded_by is null
  and exists (
    select 1
    from public.assignments a
    join public.enrollments e on e.course_id = a.course_id
    where a.id = assignment_id and e.student_id = auth.uid() and e.status = 'active'
  )
);
create policy "students edit ungraded submissions" on public.submissions
for update to authenticated
using (student_id = auth.uid() and grade is null and graded_by is null)
with check (
  student_id = auth.uid()
  and grade is null and feedback is null and graded_by is null
  and exists (
    select 1
    from public.assignments a
    join public.enrollments e on e.course_id = a.course_id
    where a.id = assignment_id and e.student_id = auth.uid() and e.status = 'active'
  )
);
create policy "staff grade submissions" on public.submissions
for update to authenticated
using (public.teaches_course((select a.course_id from public.assignments a where a.id = assignment_id)))
with check (public.teaches_course((select a.course_id from public.assignments a where a.id = assignment_id)));
create policy "admins delete submissions" on public.submissions
for delete to authenticated
using (public.current_role() = 'admin');

alter table public.submissions
  drop constraint if exists submissions_grade_nonnegative,
  add constraint submissions_grade_nonnegative check (grade is null or grade >= 0);

commit;
