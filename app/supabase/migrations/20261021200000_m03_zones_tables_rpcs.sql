-- ---------------------------------------------------------------------------
-- M03-T02 / M03-T03 · RPCs de zonas y mesas con validación de plano.
-- Fuente: docs/pos-spec/M03-zonas-mesas.md §5, §6, §10 y la migración M03-T01.
--
-- Solo agrega funciones (sin cambios de esquema). Todas son SECURITY DEFINER
-- con search_path vacío, exigen auth.uid() y rol OWNER/ADMIN del restaurante
-- (rol legado, como el resto de la app), y se revocan a anon.
--
-- Validación T02 (en el servidor, no solo con constraints):
--   * la mesa cabe: col + ancho <= columnas y row + alto <= filas; tamaño >= 1;
--   * no se solapa con otra mesa colocada de la misma zona (rectángulos);
--   * se serializa con FOR UPDATE sobre la zona.
-- El qr_token no se pasa: lo genera el default gen_random_uuid() de la tabla.
--
-- Decisiones (la spec no las fija):
--   * Tope de 30 columnas/filas por zona (cordura, evita planos absurdos).
--   * Identificador automático = max(number) + 1 del restaurante (el
--     mostrador usa 0). Editable: p_number explícito; duplicado se rechaza.
--   * delete_zone borra también las mesas de la zona, solo si ninguna tiene
--     sesión ACTIVE; si alguna tiene historial (pedidos/cuentas) la FK lo
--     impide y se aborta todo con mensaje claro.
--
-- Rollback: DROP FUNCTION de las 6 RPCs y el helper (no hay datos nuevos).
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Helper interno: rol y sesión. No invocable por clientes.
create function public.m03_require_zone_admin(p_restaurant_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión.' using errcode = 'P0001';
  end if;
  if not (
    public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
  ) then
    raise exception 'No tienes permiso para administrar zonas y mesas.' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

-- Helper interno: valida que el rectángulo quepa y no choque. La zona ya debe
-- estar bloqueada por el llamador.
create function public.m03_check_placement(
  p_zone_id uuid,
  p_exclude_table_id uuid,
  p_col integer,
  p_row integer,
  p_width integer,
  p_height integer
)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_cols integer;
  v_rows integer;
begin
  if p_col is null or p_row is null or p_width is null or p_height is null then
    raise exception 'Indica columna, fila, ancho y alto de la mesa.' using errcode = 'P0001';
  end if;
  if p_col < 0 or p_row < 0 then
    raise exception 'La posición de la mesa no puede ser negativa.' using errcode = 'P0001';
  end if;
  if p_width < 1 or p_height < 1 then
    raise exception 'El tamaño mínimo de una mesa es 1x1.' using errcode = 'P0001';
  end if;

  select z.grid_cols, z.grid_rows into v_cols, v_rows
  from public.zones z where z.id = p_zone_id;

  if p_col + p_width > v_cols or p_row + p_height > v_rows then
    raise exception 'La mesa queda fuera de la cuadrícula (% x %).', v_cols, v_rows
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.tables t
    where t.zone_id = p_zone_id
      and t.id is distinct from p_exclude_table_id
      and t.col is not null
      and t.col < p_col + p_width and p_col < t.col + t.width_cells
      and t."row" < p_row + p_height and p_row < t."row" + t.height_cells
  ) then
    raise exception 'La mesa se solapa con otra mesa de la zona.' using errcode = 'P0001';
  end if;
end;
$$;

create function public.create_zone(
  p_restaurant_id uuid,
  p_name text,
  p_grid_cols integer default 7,
  p_grid_rows integer default 5
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := public.m03_require_zone_admin(p_restaurant_id);
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_name = '' or length(v_name) > 60 then
    raise exception 'El nombre de la zona debe tener entre 1 y 60 caracteres.' using errcode = 'P0001';
  end if;
  if p_grid_cols is null or p_grid_rows is null
     or p_grid_cols not between 1 and 30 or p_grid_rows not between 1 and 30 then
    raise exception 'Columnas y filas deben estar entre 1 y 30.' using errcode = 'P0001';
  end if;

  insert into public.zones (restaurant_id, name, grid_cols, grid_rows, sort_order)
  values (
    p_restaurant_id, v_name, p_grid_cols, p_grid_rows,
    (select coalesce(max(z.sort_order) + 1, 0) from public.zones z where z.restaurant_id = p_restaurant_id)
  )
  returning id into v_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (p_restaurant_id, v_uid, 'CREATE', 'ZONE', v_id,
          jsonb_build_object('name', v_name, 'cols', p_grid_cols, 'rows', p_grid_rows));
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe una zona con ese nombre.' using errcode = 'P0001';
end;
$$;

create function public.update_zone(
  p_zone_id uuid,
  p_name text,
  p_grid_cols integer,
  p_grid_rows integer
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_zone public.zones%rowtype;
  v_uid uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  select * into v_zone from public.zones z where z.id = p_zone_id for update;
  if not found then
    raise exception 'La zona no existe.' using errcode = 'P0001';
  end if;
  v_uid := public.m03_require_zone_admin(v_zone.restaurant_id);

  if v_name = '' or length(v_name) > 60 then
    raise exception 'El nombre de la zona debe tener entre 1 y 60 caracteres.' using errcode = 'P0001';
  end if;
  if p_grid_cols is null or p_grid_rows is null
     or p_grid_cols not between 1 and 30 or p_grid_rows not between 1 and 30 then
    raise exception 'Columnas y filas deben estar entre 1 y 30.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.tables t
    where t.zone_id = p_zone_id and t.col is not null
      and (t.col + t.width_cells > p_grid_cols or t."row" + t.height_cells > p_grid_rows)
  ) then
    raise exception 'No puedes reducir el plano: hay mesas que quedarían fuera.' using errcode = 'P0001';
  end if;

  update public.zones
  set name = v_name, grid_cols = p_grid_cols, grid_rows = p_grid_rows
  where id = p_zone_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_zone.restaurant_id, v_uid, 'UPDATE', 'ZONE', p_zone_id,
          jsonb_build_object('name', v_name, 'cols', p_grid_cols, 'rows', p_grid_rows));
exception when unique_violation then
  raise exception 'Ya existe una zona con ese nombre.' using errcode = 'P0001';
end;
$$;

create function public.delete_zone(p_zone_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_zone public.zones%rowtype;
  v_uid uuid;
  v_deleted integer;
begin
  select * into v_zone from public.zones z where z.id = p_zone_id for update;
  if not found then
    raise exception 'La zona no existe.' using errcode = 'P0001';
  end if;
  v_uid := public.m03_require_zone_admin(v_zone.restaurant_id);

  if exists (
    select 1
    from public.table_sessions s
    join public.tables t on t.id = s.table_id
    where t.zone_id = p_zone_id and s.status = 'ACTIVE'
  ) then
    raise exception 'No se puede borrar la zona: alguna mesa tiene una sesión activa.' using errcode = 'P0001';
  end if;

  delete from public.tables where zone_id = p_zone_id;
  get diagnostics v_deleted = row_count;
  delete from public.zones where id = p_zone_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_zone.restaurant_id, v_uid, 'DELETE', 'ZONE', p_zone_id,
          jsonb_build_object('name', v_zone.name, 'tables_deleted', v_deleted));
exception when foreign_key_violation then
  raise exception 'No se puede borrar: alguna mesa de la zona tiene historial de pedidos o cuentas.' using errcode = 'P0001';
end;
$$;

create function public.create_table(
  p_zone_id uuid,
  p_col integer,
  p_row integer,
  p_number integer default null,
  p_shape text default 'square',
  p_width_cells integer default 1,
  p_height_cells integer default 1
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_zone public.zones%rowtype;
  v_uid uuid;
  v_number integer := p_number;
  v_id uuid;
begin
  select * into v_zone from public.zones z where z.id = p_zone_id for update;
  if not found then
    raise exception 'La zona no existe.' using errcode = 'P0001';
  end if;
  v_uid := public.m03_require_zone_admin(v_zone.restaurant_id);

  if p_shape is null or p_shape not in ('square', 'round') then
    raise exception 'La forma debe ser cuadrada o redonda.' using errcode = 'P0001';
  end if;
  perform public.m03_check_placement(p_zone_id, null, p_col, p_row, p_width_cells, p_height_cells);

  -- Serializa el consecutivo por restaurante.
  perform pg_advisory_xact_lock(hashtextextended(v_zone.restaurant_id::text, 0));
  if v_number is null then
    select coalesce(max(t.number), 0) + 1 into v_number
    from public.tables t where t.restaurant_id = v_zone.restaurant_id;
  elsif v_number < 1 then
    raise exception 'El identificador de mesa empieza en 1.' using errcode = 'P0001';
  end if;

  insert into public.tables (restaurant_id, zone_id, number, shape, col, "row", width_cells, height_cells)
  values (v_zone.restaurant_id, p_zone_id, v_number, p_shape, p_col, p_row, p_width_cells, p_height_cells)
  returning id into v_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_zone.restaurant_id, v_uid, 'CREATE', 'TABLE', v_id,
          jsonb_build_object('zone_id', p_zone_id, 'number', v_number, 'col', p_col, 'row', p_row,
                             'width', p_width_cells, 'height', p_height_cells));
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe una mesa con ese identificador.' using errcode = 'P0001';
end;
$$;

create function public.move_table(
  p_table_id uuid,
  p_col integer,
  p_row integer,
  p_width_cells integer,
  p_height_cells integer,
  p_shape text default null,
  p_number integer default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_table public.tables%rowtype;
  v_uid uuid;
begin
  select * into v_table from public.tables t where t.id = p_table_id;
  if not found or v_table.zone_id is null then
    raise exception 'La mesa no existe o no pertenece a una zona.' using errcode = 'P0001';
  end if;
  v_uid := public.m03_require_zone_admin(v_table.restaurant_id);

  perform 1 from public.zones z where z.id = v_table.zone_id for update;
  select * into v_table from public.tables t where t.id = p_table_id for update;

  if p_shape is not null and p_shape not in ('square', 'round') then
    raise exception 'La forma debe ser cuadrada o redonda.' using errcode = 'P0001';
  end if;
  if p_number is not null and p_number < 1 then
    raise exception 'El identificador de mesa empieza en 1.' using errcode = 'P0001';
  end if;
  perform public.m03_check_placement(v_table.zone_id, p_table_id, p_col, p_row, p_width_cells, p_height_cells);

  update public.tables
  set col = p_col, "row" = p_row, width_cells = p_width_cells, height_cells = p_height_cells,
      shape = coalesce(p_shape, shape), number = coalesce(p_number, number)
  where id = p_table_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_table.restaurant_id, v_uid, 'UPDATE', 'TABLE', p_table_id,
          jsonb_build_object('col', p_col, 'row', p_row, 'width', p_width_cells,
                             'height', p_height_cells, 'shape', p_shape, 'number', p_number));
exception when unique_violation then
  raise exception 'Ya existe una mesa con ese identificador.' using errcode = 'P0001';
end;
$$;

create function public.delete_table(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_table public.tables%rowtype;
  v_uid uuid;
begin
  select * into v_table from public.tables t where t.id = p_table_id for update;
  if not found then
    raise exception 'La mesa no existe.' using errcode = 'P0001';
  end if;
  v_uid := public.m03_require_zone_admin(v_table.restaurant_id);

  if exists (
    select 1 from public.table_sessions s
    where s.table_id = p_table_id and s.status = 'ACTIVE'
  ) then
    raise exception 'No se puede borrar la mesa: tiene una sesión activa.' using errcode = 'P0001';
  end if;

  delete from public.tables where id = p_table_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_table.restaurant_id, v_uid, 'DELETE', 'TABLE', p_table_id,
          jsonb_build_object('number', v_table.number, 'zone_id', v_table.zone_id));
exception when foreign_key_violation then
  raise exception 'No se puede borrar: la mesa tiene historial de pedidos o cuentas.' using errcode = 'P0001';
end;
$$;

-- Helpers: solo internos (los RPC corren como owner).
revoke all on function public.m03_require_zone_admin(uuid) from public, anon, authenticated;
revoke all on function public.m03_check_placement(uuid, uuid, integer, integer, integer, integer) from public, anon, authenticated;

revoke all on function public.create_zone(uuid, text, integer, integer) from public, anon;
revoke all on function public.update_zone(uuid, text, integer, integer) from public, anon;
revoke all on function public.delete_zone(uuid) from public, anon;
revoke all on function public.create_table(uuid, integer, integer, integer, text, integer, integer) from public, anon;
revoke all on function public.move_table(uuid, integer, integer, integer, integer, text, integer) from public, anon;
revoke all on function public.delete_table(uuid) from public, anon;

grant execute on function public.create_zone(uuid, text, integer, integer) to authenticated, service_role;
grant execute on function public.update_zone(uuid, text, integer, integer) to authenticated, service_role;
grant execute on function public.delete_zone(uuid) to authenticated, service_role;
grant execute on function public.create_table(uuid, integer, integer, integer, text, integer, integer) to authenticated, service_role;
grant execute on function public.move_table(uuid, integer, integer, integer, integer, text, integer) to authenticated, service_role;
grant execute on function public.delete_table(uuid) to authenticated, service_role;
