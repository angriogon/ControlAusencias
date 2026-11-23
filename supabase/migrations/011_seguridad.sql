-- =====================================================================
-- Seguridad y rendimiento (v1.11)
--  1) Las altas nuevas entran como «lector» (solo consulta). El administrador
--     les sube el rol en Ajustes → Usuarios. El primer usuario sigue siendo admin.
--  2) Las funciones auxiliares (rol, nombre, modo admin) pasan a un esquema
--     privado que no se publica en la API. Las de «public» quedan como
--     envoltorios SECURITY INVOKER (las usan las políticas y funciones existentes).
--  3) Índice en entries(code) (aviso de rendimiento de Supabase).
--  4) mark_export(): anota cuándo se exportó por última vez (aviso de copia fuera de la app).
-- =====================================================================

-- 1) Altas como lector
alter table public.profiles alter column role set default 'lector';

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          case when exists (select 1 from public.profiles where role = 'admin') then 'lector' else 'admin' end)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2) Funciones auxiliares en un esquema privado (no expuesto por la API)
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'lector')
$$;

create or replace function private.my_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from public.profiles where id = auth.uid()),
                  auth.jwt()->>'email', 'sistema')
$$;

create or replace function private.is_admin_mode() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select admin_until > now() from public.profiles where id = auth.uid()), false)
$$;

revoke execute on function private.my_role(), private.my_name(), private.is_admin_mode() from public, anon;
grant execute on function private.my_role(), private.my_name(), private.is_admin_mode() to authenticated;

create or replace function public.my_role() returns text
language sql stable security invoker set search_path = public as $$ select private.my_role() $$;
create or replace function public.my_name() returns text
language sql stable security invoker set search_path = public as $$ select private.my_name() $$;
create or replace function public.is_admin_mode() returns boolean
language sql stable security invoker set search_path = public as $$ select private.is_admin_mode() $$;

revoke execute on function public.my_role(), public.my_name(), public.is_admin_mode() from public, anon;
grant execute on function public.my_role(), public.my_name(), public.is_admin_mode() to authenticated;

-- 3) Índice para la clave de cada marca
create index if not exists entries_code_idx on public.entries (code);

-- 4) Última exportación a Excel (para el recordatorio de copia fuera de la app)
create or replace function public.mark_export() returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('admin', 'editor') then return; end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('ultima_exportacion', to_jsonb(now()), now(), public.my_name())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end $$;
revoke execute on function public.mark_export() from public, anon;
grant execute on function public.mark_export() to authenticated;
