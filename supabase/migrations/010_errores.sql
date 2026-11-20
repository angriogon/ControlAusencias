-- =====================================================================
-- Registro de errores de la app (lo que falla en el navegador de cada uno).
-- Solo se escribe con log_error() y solo lo lee un administrador con
-- list_errors(). Se guardan 90 días y como mucho 30 por usuario y minuto.
-- No guarda datos del calendario: mensaje, traza, versión, pantalla y navegador.
-- =====================================================================
create table if not exists public.app_errors (
  id         bigserial primary key,
  ts         timestamptz not null default now(),
  user_id    uuid,
  user_name  text,
  version    text,
  message    text not null,
  stack      text,
  url        text,
  user_agent text
);
create index if not exists app_errors_ts_idx on public.app_errors (ts desc);
create index if not exists app_errors_user_ts_idx on public.app_errors (user_id, ts desc);

alter table public.app_errors enable row level security;
-- Sin políticas: nadie lee ni escribe directamente; solo por las funciones de abajo.
revoke all on public.app_errors from anon, authenticated;

create or replace function public.log_error(p_message text, p_stack text, p_version text, p_url text, p_user_agent text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if (select count(*) from public.app_errors where user_id = auth.uid() and ts > now() - interval '1 minute') >= 30 then
    return; -- un bucle de errores no llena la tabla
  end if;
  insert into public.app_errors (user_id, user_name, version, message, stack, url, user_agent)
  values (auth.uid(), public.my_name(), left(p_version, 20), left(coalesce(p_message, '(sin mensaje)'), 1000),
          left(p_stack, 4000), left(p_url, 300), left(p_user_agent, 300));
  delete from public.app_errors where ts < now() - interval '90 days';
end $$;

create or replace function public.list_errors(p_limit int)
returns setof public.app_errors language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'admin' then
    raise exception 'Solo un administrador puede ver el registro de errores';
  end if;
  return query select * from public.app_errors order by ts desc limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

revoke execute on function public.log_error(text, text, text, text, text) from public, anon;
grant execute on function public.log_error(text, text, text, text, text) to authenticated;
revoke execute on function public.list_errors(int) from public, anon;
grant execute on function public.list_errors(int) to authenticated;
