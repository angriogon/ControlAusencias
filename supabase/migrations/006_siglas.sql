-- =====================================================================
-- Siglas de cada persona (las que aparecen en las planificaciones).
-- Únicas sin distinguir mayúsculas; vacías permitidas.
-- =====================================================================
-- Admite vacío/NULL: las copias y el historial anteriores no traen siglas y deben poder restaurarse.
alter table public.employees add column if not exists siglas text default '';
create unique index if not exists employees_siglas_uq
  on public.employees (upper(siglas)) where siglas <> '';

-- Guardar ficha y deshacer cambios de ficha incluyen ahora las siglas
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
    nombre = excluded.nombre, siglas = excluded.siglas, telefono = excluded.telefono, extension = excluded.extension,
    almacen = excluded.almacen, team_leader = excluded.team_leader, equipo = excluded.equipo,
    zona = excluded.zona, guardias = excluded.guardias, sede = excluded.sede,
    dias_vacaciones = excluded.dias_vacaciones, vp_pendientes = excluded.vp_pendientes,
    dias_lh = excluded.dias_lh, notas = excluded.notas, orden = excluded.orden, activo = excluded.activo;
end $$;

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
          nombre = excluded.nombre, siglas = excluded.siglas, telefono = excluded.telefono, extension = excluded.extension,
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

revoke execute on function public.save_employee(jsonb, text) from public, anon;
grant execute on function public.save_employee(jsonb, text) to authenticated;
revoke execute on function public.revert_changes(bigint[], boolean) from public, anon;
grant execute on function public.revert_changes(bigint[], boolean) to authenticated;

-- Relleno inicial: siglas a partir del nombre (misma regla que la app: src/lib/siglas.ts).
-- Queda en el historial como UN solo cambio, que se puede deshacer.
do $$
declare r record; base text; s text; n int; w text; nm text;
begin
  perform set_config('app.batch_id', gen_random_uuid()::text, true);
  perform set_config('app.batch_label', 'Siglas generadas automáticamente a partir del nombre', true);
  for r in select id, nombre from public.employees where coalesce(siglas, '') = '' order by orden, id loop
    nm := btrim(split_part(r.nombre, '(', 1));
    if position(',' in nm) > 0 then
      nm := btrim(split_part(nm, ',', 2)) || ' ' || btrim(split_part(nm, ',', 1));
    end if;
    nm := translate(upper(nm), 'ÁÉÍÓÚÜÑÀÈÌÒÙÇ', 'AEIOUUNAEIOUC');
    nm := regexp_replace(nm, '[^A-Z\s-]', ' ', 'g');
    base := '';
    foreach w in array regexp_split_to_array(btrim(nm), '\s+') loop
      if w <> '' and w not in ('DE','DEL','LA','LAS','LOS','Y','E','DA','DO','DI','VAN','VON') then
        base := base || left(w, 1);
      end if;
    end loop;
    base := left(coalesce(nullif(base, ''), 'X'), 6);
    s := base; n := 2;
    while exists (select 1 from public.employees where upper(siglas) = s) loop
      s := base || n; n := n + 1;
    end loop;
    update public.employees set siglas = s where id = r.id;
  end loop;
end $$;
