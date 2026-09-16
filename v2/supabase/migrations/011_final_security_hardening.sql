begin;

-- Users may only acknowledge their own notifications, never rewrite their content.
revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;

-- Submission objects are immutable and must reference a real, open assignment
-- in a course where the uploader has an active enrollment.
drop policy if exists "students upload own submissions" on storage.objects;
drop policy if exists "students update own submissions" on storage.objects;
create policy "students upload valid submissions" on storage.objects
for insert to authenticated
with check(
  bucket_id='assignment-submissions'
  and public.is_active_user()
  and array_length(storage.foldername(name),1)=2
  and public.try_uuid((storage.foldername(name))[1])=auth.uid()
  and public.try_uuid((storage.foldername(name))[2]) is not null
  and public.try_uuid(storage.filename(name)) is not null
  and exists(
    select 1
    from public.assignments a
    join public.enrollments e on e.course_id=a.course_id
    where a.id=public.try_uuid((storage.foldername(name))[2])
      and e.student_id=auth.uid()
      and e.status='active'
      and (a.due_at is null or now()<=a.due_at)
  )
);

-- Support requests remain private between their owner and platform admins.
drop policy if exists "users read own support threads" on public.support_threads;
create policy "owners and admins read support threads" on public.support_threads
for select to authenticated
using(user_id=auth.uid() or public.current_role()='admin');
drop policy if exists "participants read support messages" on public.support_messages;
create policy "owners and admins read support messages" on public.support_messages
for select to authenticated
using(exists(
  select 1 from public.support_threads t
  where t.id=thread_id and (t.user_id=auth.uid() or public.current_role()='admin')
));
drop policy if exists "participants send support messages" on public.support_messages;
create policy "owners and admins send support messages" on public.support_messages
for insert to authenticated
with check(
  sender_id=auth.uid()
  and exists(
    select 1 from public.support_threads t
    where t.id=thread_id and t.status<>'closed'
      and (t.user_id=auth.uid() or public.current_role()='admin')
  )
);

commit;
