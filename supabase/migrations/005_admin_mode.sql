-- =====================================================================
-- Modo administrador con contraseña.
-- * Una contraseña compartida (cifrada con bcrypt) desbloquea el modo admin
--   durante 4 horas para el usuario que la introduce.
-- * Requieren modo admin: importar/restaurar, personas, claves y cualquier
--   marcado que afecte a más de 5 personas a la vez.
-- * Las tablas dejan de poder modificarse directamente desde la API: todo
--   pasa por funciones que comprueban permisos (no se puede saltar).
-- =====================================================================
alter table public.profiles add column if not exists admin_until timestamptz;
alter table public.profiles add column if not exists admin_failures int not null default 0;
alter table public.profiles add column if not exists admin_locked_until timestamptz;

create table if not exists public.admin_config (
  id int primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
alter table public.admin_config enable row level security; -- sin políticas: nadie la lee desde la API

create or replace function public.is_admin_mode() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select admin_until > now() from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.admin_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'configured', exists (select 1 from public.admin_config),
    'until', (select case when admin_until > now() then admin_until end from public.profiles where id = auth.uid()),
    'canManage', coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false))
$$;

-- Devuelve la hora de caducidad, o null si la contraseña no es correcta
-- (no se lanza error para que el contador de intentos fallidos se guarde).
create or replace function public.admin_unlock(p_password text) returns timestamptz
language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text; v_prof public.profiles; v_until timestamptz;
begin
  select * into v_prof from public.profiles where id = auth.uid();
  if v_prof.id is null then raise exception 'Sesión no válida'; end if;
  if v_prof.role = 'lector' then raise exception 'Tu usuario es de solo lectura'; end if;
  if v_prof.admin_locked_until > now() then
    raise exception 'Demasiados intentos fallidos. Vuelve a probar a las %',
      to_char(v_prof.admin_locked_until at time zone 'Europe/Madrid', 'HH24:MI');
  end if;
  select password_hash into v_hash from public.admin_config where id = 1;
  if v_hash is null then
    raise exception 'Todavía no hay contraseña de administrador: créala desde Ajustes.';
  end if;
  if crypt(p_password, v_hash) <> v_hash then
    update public.profiles set
      admin_failures = admin_failures + 1,
      admin_locked_until = case when admin_failures + 1 >= 5 then now() + interval '10 minutes' end
    where id = auth.uid();
    return null;
  end if;
  v_until := now() + interval '4 hours';
  update public.profiles set admin_until = v_until, admin_failures = 0, admin_locked_until = null where id = auth.uid();
  return v_until;
end $$;

create or replace function public.admin_lock() returns void
language sql security definer set search_path = public as $$
  update public.profiles set admin_until = null where id = auth.uid();
$$;

-- Crear o cambiar la contraseña: solo usuarios con rol "admin" (en Supabase).
-- Si ya existe, hay que dar la actual.
create or replace function public.set_admin_password(p_current text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text;
begin
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Solo un usuario administrador puede crear o cambiar esta contraseña';
  end if;
  if length(coalesce(p_new, '')) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres';
  end if;
  select password_hash into v_hash from public.admin_config where id = 1;
  if v_hash is not null and crypt(coalesce(p_current, ''), v_hash) <> v_hash then
    raise exception 'La contraseña actual no es correcta';
  end if;
  insert into public.admin_config (id, password_hash, updated_at, updated_by)
  values (1, crypt(p_new, gen_salt('bf')), now(), public.my_name())
  on conflict (id) do update set password_hash = excluded.password_hash,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end $$;

-- ---------- Escrituras: siempre por funciones con permisos ----------
create or replace function public.apply_entries(p_changes jsonb, p_label text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c jsonb; v_batch uuid := gen_random_uuid(); v_people int;
begin
  if public.my_role() not in ('admin', 'editor') then
    raise exception 'No tienes permiso para modificar datos';
  end if;
  select count(distinct x->>'employee_id') into v_people from jsonb_array_elements(p_changes) x;
  if v_people > 5 and not public.is_admin_mode() then
    raise exception 'ADMIN_REQUIRED:Este cambio afecta a % personas. Los cambios a más de 5 personas a la vez requieren el modo administrador.', v_people;
  end if;
  perform set_config('app.batch_id', v_batch::text, true);
  perform set_config('app.batch_label', p_label, true);
  for c in select * from jsonb_array_elements(p_changes) loop
    if c->>'code' is null or c->>'code' = '' then
      delete from public.entries where employee_id = (c->>'employee_id')::uuid and day = (c->>'day')::date;
    else
      insert into public.entries (employee_id, day, code)
      values ((c->>'employee_id')::uuid, (c->>'day')::date, c->>'code')
      on conflict (employee_id, day) do update set code = excluded.code
      where entries.code is distinct from excluded.code;
    end if;
  end loop;
  return v_batch;
end $$;

create or replace function public.apply_notes(p_changes jsonb, p_label text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c jsonb; v_batch uuid := gen_random_uuid();
begin
  if public.my_role() not in ('admin', 'editor') then
    raise exception 'No tienes permiso para modificar datos';
  end if;
  perform set_config('app.batch_id', v_batch::text, true);
  perform set_config('app.batch_label', p_label, true);
  for c in select * from jsonb_array_elements(p_changes) loop
    if coalesce(btrim(c->>'text'), '') = '' then
      delete from public.notes where employee_id = (c->>'employee_id')::uuid and day = (c->>'day')::date;
    else
      insert into public.notes (employee_id, day, text)
      values ((c->>'employee_id')::uuid, (c->>'day')::date, c->>'text')
      on conflict (employee_id, day) do update set text = excluded.text
      where notes.text is distinct from excluded.text;
    end if;
  end loop;
  return v_batch;
end $$;

create or replace function public.save_employee(p_emp jsonb, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_mode() then
    raise exception 'ADMIN_REQUIRED:Gestionar personas requiere el modo administrador.';
  end if;
  perform set_config('app.batch_id', gen_random_uuid()::text, true);
  perform set_config('app.batch_label', p_label, true);
  insert into public.employees
  select * from jsonb_populate_record(null::public.employees, p_emp)
  on conflict (id) do update set
    nombre = excluded.nombre, telefono = excluded.telefono, extension = excluded.extension,
    almacen = excluded.almacen, team_leader = excluded.team_leader, equipo = excluded.equipo,
    zona = excluded.zona, guardias = excluded.guardias, sede = excluded.sede,
    dias_vacaciones = excluded.dias_vacaciones, vp_pendientes = excluded.vp_pendientes,
    dias_lh = excluded.dias_lh, notas = excluded.notas, orden = excluded.orden, activo = excluded.activo;
end $$;

create or replace function public.delete_employee(p_id uuid, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_mode() then
    raise exception 'ADMIN_REQUIRED:Eliminar personas requiere el modo administrador.';
  end if;
  perform set_config('app.batch_id', gen_random_uuid()::text, true);
  perform set_config('app.batch_label', p_label, true);
  delete from public.notes where employee_id = p_id;
  delete from public.entries where employee_id = p_id;
  delete from public.employees where id = p_id;
end $$;

create or replace function public.save_code(p_code jsonb, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_mode() then
    raise exception 'ADMIN_REQUIRED:Cambiar las claves requiere el modo administrador.';
  end if;
  perform set_config('app.batch_id', gen_random_uuid()::text, true);
  perform set_config('app.batch_label', p_label, true);
  insert into public.codes
  select * from jsonb_populate_record(null::public.codes, p_code)
  on conflict (code) do update set label = excluded.label, color = excluded.color,
    text_color = excluded.text_color, category = excluded.category,
    orden = excluded.orden, activo = excluded.activo;
end $$;

create or replace function public.replace_all(p_data jsonb, p_label text, p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_mode() then
    raise exception 'ADMIN_REQUIRED:Importar o restaurar requiere el modo administrador.';
  end if;
  perform public.create_snapshot('Automática antes de: ' || p_label, true);
  perform set_config('app.skip_audit', 'on', true);
  delete from public.notes where true;
  delete from public.entries where true;
  delete from public.employees where true;
  insert into public.codes select * from jsonb_populate_recordset(null::public.codes, p_data->'codes')
    on conflict (code) do update set label = excluded.label, color = excluded.color,
      text_color = excluded.text_color, category = excluded.category, orden = excluded.orden, activo = excluded.activo;
  insert into public.employees select * from jsonb_populate_recordset(null::public.employees, p_data->'employees');
  insert into public.entries (employee_id, day, code)
    select (x->>'employee_id')::uuid, (x->>'day')::date, x->>'code' from jsonb_array_elements(p_data->'entries') x;
  insert into public.notes (employee_id, day, text, author)
    select (x->>'employee_id')::uuid, (x->>'day')::date, x->>'text', coalesce(x->>'author', '')
    from jsonb_array_elements(coalesce(p_data->'notes', '[]'::jsonb)) x
    where coalesce(btrim(x->>'text'), '') <> '';
  perform set_config('app.skip_audit', 'off', true);
  insert into public.change_log (user_id, user_name, entity, action, new_value, batch_id, batch_label)
  values (auth.uid(), public.my_name(), 'system', p_action,
          jsonb_build_object('employees', jsonb_array_length(p_data->'employees'),
                             'entries', jsonb_array_length(p_data->'entries'),
                             'notes', jsonb_array_length(coalesce(p_data->'notes', '[]'::jsonb))),
          gen_random_uuid(), p_label);
end $$;

-- Nadie modifica tablas directamente desde la API (solo lectura + funciones)
revoke insert, update, delete, truncate on
  public.entries, public.notes, public.employees, public.codes,
  public.profiles, public.change_log, public.snapshots, public.admin_config
  from anon, authenticated;
drop policy if exists e_write on public.employees;
drop policy if exists c_write on public.codes;
drop policy if exists en_write on public.entries;
drop policy if exists n_write on public.notes;

do $$
declare f text;
begin
  foreach f in array array[
    'public.is_admin_mode()', 'public.admin_status()', 'public.admin_unlock(text)', 'public.admin_lock()',
    'public.set_admin_password(text, text)', 'public.apply_entries(jsonb, text)', 'public.apply_notes(jsonb, text)',
    'public.save_employee(jsonb, text)', 'public.delete_employee(uuid, text)', 'public.save_code(jsonb, text)',
    'public.replace_all(jsonb, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
