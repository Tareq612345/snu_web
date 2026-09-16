begin;

grant select,insert,update,delete on public.enrollments,public.course_staff to authenticated;

-- Modern Office formats for assignment submissions.
update storage.buckets set allowed_mime_types=array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip','image/jpeg','image/png'] where id='assignment-submissions';

create table public.notifications(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications(user_id,created_at desc);
alter table public.notifications enable row level security;
create policy "users read own notifications" on public.notifications for select to authenticated using(user_id=auth.uid());
create policy "users mark own notifications" on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,update on public.notifications to authenticated;

create or replace function public.notify_announcement()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  insert into public.notifications(user_id,title,body,link)
  select distinct p.id,new.title,left(new.body,500),'/announcements'
  from public.profiles p
  where p.is_active and (
    new.course_id is null
    or exists(select 1 from public.enrollments e where e.course_id=new.course_id and e.student_id=p.id and e.status='active')
    or exists(select 1 from public.course_staff cs where cs.course_id=new.course_id and cs.profile_id=p.id)
    or p.role='admin'
  );
  return new;
end$$;
revoke all on function public.notify_announcement() from public,anon,authenticated;
drop trigger if exists notify_announcement on public.announcements;
create trigger notify_announcement after insert on public.announcements for each row execute function public.notify_announcement();

commit;
