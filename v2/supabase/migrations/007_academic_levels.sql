begin;

alter table public.profiles
  add column if not exists current_level smallint;
alter table public.profiles
  drop constraint if exists profiles_current_level_range;
alter table public.profiles
  add constraint profiles_current_level_range check(current_level is null or current_level between 1 and 6);

alter table public.courses
  add column if not exists academic_level smallint,
  add column if not exists semester smallint;
alter table public.courses
  drop constraint if exists courses_academic_level_range,
  add constraint courses_academic_level_range check(academic_level is null or academic_level between 1 and 6),
  drop constraint if exists courses_semester_range,
  add constraint courses_semester_range check(semester is null or semester between 1 and 3);

alter table public.enrollments
  add column if not exists level_at_enrollment smallint;
alter table public.enrollments
  drop constraint if exists enrollments_level_range;
alter table public.enrollments
  add constraint enrollments_level_range check(level_at_enrollment is null or level_at_enrollment between 1 and 6);

create index if not exists courses_department_level_semester_idx
on public.courses(department_id,academic_level,semester,academic_year);

commit;
