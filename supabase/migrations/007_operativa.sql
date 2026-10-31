-- =====================================================================
-- Operativa: ajustes compartidos (zonas, equipos de campo) y gestión de
-- roles de usuario desde la app.
-- * app_settings: clave → JSON. Se lee por todos; se cambia solo en modo admin.
-- * set_user_role: un usuario con rol admin (y modo admin activo) cambia el
--   rol de otro. No se puede dejar la app sin ningún admin.
-- Ambos cambios quedan anotados en el historial.
-- =====================================================================
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
alter table public.app_settings enable row level security;
drop policy if exists s_read on public.app_settings;
create policy s_read on public.app_settings for select to authenticated using (true);
revoke insert, update, delete, truncate on public.app_settings from anon, authenticated;

create or replace function public.save_setting(p_key text, p_value jsonb, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_mode() then
    raise exception 'ADMIN_REQUIRED:Cambiar los ajustes de operativa requiere el modo administrador.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), public.my_name())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  insert into public.change_log (user_id, user_name, entity, action, batch_id, batch_label)
  values (auth.uid(), public.my_name(), 'system', 'update', gen_random_uuid(), coalesce(p_label, 'Ajustes'));
end $$;

create or replace function public.set_user_role(p_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_old text; v_name text;
begin
  if public.my_role() <> 'admin' or not public.is_admin_mode() then
    raise exception 'ADMIN_REQUIRED:Cambiar roles requiere un usuario administrador con el modo administrador activo.';
  end if;
  if p_role not in ('admin', 'editor', 'lector') then raise exception 'Rol no válido'; end if;
  select role, coalesce(display_name, email) into v_old, v_name from public.profiles where id = p_id;
  if v_old is null then raise exception 'Usuario no encontrado'; end if;
  if v_old = 'admin' and p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'Tiene que quedar al menos un administrador';
  end if;
  update public.profiles set role = p_role, admin_until = case when p_role = 'lector' then null else admin_until end
   where id = p_id;
  insert into public.change_log (user_id, user_name, entity, action, batch_id, batch_label)
  values (auth.uid(), public.my_name(), 'system', 'update', gen_random_uuid(),
          format('Rol de %s: %s → %s', v_name, v_old, p_role));
end $$;

revoke execute on function public.save_setting(text, jsonb, text) from public, anon;
grant execute on function public.save_setting(text, jsonb, text) to authenticated;
revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.app_settings; exception when duplicate_object then null; end;
end $$;
