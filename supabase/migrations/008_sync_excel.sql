-- =====================================================================
-- Sincronización Excel (SharePoint/OneDrive) → app, en un solo sentido.
-- La ejecuta el navegador del administrador que tiene el Excel sincronizado.
-- * Solo usuarios con rol admin (no hace falta el modo admin de 4 horas,
--   para que la sincronización no se corte sola).
-- * No aplica el límite de 5 personas: el Excel es la referencia.
-- * Claves y notas van en UN lote del historial: se deshace de una vez.
-- =====================================================================
create or replace function public.sync_excel(p_entries jsonb, p_notes jsonb, p_label text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c jsonb; v_batch uuid := gen_random_uuid();
begin
  if public.my_role() <> 'admin' then
    raise exception 'Solo un usuario administrador puede sincronizar con el Excel';
  end if;
  perform set_config('app.batch_id', v_batch::text, true);
  perform set_config('app.batch_label', p_label, true);
  for c in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    if c->>'code' is null or c->>'code' = '' then
      delete from public.entries where employee_id = (c->>'employee_id')::uuid and day = (c->>'day')::date;
    else
      insert into public.entries (employee_id, day, code)
      values ((c->>'employee_id')::uuid, (c->>'day')::date, c->>'code')
      on conflict (employee_id, day) do update set code = excluded.code
      where entries.code is distinct from excluded.code;
    end if;
  end loop;
  for c in select * from jsonb_array_elements(coalesce(p_notes, '[]'::jsonb)) loop
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

revoke execute on function public.sync_excel(jsonb, jsonb, text) from public, anon;
grant execute on function public.sync_excel(jsonb, jsonb, text) to authenticated;
