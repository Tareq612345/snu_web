begin;

-- Require a valid course UUID folder for every material mutation, including admins.
drop policy if exists "assigned staff update course files" on storage.objects;
drop policy if exists "assigned staff delete course files" on storage.objects;
create policy "assigned staff update course files" on storage.objects for update to authenticated
using(
  bucket_id='course-materials'
  and array_length(storage.foldername(name),1)=1
  and public.try_uuid((storage.foldername(name))[1]) is not null
  and public.try_uuid(storage.filename(name)) is not null
  and public.teaches_course(public.try_uuid((storage.foldername(name))[1]))
)
with check(
  bucket_id='course-materials'
  and array_length(storage.foldername(name),1)=1
  and public.try_uuid((storage.foldername(name))[1]) is not null
  and public.try_uuid(storage.filename(name)) is not null
  and public.teaches_course(public.try_uuid((storage.foldername(name))[1]))
);
create policy "assigned staff delete course files" on storage.objects for delete to authenticated
using(
  bucket_id='course-materials'
  and array_length(storage.foldername(name),1)=1
  and public.try_uuid((storage.foldername(name))[1]) is not null
  and public.try_uuid(storage.filename(name)) is not null
  and public.teaches_course(public.try_uuid((storage.foldername(name))[1]))
);

-- Avatar access is active-account-only and paths are exactly <own-uuid>/avatar.<allowed-extension>.
drop policy if exists "authenticated read avatars" on storage.objects;
drop policy if exists "users read allowed avatars" on storage.objects;
drop policy if exists "users upload own avatar" on storage.objects;
drop policy if exists "users update own avatar" on storage.objects;
drop policy if exists "users delete own avatar" on storage.objects;

create policy "users read allowed avatars" on storage.objects for select to authenticated
using(
  bucket_id='profile-avatars'
  and public.is_active_user()
  and array_length(storage.foldername(name),1)=1
  and storage.filename(name) ~ '^avatar[.](jpg|png|webp)$'
  and (public.try_uuid((storage.foldername(name))[1])=auth.uid() or public.current_role()='admin')
);
create policy "users upload own avatar" on storage.objects for insert to authenticated
with check(
  bucket_id='profile-avatars'
  and public.is_active_user()
  and array_length(storage.foldername(name),1)=1
  and public.try_uuid((storage.foldername(name))[1])=auth.uid()
  and storage.filename(name) ~ '^avatar[.](jpg|png|webp)$'
);
create policy "users update own avatar" on storage.objects for update to authenticated
using(
  bucket_id='profile-avatars'
  and public.is_active_user()
  and array_length(storage.foldername(name),1)=1
  and public.try_uuid((storage.foldername(name))[1])=auth.uid()
  and storage.filename(name) ~ '^avatar[.](jpg|png|webp)$'
)
with check(
  bucket_id='profile-avatars'
  and public.is_active_user()
  and array_length(storage.foldername(name),1)=1
  and public.try_uuid((storage.foldername(name))[1])=auth.uid()
  and storage.filename(name) ~ '^avatar[.](jpg|png|webp)$'
);
create policy "users delete own avatar" on storage.objects for delete to authenticated
using(
  bucket_id='profile-avatars'
  and public.is_active_user()
  and array_length(storage.foldername(name),1)=1
  and public.try_uuid((storage.foldername(name))[1])=auth.uid()
  and storage.filename(name) ~ '^avatar[.](jpg|png|webp)$'
);

commit;
