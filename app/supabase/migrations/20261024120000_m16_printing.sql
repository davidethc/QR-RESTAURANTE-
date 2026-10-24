-- ---------------------------------------------------------------------------
-- M16 · Impresión (EXPAND). Spec: docs/pos-spec/M16-impresion.md.
-- Contrato: docs/pos-spec/tanda4-db.md.
--
-- Qué agrega:
--   printing_settings: una fila por restaurante (sin fila = defaults: letra
--   normal, sin encabezado ni pie, impresión avanzada apagada).
--   get_printing_settings(restaurant): ajustes + datos de cabecera del ticket
--   (nombre, logo_url, dirección, teléfono). Cualquier miembro activo.
--   save_printing_settings(restaurant, parche): cualquier miembro activo
--   (M16 §6: Impresión es la única sección de Configuración que ven todos los
--   roles). La impresión avanzada (Bluetooth/USB) queda como punto de
--   extensión: sus columnas existen pero no se puede encender todavía.
--
-- Las plantillas usan datos que ya existen: bill_json (ticket y precuenta,
-- con promo_discount de M13), get_kitchen_tickets (comanda),
-- get_cash_session_summary / list_cash_cuts (corte) y get_order_contact
-- (bloque de cliente de domicilio, mismos permisos que hoy).
--
-- Rollback: drop de las dos funciones y de la tabla (no la usa nada más).
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.printing_settings (
  restaurant_id            uuid primary key references public.restaurants (id) on delete cascade,
  advanced_printing        boolean not null default false,
  os                       text,
  connection               text,
  customer_ticket_font_size text not null default 'normal',
  customer_ticket_header   text,
  customer_ticket_footer   text,
  kitchen_ticket_font_size text not null default 'normal',
  updated_by               uuid references auth.users (id) on delete set null,
  updated_at               timestamptz not null default now(),
  constraint printing_settings_os_valid check (os is null or os in ('windows', 'macos', 'linux', 'android', 'ios', 'chromeos')),
  constraint printing_settings_connection_valid check (connection is null or connection in ('bluetooth', 'usb')),
  constraint printing_settings_customer_font_valid check (customer_ticket_font_size in ('small', 'normal', 'large')),
  constraint printing_settings_kitchen_font_valid check (kitchen_ticket_font_size in ('small', 'normal', 'large')),
  constraint printing_settings_header_len check (customer_ticket_header is null or length(customer_ticket_header) <= 200),
  constraint printing_settings_footer_len check (customer_ticket_footer is null or length(customer_ticket_footer) <= 200)
);

comment on table public.printing_settings is
  'M16: personalización de tickets por restaurante. Sin fila = defaults (normal, sin encabezado/pie). advanced_printing/os/connection: punto de extensión (fuera del MVP).';

alter table public.printing_settings enable row level security;

drop policy if exists printing_settings_select_members on public.printing_settings;
create policy printing_settings_select_members on public.printing_settings
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

revoke all on table public.printing_settings from public, anon, authenticated;
grant select on table public.printing_settings to authenticated;
grant all on table public.printing_settings to service_role;

create or replace function public.get_printing_settings(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_r public.restaurants%rowtype;
  v_s public.printing_settings%rowtype;
begin
  if auth.uid() is null or not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v_r from public.restaurants where id = p_restaurant_id;
  select * into v_s from public.printing_settings where restaurant_id = p_restaurant_id;

  return jsonb_build_object(
    'advanced_printing',         coalesce(v_s.advanced_printing, false),
    'advanced_printing_available', false,
    'os',                        v_s.os,
    'connection',                v_s.connection,
    'customer_ticket_font_size', coalesce(v_s.customer_ticket_font_size, 'normal'),
    'customer_ticket_header',    v_s.customer_ticket_header,
    'customer_ticket_footer',    v_s.customer_ticket_footer,
    'kitchen_ticket_font_size',  coalesce(v_s.kitchen_ticket_font_size, 'normal'),
    'updated_at',                v_s.updated_at,
    'restaurant', jsonb_build_object(
      'name', v_r.name, 'logo_url', v_r.logo_url, 'address', v_r.address,
      'phone', v_r.phone, 'timezone', v_r.timezone));
end;
$$;

-- Parche: customer_ticket_font_size, customer_ticket_header,
-- customer_ticket_footer, kitchen_ticket_font_size, advanced_printing (solo
-- false por ahora). Texto vacío = sin encabezado/pie.
create or replace function public.save_printing_settings(p_restaurant_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_key    text;
  v_cur    public.printing_settings%rowtype;
  v_cfont  text;
  v_kfont  text;
  v_header text;
  v_footer text;
begin
  if auth.uid() is null or not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Datos inválidos';
  end if;

  for v_key in select jsonb_object_keys(p_data) loop
    if v_key not in ('customer_ticket_font_size', 'customer_ticket_header', 'customer_ticket_footer',
                     'kitchen_ticket_font_size', 'advanced_printing') then
      raise exception 'Campo no editable: %', v_key using hint = 'field=' || v_key;
    end if;
  end loop;

  if p_data ? 'advanced_printing' then
    if jsonb_typeof(p_data -> 'advanced_printing') <> 'boolean' then
      raise exception 'Valor inválido' using hint = 'field=advanced_printing';
    end if;
    if (p_data ->> 'advanced_printing')::boolean then
      raise exception 'La impresión avanzada estará disponible próximamente' using hint = 'field=advanced_printing';
    end if;
  end if;

  select * into v_cur from public.printing_settings where restaurant_id = p_restaurant_id for update;

  v_cfont := coalesce(p_data ->> 'customer_ticket_font_size', v_cur.customer_ticket_font_size, 'normal');
  v_kfont := coalesce(p_data ->> 'kitchen_ticket_font_size', v_cur.kitchen_ticket_font_size, 'normal');
  if v_cfont not in ('small', 'normal', 'large') then
    raise exception 'Tamaño de letra inválido' using hint = 'field=customer_ticket_font_size';
  end if;
  if v_kfont not in ('small', 'normal', 'large') then
    raise exception 'Tamaño de letra inválido' using hint = 'field=kitchen_ticket_font_size';
  end if;

  if p_data ? 'customer_ticket_header' and jsonb_typeof(p_data -> 'customer_ticket_header') not in ('string', 'null') then
    raise exception 'Valor inválido' using hint = 'field=customer_ticket_header';
  end if;
  if p_data ? 'customer_ticket_footer' and jsonb_typeof(p_data -> 'customer_ticket_footer') not in ('string', 'null') then
    raise exception 'Valor inválido' using hint = 'field=customer_ticket_footer';
  end if;
  v_header := case when p_data ? 'customer_ticket_header'
                   then nullif(btrim(p_data ->> 'customer_ticket_header'), '') else v_cur.customer_ticket_header end;
  v_footer := case when p_data ? 'customer_ticket_footer'
                   then nullif(btrim(p_data ->> 'customer_ticket_footer'), '') else v_cur.customer_ticket_footer end;
  if length(v_header) > 200 then
    raise exception 'El encabezado admite hasta 200 caracteres' using hint = 'field=customer_ticket_header';
  end if;
  if length(v_footer) > 200 then
    raise exception 'El pie de página admite hasta 200 caracteres' using hint = 'field=customer_ticket_footer';
  end if;

  insert into public.printing_settings as s (
    restaurant_id, customer_ticket_font_size, customer_ticket_header, customer_ticket_footer,
    kitchen_ticket_font_size, updated_by, updated_at
  )
  values (p_restaurant_id, v_cfont, v_header, v_footer, v_kfont, auth.uid(), now())
  on conflict (restaurant_id) do update
  set customer_ticket_font_size = excluded.customer_ticket_font_size,
      customer_ticket_header = excluded.customer_ticket_header,
      customer_ticket_footer = excluded.customer_ticket_footer,
      kitchen_ticket_font_size = excluded.kitchen_ticket_font_size,
      updated_by = excluded.updated_by,
      updated_at = now();

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (p_restaurant_id, auth.uid(), 'UPDATE', 'RESTAURANT', p_restaurant_id,
          jsonb_build_object('action', 'SET_PRINTING_SETTINGS',
            'customer_ticket_font_size', v_cfont, 'kitchen_ticket_font_size', v_kfont));

  return public.get_printing_settings(p_restaurant_id);
end;
$$;

revoke all on function public.get_printing_settings(uuid) from public, anon;
revoke all on function public.save_printing_settings(uuid, jsonb) from public, anon;
grant execute on function public.get_printing_settings(uuid) to authenticated, service_role;
grant execute on function public.save_printing_settings(uuid, jsonb) to authenticated, service_role;
