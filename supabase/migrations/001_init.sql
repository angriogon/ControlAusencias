-- =====================================================================
-- Control de Ausencias · esquema Supabase (PostgreSQL)
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run.
-- Es idempotente en lo posible; pensado para un proyecto NUEVO.
-- =====================================================================

-- ---------- Perfiles y roles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'editor' check (role in ('admin', 'editor', 'lector')),
  created_at timestamptz not null default now()
);

-- Cada usuario creado en Authentication obtiene perfil automáticamente.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'lector')
$$;

create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from public.profiles where id = auth.uid()),
                  auth.jwt()->>'email', 'sistema')
$$;

-- ---------- Datos ----------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null default '',
  extension text not null default '',
  almacen text not null default '',
  team_leader text not null default '',
  equipo text not null default '',
  zona text not null default '',
  guardias text not null default '',
  sede text not null default '',
  dias_vacaciones numeric not null default 25,
  vp_pendientes numeric not null default 0,
  dias_lh numeric not null default 0,
  notas text not null default '',
  orden int not null default 0,
  activo boolean not null default true
);

create table if not exists public.codes (
  code text primary key,
  label text not null,
  color text not null default '#808080',
  text_color text not null default '#FFFFFF',
  category text not null default 'ausencia' check (category in ('ausencia', 'control')),
  orden int not null default 0,
  activo boolean not null default true
);

create table if not exists public.entries (
  employee_id uuid not null references public.employees(id) on delete cascade,
  day date not null,
  code text not null references public.codes(code) on update cascade,
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  primary key (employee_id, day)
);
create index if not exists entries_day_idx on public.entries(day);

-- ---------- Historial de cambios (auditoría) ----------
create table if not exists public.change_log (
  id bigserial primary key,
  ts timestamptz not null default now(),
  user_id uuid,
  user_name text not null,
  entity text not null,          -- entry | employee | code | system
  action text not null,          -- insert | update | delete | restore | import
  employee_id uuid,
  day date,
  old_value jsonb,
  new_value jsonb,
  batch_id uuid,
  batch_label text,
  reverted_by bigint,
  revert_of bigint
);
create index if not exists change_log_batch_idx on public.change_log(batch_id);
create index if not exists change_log_emp_idx on public.change_log(employee_id);
create index if not exists change_log_user_idx on public.change_log(user_name);

-- ---------- Copias de seguridad ----------
create table if not exists public.snapshots (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  label text not null,
  created_by text not null,
  auto boolean not null default false,
  employees_count int not null default 0,
  entries_count int not null default 0,
  data jsonb not null
);

-- =====================================================================
-- Auditoría: un trigger registra TODO cambio en el servidor, así el
-- historial no depende de la app y nadie puede "saltárselo".
-- La app agrupa cambios en lotes con set_config('app.batch_id', ...).
-- =====================================================================
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb; v_new jsonb; v_emp uuid; v_day date; v_entity text; v_action text;
  v_batch uuid := nullif(current_setting('app.batch_id', true), '')::uuid;
  v_label text := nullif(current_setting('app.batch_label', true), '');
  v_revert bigint := nullif(current_setting('app.revert_of', true), '')::bigint;
begin
  if current_setting('app.skip_audit', true) = 'on' then
    return coalesce(new, old);
  end if;

  v_action := lower(tg_op);
  if tg_table_name = 'entries' then
    v_entity := 'entry';
    v_old := case when tg_op <> 'INSERT' then to_jsonb(old.code) end;
    v_new := case when tg_op <> 'DELETE' then to_jsonb(new.code) end;
    v_emp := coalesce(new.employee_id, old.employee_id);
    v_day := coalesce(new.day, old.day);
    if tg_op = 'UPDATE' and old.code = new.code then return new; end if;
  elsif tg_table_name = 'employees' then
    v_entity := 'employee';
    v_old := case when tg_op <> 'INSERT' then to_jsonb(old) end;
    v_new := case when tg_op <> 'DELETE' then to_jsonb(new) end;
    v_emp := coalesce(new.id, old.id);
    if tg_op = 'UPDATE' and v_old = v_new then return new; end if;
  else
    v_entity := 'code';
    v_old := case when tg_op <> 'INSERT' then to_jsonb(old) end;
    v_new := case when tg_op <> 'DELETE' then to_jsonb(new) end;
    if tg_op = 'UPDATE' and v_old = v_new then return new; end if;
  end if;

  insert into public.change_log (user_id, user_name, entity, action, employee_id, day,
                                 old_value, new_value, batch_id, batch_label, revert_of)
  values (auth.uid(), public.my_name(), v_entity, v_action, v_emp, v_day,
          v_old, v_new, coalesce(v_batch, gen_random_uuid()), v_label, v_revert);
  return coalesce(new, old);
end $$;

drop trigger if exists audit_entries on public.entries;
create trigger audit_entries after insert or update or delete on public.entries
  for each row execute function public.audit_row();
drop trigger if exists audit_employees on public.employees;
create trigger audit_employees after insert or update or delete on public.employees
  for each row execute function public.audit_row();
drop trigger if exists audit_codes on public.codes;
create trigger audit_codes after insert or update or delete on public.codes
  for each row execute function public.audit_row();

-- Sella quién y cuándo tocó cada celda (se ve al pasar el ratón).
create or replace function public.stamp_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := public.my_name();
  return new;
end $$;
drop trigger if exists stamp_entries on public.entries;
create trigger stamp_entries before insert or update on public.entries
  for each row execute function public.stamp_entry();

-- =====================================================================
-- Funciones que usa la app (RPC)
-- =====================================================================

-- Aplica un lote de cambios de celdas en UNA transacción.
-- p_changes: [{ "employee_id": "...", "day": "2026-10-29", "code": "V" | null }]
drop function if exists public.apply_entries(jsonb, text);
create or replace function public.apply_entries(p_changes jsonb, p_label text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare c jsonb; v_batch uuid := gen_random_uuid();
begin
  if public.my_role() not in ('admin', 'editor') then
    raise exception 'No tienes permiso para modificar datos';
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

-- Guarda una ficha (alta o edición) con etiqueta de lote.
create or replace function public.save_employee(p_emp jsonb, p_label text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if public.my_role() not in ('admin', 'editor') then
    raise exception 'No tienes permiso para modificar datos';
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

-- Elimina una persona y sus marcas en un único lote (reversible).
create or replace function public.delete_employee(p_id uuid, p_label text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if public.my_role() not in ('admin', 'editor') then
    raise exception 'No tienes permiso para modificar datos';
  end if;
  perform set_config('app.batch_id', gen_random_uuid()::text, true);
  perform set_config('app.batch_label', p_label, true);
  delete from public.entries where employee_id = p_id;
  delete from public.employees where id = p_id;
end $$;

create or replace function public.save_code(p_code jsonb, p_label text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if public.my_role() <> 'admin' then
    raise exception 'Solo un administrador puede cambiar las claves';
  end if;
  perform set_config('app.batch_id', gen_random_uuid()::text, true);
  perform set_config('app.batch_label', p_label, true);
  insert into public.codes
  select * from jsonb_populate_record(null::public.codes, p_code)
  on conflict (code) do update set label = excluded.label, color = excluded.color,
    text_color = excluded.text_color, category = excluded.category,
    orden = excluded.orden, activo = excluded.activo;
end $$;

-- Deshace cambios. Si alguien modificó el dato después y p_force = false,
-- devuelve error 'CONFLICT:' para que la app pregunte antes de pisarlo.
create or replace function public.revert_changes(p_ids bigint[], p_force boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record; v_cur jsonb; v_conflicts int := 0; v_first bigint; v_label text;
begin
  if public.my_role() not in ('admin', 'editor') then
    raise exception 'No tienes permiso para deshacer cambios';
  end if;

  -- 1) Comprobar conflictos
  for r in select * from public.change_log where id = any(p_ids) and reverted_by is null and entity <> 'system' loop
    if r.entity = 'entry' then
      select to_jsonb(code) into v_cur from public.entries where employee_id = r.employee_id and day = r.day;
    elsif r.entity = 'employee' then
      select to_jsonb(e) into v_cur from public.employees e where id = r.employee_id;
    else
      select to_jsonb(c) into v_cur from public.codes c where code = coalesce(r.new_value, r.old_value)->>'code';
    end if;
    if v_cur is distinct from r.new_value then v_conflicts := v_conflicts + 1; end if;
  end loop;
  if v_conflicts > 0 and not p_force then
    raise exception 'CONFLICT:% dato(s) se han vuelto a modificar después de este cambio.', v_conflicts;
  end if;

  select min(id), 'Deshacer: ' || coalesce(max(batch_label), 'cambio') into v_first, v_label
    from public.change_log where id = any(p_ids) and reverted_by is null;
  if v_first is null then raise exception 'Este cambio ya estaba deshecho.'; end if;

  perform set_config('app.batch_id', gen_random_uuid()::text, true);
  perform set_config('app.batch_label', v_label, true);
  perform set_config('app.revert_of', v_first::text, true);

  -- 2) Aplicar el valor anterior, del cambio más reciente al más antiguo
  --    (así, al deshacer un borrado, primero vuelve la ficha y luego sus marcas)
  for r in select * from public.change_log where id = any(p_ids) and reverted_by is null and entity <> 'system'
           order by id desc loop
    if r.entity = 'entry' then
      if r.old_value is null then
        delete from public.entries where employee_id = r.employee_id and day = r.day;
      elsif exists (select 1 from public.employees where id = r.employee_id) then
        insert into public.entries (employee_id, day, code) values (r.employee_id, r.day, r.old_value #>> '{}')
        on conflict (employee_id, day) do update set code = excluded.code;
      end if;
    elsif r.entity = 'employee' then
      if r.old_value is null then
        delete from public.employees where id = r.employee_id;
      else
        insert into public.employees select * from jsonb_populate_record(null::public.employees, r.old_value)
        on conflict (id) do update set
          nombre = excluded.nombre, telefono = excluded.telefono, extension = excluded.extension,
          almacen = excluded.almacen, team_leader = excluded.team_leader, equipo = excluded.equipo,
          zona = excluded.zona, guardias = excluded.guardias, sede = excluded.sede,
          dias_vacaciones = excluded.dias_vacaciones, vp_pendientes = excluded.vp_pendientes,
          dias_lh = excluded.dias_lh, notas = excluded.notas, orden = excluded.orden, activo = excluded.activo;
      end if;
    else
      if r.old_value is null then
        delete from public.codes where code = r.new_value->>'code';
      else
        insert into public.codes select * from jsonb_populate_record(null::public.codes, r.old_value)
        on conflict (code) do update set label = excluded.label, color = excluded.color,
          text_color = excluded.text_color, category = excluded.category,
          orden = excluded.orden, activo = excluded.activo;
      end if;
    end if;
  end loop;

  update public.change_log set reverted_by = (select max(id) from public.change_log)
   where id = any(p_ids) and reverted_by is null;
end $$;

create or replace function public.revert_batch(p_batch uuid, p_force boolean)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform public.revert_changes(array(select id from public.change_log where batch_id = p_batch), p_force);
end $$;

-- ---------- Copias ----------
create or replace function public.create_snapshot(p_label text, p_auto boolean default false)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_data jsonb;
begin
  if auth.uid() is not null and public.my_role() not in ('admin', 'editor') then
    raise exception 'No tienes permiso para crear copias';
  end if;
  v_data := jsonb_build_object(
    'employees', coalesce((select jsonb_agg(to_jsonb(e) order by orden) from public.employees e), '[]'),
    'codes',     coalesce((select jsonb_agg(to_jsonb(c) order by orden) from public.codes c), '[]'),
    'entries',   coalesce((select jsonb_agg(jsonb_build_object('employee_id', employee_id, 'day', day, 'code', code)) from public.entries), '[]'));
  insert into public.snapshots (label, created_by, auto, employees_count, entries_count, data)
  values (p_label, case when auth.uid() is null then 'Copia programada' else public.my_name() end, p_auto,
          jsonb_array_length(v_data->'employees'), jsonb_array_length(v_data->'entries'), v_data)
  returning id into v_id;
  -- Retención: últimas 60 copias automáticas (las manuales no se borran).
  delete from public.snapshots where auto and id not in
    (select id from public.snapshots where auto order by id desc limit 60);
  return v_id;
end $$;

-- Sustituye todos los datos por los de p_data (formato de create_snapshot).
create or replace function public.replace_all(p_data jsonb, p_label text, p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'admin' then
    raise exception 'Solo un administrador puede restaurar o importar datos completos';
  end if;
  perform public.create_snapshot('Automática antes de: ' || p_label, true);
  perform set_config('app.skip_audit', 'on', true);
  delete from public.entries;
  delete from public.employees;
  insert into public.codes select * from jsonb_populate_recordset(null::public.codes, p_data->'codes')
    on conflict (code) do update set label = excluded.label, color = excluded.color,
      text_color = excluded.text_color, category = excluded.category, orden = excluded.orden, activo = excluded.activo;
  insert into public.employees select * from jsonb_populate_recordset(null::public.employees, p_data->'employees');
  insert into public.entries (employee_id, day, code)
    select (x->>'employee_id')::uuid, (x->>'day')::date, x->>'code' from jsonb_array_elements(p_data->'entries') x;
  perform set_config('app.skip_audit', 'off', true);
  insert into public.change_log (user_id, user_name, entity, action, new_value, batch_id, batch_label)
  values (auth.uid(), public.my_name(), 'system', p_action,
          jsonb_build_object('employees', jsonb_array_length(p_data->'employees'),
                             'entries', jsonb_array_length(p_data->'entries')),
          gen_random_uuid(), p_label);
end $$;

create or replace function public.restore_snapshot(p_id bigint)
returns void language plpgsql security invoker set search_path = public as $$
declare v_data jsonb; v_label text;
begin
  select data, label into v_data, v_label from public.snapshots where id = p_id;
  if v_data is null then raise exception 'Copia no encontrada'; end if;
  perform public.replace_all(v_data, 'Restaura copia "' || v_label || '"', 'restore');
end $$;

-- =====================================================================
-- Seguridad (RLS): solo usuarios con sesión iniciada ven datos.
-- Las escrituras directas se limitan por rol; lo normal es usar las RPC.
-- =====================================================================
alter table public.profiles   enable row level security;
alter table public.employees  enable row level security;
alter table public.codes      enable row level security;
alter table public.entries    enable row level security;
alter table public.change_log enable row level security;
alter table public.snapshots  enable row level security;

drop policy if exists p_read on public.profiles;
create policy p_read on public.profiles for select to authenticated using (true);

drop policy if exists e_read on public.employees;
create policy e_read on public.employees for select to authenticated using (true);
drop policy if exists e_write on public.employees;
create policy e_write on public.employees for all to authenticated
  using (public.my_role() in ('admin', 'editor')) with check (public.my_role() in ('admin', 'editor'));

drop policy if exists c_read on public.codes;
create policy c_read on public.codes for select to authenticated using (true);
drop policy if exists c_write on public.codes;
create policy c_write on public.codes for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists en_read on public.entries;
create policy en_read on public.entries for select to authenticated using (true);
drop policy if exists en_write on public.entries;
create policy en_write on public.entries for all to authenticated
  using (public.my_role() in ('admin', 'editor')) with check (public.my_role() in ('admin', 'editor'));

-- El historial es de solo lectura para todos (lo escribe el trigger).
drop policy if exists l_read on public.change_log;
create policy l_read on public.change_log for select to authenticated using (true);

drop policy if exists s_read on public.snapshots;
create policy s_read on public.snapshots for select to authenticated using (true);

-- Las funciones solo las pueden llamar usuarios con sesión iniciada
-- (por defecto PostgreSQL deja ejecutarlas a cualquiera, incluido "anon").
do $$
declare f text;
begin
  foreach f in array array[
    'public.my_role()', 'public.my_name()',
    'public.apply_entries(jsonb, text)', 'public.save_employee(jsonb, text)',
    'public.delete_employee(uuid, text)', 'public.save_code(jsonb, text)',
    'public.revert_changes(bigint[], boolean)', 'public.revert_batch(uuid, boolean)',
    'public.create_snapshot(text, boolean)', 'public.replace_all(jsonb, text, text)',
    'public.restore_snapshot(bigint)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Funciones internas de triggers: nadie las llama directamente
  revoke execute on function public.handle_new_user() from public, anon, authenticated;
  revoke execute on function public.audit_row() from public, anon, authenticated;
  revoke execute on function public.stamp_entry() from public, anon, authenticated;
end $$;

-- ---------- Tiempo real ----------
alter table public.entries replica identity full;
alter table public.employees replica identity full;
alter table public.codes replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.entries;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.employees; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.codes;     exception when duplicate_object then null; end;
end $$;

-- ---------- Claves por defecto (las del Excel) ----------
insert into public.codes (code, label, color, text_color, category, orden) values
  ('V', 'Vacaciones', '#00B050', '#FFFFFF', 'ausencia', 0),
  ('VP', 'Vacaciones pendientes año anterior', '#92D050', '#000000', 'ausencia', 1),
  ('FL', 'Fiesta local', '#002060', '#FFFFFF', 'ausencia', 2),
  ('P', 'Permiso reglamentario', '#0070C0', '#FFFFFF', 'ausencia', 3),
  ('Lf', 'Libre por festivo', '#00B0F0', '#000000', 'ausencia', 4),
  ('Lh', 'Libre por horas', '#8FAADC', '#000000', 'ausencia', 5),
  ('B', 'Baja por enfermedad', '#FFFF00', '#000000', 'ausencia', 6),
  ('F', 'Formación', '#C00000', '#FFFFFF', 'ausencia', 7),
  ('FN', 'Fiesta nacional', '#7030A0', '#FFFFFF', 'ausencia', 8),
  ('A', 'Ausente', '#808080', '#FFFFFF', 'ausencia', 9),
  ('TF', 'Trabaja festivo', '#FFE699', '#7F6000', 'control', 10),
  ('TS', 'Trabaja sábado', '#F8CBAD', '#833C0B', 'control', 11),
  ('PC', 'Presencial en cliente', '#DDEBF7', '#1F4E79', 'control', 12),
  ('CZ', 'Cubre zona', '#D9D2E9', '#002060', 'control', 13),
  ('PC/MJ M', 'Presencial en cliente media jornada de mañana', '#BDD7EE', '#1F4E79', 'control', 14),
  ('MJ', 'Trabaja media jornada', '#E2EFDA', '#375623', 'control', 15),
  ('PC/MJ T', 'Presencial en cliente media jornada de tarde', '#FF6161', '#FFFFFF', 'control', 16),
  ('DT', 'Descansa tarde', '#E7E6E6', '#3A3838', 'control', 17),
  ('JC', 'Jornada continua (almacén, no paran a mediodía)', '#2F75B5', '#FFFFFF', 'control', 18),
  ('TT', 'Teletrabajo', '#44546A', '#FFFF00', 'control', 19)
on conflict (code) do nothing;

-- =====================================================================
-- OPCIONAL · Copia automática diaria a las 03:00 (hora UTC).
-- Requiere activar la extensión pg_cron: Database → Extensions → pg_cron.
-- Después, ejecuta solo estas dos líneas:
--
--   create extension if not exists pg_cron;
--   select cron.schedule('copia-diaria-ausencias', '0 3 * * *',
--     $$select public.create_snapshot('Copia automática diaria', true)$$);
-- =====================================================================
