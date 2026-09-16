begin;

create table if not exists public.platform_owners(
  user_id uuid primary key references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.platform_owners enable row level security;
insert into public.platform_owners(user_id)
select p.id from public.profiles p join auth.users u on u.id=p.id
where lower(u.email)=lower('tareq612345@gmail.com')
on conflict(user_id) do nothing;

create or replace function public.is_platform_owner(check_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_catalog as $$
  select exists(select 1 from public.platform_owners where user_id=check_user)
$$;
revoke all on function public.is_platform_owner(uuid) from public,anon;
grant execute on function public.is_platform_owner(uuid) to authenticated;
create policy "admins read platform owners" on public.platform_owners for select to authenticated using(public.current_role()='admin');
grant select on public.platform_owners to authenticated;

create or replace function public.guard_privileged_profile_changes()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare actor_owner boolean; target_owner boolean; actor_role public.user_role;
begin
  actor_owner=public.is_platform_owner(auth.uid());
  target_owner=public.is_platform_owner(old.id);
  actor_role=public.current_role();
  if actor_role is distinct from 'admin' then raise exception 'Admin access required';end if;
  if target_owner and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then raise exception 'Platform owner account is protected';end if;
  if old.id=auth.uid() and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then raise exception 'Administrators cannot change their own access';end if;
  if not actor_owner and (old.role='admin' or new.role='admin') then raise exception 'Only the platform owner can manage administrators';end if;
  return new;
end$$;
revoke all on function public.guard_privileged_profile_changes() from public,anon,authenticated;
drop trigger if exists guard_privileged_profile_changes on public.profiles;
create trigger guard_privileged_profile_changes before update of role,is_active on public.profiles for each row execute function public.guard_privileged_profile_changes();

commit;
