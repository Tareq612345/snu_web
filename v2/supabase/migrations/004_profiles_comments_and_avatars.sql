begin;

alter table public.profiles
  add column if not exists phone text,
  add column if not exists location text,
  add column if not exists avatar_path text;

alter table public.profiles
  drop constraint if exists profiles_phone_length,
  add constraint profiles_phone_length check (phone is null or char_length(phone) <= 32),
  drop constraint if exists profiles_location_length,
  add constraint profiles_location_length check (location is null or char_length(location) <= 180),
  drop constraint if exists profiles_avatar_path_length,
  add constraint profiles_avatar_path_length check (avatar_path is null or char_length(avatar_path) <= 300);

grant update(full_name,phone,location,avatar_path,updated_at) on public.profiles to authenticated;

create table if not exists public.material_comments(
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists material_comments_material_created_idx on public.material_comments(material_id,created_at);
alter table public.material_comments enable row level security;

create policy "read comments for visible materials" on public.material_comments
for select to authenticated
using (exists(select 1 from public.materials m where m.id=material_id));
create policy "create comments for visible materials" on public.material_comments
for insert to authenticated
with check (author_id=auth.uid() and exists(select 1 from public.materials m where m.id=material_id));
create policy "authors update comments" on public.material_comments
for update to authenticated
using (author_id=auth.uid())
with check (author_id=auth.uid());
create policy "authors or admins delete comments" on public.material_comments
for delete to authenticated
using (author_id=auth.uid() or public.current_role()='admin');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-avatars','profile-avatars',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=excluded.allowed_mime_types;

create policy "authenticated read avatars" on storage.objects
for select to authenticated using(bucket_id='profile-avatars');
create policy "users upload own avatar" on storage.objects
for insert to authenticated with check(
  bucket_id='profile-avatars'
  and public.try_uuid((storage.foldername(name))[1])=auth.uid()
);
create policy "users update own avatar" on storage.objects
for update to authenticated
using(bucket_id='profile-avatars' and public.try_uuid((storage.foldername(name))[1])=auth.uid())
with check(bucket_id='profile-avatars' and public.try_uuid((storage.foldername(name))[1])=auth.uid());
create policy "users delete own avatar" on storage.objects
for delete to authenticated
using(bucket_id='profile-avatars' and public.try_uuid((storage.foldername(name))[1])=auth.uid());

commit;
