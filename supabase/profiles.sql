-- =============================================================================
-- StudyHub — profiles table, roles, RLS и вспомогательные функции
-- =============================================================================
--
-- КАК ЗАПУСТИТЬ:
--   1. Откройте Supabase Dashboard → SQL Editor
--   2. Вставьте содержимое этого файла целиком и нажмите Run
--   3. Убедитесь, что выполнение прошло без ошибок
--   4. Первому администратору вручную поставьте role = 'admin' в таблице
--      profiles через Dashboard → Table Editor → profiles
--
-- ЗАВИСИМОСТИ:
--   Таблицы subjects и tasks из schema.sql должны уже существовать.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Таблица profiles
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id          uuid        primary key references auth.users on delete cascade,
  role        text        not null default 'student'
                          check (role in ('student', 'admin')),
  full_name   text,
  created_at  timestamptz not null default now()
);

comment on table  public.profiles is 'Профили пользователей и их роли';
comment on column public.profiles.role is 'student | admin';

-- Быстрый поиск по роли (для is_admin())
create index if not exists idx_profiles_id_role on public.profiles (id, role);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;

-- Вспомогательная функция: SECURITY DEFINER чтобы не было рекурсии RLS
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Пользователь видит только свой профиль; админ — все
drop policy if exists "profiles: select own"  on public.profiles;
drop policy if exists "profiles: select admin" on public.profiles;

create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: select admin" on public.profiles
  for select using (public.is_admin());

-- Пользователь может обновить своё имя (но не роль)
drop policy if exists "profiles: update own" on public.profiles;

create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- INSERT только через триггер (service role), обычным пользователям запрещён
-- (политика не нужна — без явного INSERT-policy вставка отклоняется)


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Триггер: автосоздание профиля при регистрации
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'student',
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;   -- идемпотентно
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC-функции для панели администратора
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a. Статистика по всем пользователям (только для admin)
create or replace function public.get_user_stats_for_admin()
returns table (
  user_id       uuid,
  email         text,
  role          text,
  full_name     text,
  created_at    timestamptz,
  subject_count bigint,
  task_count    bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Access denied: admin only';
  end if;

  return query
    select
      p.id                                                                    as user_id,
      u.email::text,
      p.role,
      p.full_name,
      p.created_at,
      (select count(*) from public.subjects s
         where s.user_id = p.id and not s.is_deleted)::bigint               as subject_count,
      (select count(*) from public.tasks    t
         where t.user_id = p.id and not t.is_deleted)::bigint               as task_count
    from public.profiles p
    join auth.users       u on u.id = p.id
    order by p.created_at desc;
end;
$$;

-- 4b. Изменить роль пользователя (только для admin, нельзя снять права с себя)
create or replace function public.set_user_role(
  target_user_id uuid,
  new_role        text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Access denied: admin only';
  end if;

  if new_role not in ('student', 'admin') then
    raise exception 'Invalid role: %', new_role;
  end if;

  -- Защита от случайного самоудаления последнего admin
  if new_role = 'student' and target_user_id = auth.uid() then
    raise exception 'Нельзя снять права администратора у самого себя';
  end if;

  update public.profiles
    set role = new_role
  where id = target_user_id;

  if not found then
    raise exception 'User not found: %', target_user_id;
  end if;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Бэкфилл: создать profiles для уже зарегистрированных пользователей
-- ─────────────────────────────────────────────────────────────────────────────
-- Выполняется один раз. Для существующих пользователей без профиля
-- создаёт запись с ролью 'student'.

insert into public.profiles (id, role)
  select id, 'student'
  from auth.users
  where id not in (select id from public.profiles)
on conflict (id) do nothing;
