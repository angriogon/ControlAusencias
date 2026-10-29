-- =====================================================================
-- Notas por celda (equivalente a las notas/comentarios del Excel).
-- Van en tabla aparte porque una celda puede tener nota sin clave.
-- =====================================================================
create table if not exists public.notes (
  employee_id uuid not null references public.employees(id) on delete cascade,
  day date not null,
  text text not null,
  author text not null default '',
  updated_at timestamptz not null default now(),
  primary key (employee_id, day)
);
create index if not exists notes_day_idx on public.notes(day);

-- Autor = quien la escribe en la app (al importar se conserva el del Excel)
create or replace function public.stamp_note() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if current_setting('app.skip_audit', true) is distinct from 'on' then
    new.author := public.my_name();
  end if;
  return new;
end $$;
drop trigger if exists stamp_notes on public.notes;
create trigger stamp_notes before insert or update on public.notes
  for each row execute function public.stamp_note();

-- La auditoría ya existente aprende la nueva tabla
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
  elsif tg_table_name = 'notes' then
    v_entity := 'note';
    v_old := case when tg_op <> 'INSERT' then to_jsonb(old.text) end;
    v_new := case when tg_op <> 'DELETE' then to_jsonb(new.text) end;
    v_emp := coalesce(new.employee_id, old.employee_id);
    v_day := coalesce(new.day, old.day);
    if tg_op = 'UPDATE' and old.text = new.text then return new; end if;
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

drop trigger if exists audit_notes on public.notes;
create trigger audit_notes after insert or update or delete on public.notes
  for each row execute function public.audit_row();

-- Guarda/borra notas en un lote. p_changes: [{employee_id, day, text | null}]
create or replace function public.apply_notes(p_changes jsonb, p_label text)
returns uuid language plpgsql security invoker set search_path = public as $$
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

-- Deshacer: igual que antes, más el caso "note"
create or replace function public.revert_changes(p_ids bigint[], p_force boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record; v_cur jsonb; v_conflicts int := 0; v_first bigint; v_label text;
begin
  if public.my_role() not in ('admin', 'editor') then
    raise exception 'No tienes permiso para deshacer cambios';
  end if;

  for r in select * from public.change_log where id = any(p_ids) and reverted_by is null and entity <> 'system' loop
    if r.entity = 'entry' then
      select to_jsonb(code) into v_cur from public.entries where employee_id = r.employee_id and day = r.day;
    elsif r.entity = 'note' then
      select to_jsonb(text) into v_cur from public.notes where employee_id = r.employee_id and day = r.day;
    elsif r.entity = 'employee' then
      select to_jsonb(e) into v_cur from public.employees e where id = r.employee_id;
    else
      select to_jsonb(c) into v_cur from public.codes c where code = coalesce(r.new_value, r.old_value)->>'code';
    end if;
    if v_cur is distinct from r.new_value then v_conflicts := v_conflicts + 1; end if;
    v_cur := null;
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

  for r in select * from public.change_log where id = any(p_ids) and reverted_by is null and entity <> 'system'
           order by id desc loop
    if r.entity = 'entry' then
      if r.old_value is null then
        delete from public.entries where employee_id = r.employee_id and day = r.day;
      elsif exists (select 1 from public.employees where id = r.employee_id) then
        insert into public.entries (employee_id, day, code) values (r.employee_id, r.day, r.old_value #>> '{}')
        on conflict (employee_id, day) do update set code = excluded.code;
      end if;
    elsif r.entity = 'note' then
      if r.old_value is null then
        delete from public.notes where employee_id = r.employee_id and day = r.day;
      elsif exists (select 1 from public.employees where id = r.employee_id) then
        insert into public.notes (employee_id, day, text) values (r.employee_id, r.day, r.old_value #>> '{}')
        on conflict (employee_id, day) do update set text = excluded.text;
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

-- Al eliminar una persona, sus notas van en el mismo lote (y vuelven al deshacer)
create or replace function public.delete_employee(p_id uuid, p_label text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if public.my_role() not in ('admin', 'editor') then
    raise exception 'No tienes permiso para modificar datos';
  end if;
  perform set_config('app.batch_id', gen_random_uuid()::text, true);
  perform set_config('app.batch_label', p_label, true);
  delete from public.notes where employee_id = p_id;
  delete from public.entries where employee_id = p_id;
  delete from public.employees where id = p_id;
end $$;

-- Copias: ahora incluyen las notas
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
    'entries',   coalesce((select jsonb_agg(jsonb_build_object('employee_id', employee_id, 'day', day, 'code', code)) from public.entries), '[]'),
    'notes',     coalesce((select jsonb_agg(jsonb_build_object('employee_id', employee_id, 'day', day, 'text', text, 'author', author)) from public.notes), '[]'));
  insert into public.snapshots (label, created_by, auto, employees_count, entries_count, data)
  values (p_label, case when auth.uid() is null then 'Copia programada' else public.my_name() end, p_auto,
          jsonb_array_length(v_data->'employees'), jsonb_array_length(v_data->'entries'), v_data)
  returning id into v_id;
  delete from public.snapshots where auto and id not in
    (select id from public.snapshots where auto order by id desc limit 60);
  return v_id;
end $$;

create or replace function public.replace_all(p_data jsonb, p_label text, p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'admin' then
    raise exception 'Solo un administrador puede restaurar o importar datos completos';
  end if;
  perform public.create_snapshot('Automática antes de: ' || p_label, true);
  perform set_config('app.skip_audit', 'on', true);
  delete from public.notes;
  delete from public.entries;
  delete from public.employees;
  insert into public.codes select * from jsonb_populate_recordset(null::public.codes, p_data->'codes')
    on conflict (code) do update set label = excluded.label, color = excluded.color,
      text_color = excluded.text_color, category = excluded.category, orden = excluded.orden, activo = excluded.activo;
  insert into public.employees select * from jsonb_populate_recordset(null::public.employees, p_data->'employees');
  insert into public.entries (employee_id, day, code)
    select (x->>'employee_id')::uuid, (x->>'day')::date, x->>'code' from jsonb_array_elements(p_data->'entries') x;
  -- Las copias antiguas no tienen "notes": se quedan sin notas, sin error
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

-- Seguridad
alter table public.notes enable row level security;
drop policy if exists n_read on public.notes;
create policy n_read on public.notes for select to authenticated using (true);
drop policy if exists n_write on public.notes;
create policy n_write on public.notes for all to authenticated
  using (public.my_role() in ('admin', 'editor')) with check (public.my_role() in ('admin', 'editor'));

revoke execute on function public.apply_notes(jsonb, text) from public, anon;
grant execute on function public.apply_notes(jsonb, text) to authenticated;
revoke execute on function public.revert_changes(bigint[], boolean) from public, anon;
grant execute on function public.revert_changes(bigint[], boolean) to authenticated;
revoke execute on function public.delete_employee(uuid, text) from public, anon;
grant execute on function public.delete_employee(uuid, text) to authenticated;
revoke execute on function public.create_snapshot(text, boolean) from public, anon;
grant execute on function public.create_snapshot(text, boolean) to authenticated;
revoke execute on function public.replace_all(jsonb, text, text) from public, anon;
grant execute on function public.replace_all(jsonb, text, text) to authenticated;
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.stamp_note() from public, anon, authenticated;

-- Tiempo real
alter table public.notes replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.notes; exception when duplicate_object then null; end;
end $$;
