begin;

create or replace function public.get_admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'Admin access required';
  end if;
  return jsonb_build_object(
    'users',(select count(*) from public.profiles),
    'students',(select count(*) from public.profiles where role='student' and is_active),
    'faculty',(select count(*) from public.profiles where role='faculty' and is_active),
    'admins',(select count(*) from public.profiles where role='admin' and is_active),
    'courses',(select count(*) from public.courses),
    'materials',(select count(*) from public.materials where status='published'),
    'assignments',(select count(*) from public.assignments),
    'quizzes',(select count(*) from public.quizzes),
    'open_support',(select count(*) from public.support_threads where status<>'closed')
  );
end;
$$;

revoke all on function public.get_admin_dashboard_summary() from public,anon;
grant execute on function public.get_admin_dashboard_summary() to authenticated;

commit;
