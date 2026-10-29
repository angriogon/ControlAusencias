-- Supabase bloquea DELETE sin WHERE en las peticiones de la API (pg_safeupdate),
-- también dentro de funciones: "DELETE requires a WHERE clause" al importar.
-- Se añade "where true" para vaciar las tablas al importar/restaurar.
create or replace function public.replace_all(p_data jsonb, p_label text, p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'admin' then
    raise exception 'Solo un administrador puede restaurar o importar datos completos';
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
revoke execute on function public.replace_all(jsonb, text, text) from public, anon;
grant execute on function public.replace_all(jsonb, text, text) to authenticated;
