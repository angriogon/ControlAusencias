-- =====================================================================
-- Las siglas asignadas no se pierden al importar el Excel ni al restaurar
-- una copia anterior a las siglas: el Excel no las tiene, así que se
-- recuperan por el NOMBRE (sin tildes, mayúsculas ni espacios de más).
-- Solo se rellenan las fichas que lleguen sin siglas y sin repetir ninguna.
-- =====================================================================
create or replace function public.person_key(p text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç',
    'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuuncc')), '\s+', ' ', 'g'))
$$;

create or replace function public.replace_all(p_data jsonb, p_label text, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare v_kept int := 0;
begin
  if public.my_role() <> 'admin' then
    raise exception 'Solo un administrador puede restaurar o importar datos completos';
  end if;
  perform public.create_snapshot('Automática antes de: ' || p_label, true);
  perform set_config('app.skip_audit', 'on', true);

  -- Siglas actuales por nombre (si un nombre se repite, gana la ficha activa)
  create temp table if not exists _siglas_prev (k text primary key, siglas text) on commit drop;
  delete from _siglas_prev where true;
  insert into _siglas_prev (k, siglas)
    select distinct on (public.person_key(nombre)) public.person_key(nombre), siglas
    from public.employees where coalesce(siglas, '') <> ''
    order by public.person_key(nombre), activo desc;

  delete from public.notes where true;
  delete from public.entries where true;
  delete from public.employees where true;
  insert into public.codes select * from jsonb_populate_recordset(null::public.codes, p_data->'codes')
    on conflict (code) do update set label = excluded.label, color = excluded.color,
      text_color = excluded.text_color, category = excluded.category, orden = excluded.orden, activo = excluded.activo;
  insert into public.employees select * from jsonb_populate_recordset(null::public.employees, p_data->'employees');

  -- Recuperar siglas en las fichas que llegan sin ellas (sin chocar con las que ya hay)
  update public.employees e set siglas = p.siglas
    from _siglas_prev p
   where coalesce(e.siglas, '') = '' and public.person_key(e.nombre) = p.k
     and not exists (select 1 from public.employees o where upper(o.siglas) = upper(p.siglas));
  get diagnostics v_kept = row_count;

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
                             'notes', jsonb_array_length(coalesce(p_data->'notes', '[]'::jsonb)),
                             'siglas_conservadas', v_kept),
          gen_random_uuid(), p_label);
end $$;
revoke execute on function public.replace_all(jsonb, text, text) from public, anon;
grant execute on function public.replace_all(jsonb, text, text) to authenticated;
