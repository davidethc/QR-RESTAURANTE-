-- ---------------------------------------------------------------------------
-- M01-T02 · Variantes de precio por producto (EXPAND).
-- Spec: docs/pos-spec/M01-catalogo.md §3 (product_variants, índices,
-- migración de datos) y §5 ("Desde $X" = variante más económica).
--
-- Compatible con la app que hoy está en producción: solo agrega una tabla y
-- triggers. No cambia ninguna RPC ni columna. No depende de las migraciones
-- 20261020120000, 20261020130000 ni 20261020140000.
--
-- Decisiones:
--   * Sin restaurant_id en product_variants: la RLS resuelve el restaurante
--     con un exists sobre products (mismo patrón que product_options). Así no
--     hay una copia de restaurant_id que pueda quedar desalineada con la del
--     producto. El costo es un join por fila a products por su PK.
--   * products.price se conserva como CACHÉ = precio de la variante más
--     barata. Las RPC de pedido (build_order_lines) y las de carta siguen
--     leyendo products.price sin cambios: un producto con una sola variante
--     cobra exactamente lo mismo que hoy.
--   * Sincronía (triggers SECURITY INVOKER, search_path = '', nombres
--     calificados; corren con los permisos y la RLS de quien escribe, que ya
--     es OWNER/ADMIN o service_role):
--       1) AFTER INSERT en products: crea la variante (name '', price del
--          producto, position 0). Así la app actual, que solo manda price,
--          deja cada producto nuevo con su variante.
--       2) AFTER UPDATE OF price en products, cuando el precio cambia:
--          - si el precio nuevo ya es el mínimo de las variantes, no hace nada
--            (es el eco del punto 3);
--          - si hay exactamente 1 variante, le copia el precio;
--          - si hay 2 o más variantes, lanza 22023: con varias variantes el
--            precio se edita en cada variante, no en el producto.
--       3) AFTER INSERT/UPDATE/DELETE en product_variants: bloquea la fila
--          del producto (for update, para que dos escrituras concurrentes no
--          dejen un mínimo viejo) y pone products.price = min(variantes).
--     No hay bucle: cada UPDATE lleva "is distinct from" en el WHERE o en el
--     WHEN del trigger, así que el eco afecta 0 filas y no dispara nada más.
--   * Todo producto tiene ≥ 1 variante, garantizado en la base:
--       - el alta (punto 1) crea la primera;
--       - un constraint trigger DEFERRABLE INITIALLY DEFERRED revisa al
--         COMMIT que, si el producto sigue existiendo, le quede al menos una
--         variante (23514). Diferido para permitir reemplazar la única
--         variante dentro de una transacción (borrar + insertar). El borrado
--         del producto (cascade) no lo dispara en falso porque el producto ya
--         no existe.
--   * Una variante no cambia de producto: BEFORE UPDATE OF product_id lanza
--     22023. Trigger y no grants por columna para cubrir también a
--     service_role y postgres.
--   * name: '' cuando el producto tiene un solo precio. Sin espacios al borde
--     y hasta 80 caracteres. No se exige nombre único por producto.
--   * RLS igual que products: leen los miembros activos, escriben OWNER/ADMIN
--     con restaurant_members.role. anon sin acceso: la carta pública lee
--     get_public_menu (SECURITY DEFINER) y hoy no necesita las variantes.
--
-- Backfill: una variante por producto existente con name = '' y
-- price = products.price. Se hace ANTES de crear los triggers, así que no
-- escribe en products y no toca su updated_at. lock table en SHARE ROW
-- EXCLUSIVE: ningún producto nuevo se cuela entre el backfill y el trigger de
-- alta; las lecturas (carta, panel) siguen. lock_timeout corto: si hay algo
-- delante, la migración falla rápido y se reintenta.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table public.products in share row exclusive mode;

-- 1. Tabla -------------------------------------------------------------------
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null default '' check (name = btrim(name) and char_length(name) <= 80),
  price numeric(10,2) not null check (price >= 0),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.product_variants is
  'Variantes de precio de un producto (M01). name = '''' si el producto tiene un solo precio. products.price es caché del mínimo.';

create index product_variants_product_id_idx on public.product_variants (product_id);

-- 2. Backfill (antes de los triggers: no toca products) ------------------------
insert into public.product_variants (product_id, name, price, position)
select p.id, '', p.price, 0
from public.products p
where not exists (select 1 from public.product_variants v where v.product_id = p.id);

-- 3. RLS y permisos ------------------------------------------------------------
alter table public.product_variants enable row level security;

create policy product_variants_select_members on public.product_variants
  for select to authenticated
  using (exists (
    select 1 from public.products p
    where p.id = product_id
      and public.user_belongs_to_restaurant(p.restaurant_id)
  ));

create policy product_variants_insert_admin on public.product_variants
  for insert to authenticated
  with check (exists (
    select 1 from public.products p
    where p.id = product_id
      and (public.user_has_restaurant_role(p.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(p.restaurant_id, 'ADMIN'))
  ));

create policy product_variants_update_admin on public.product_variants
  for update to authenticated
  using (exists (
    select 1 from public.products p
    where p.id = product_id
      and (public.user_has_restaurant_role(p.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(p.restaurant_id, 'ADMIN'))
  ))
  with check (exists (
    select 1 from public.products p
    where p.id = product_id
      and (public.user_has_restaurant_role(p.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(p.restaurant_id, 'ADMIN'))
  ));

create policy product_variants_delete_admin on public.product_variants
  for delete to authenticated
  using (exists (
    select 1 from public.products p
    where p.id = product_id
      and (public.user_has_restaurant_role(p.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(p.restaurant_id, 'ADMIN'))
  ));

revoke all on table public.product_variants from public, anon, authenticated;
grant select, insert, update, delete on table public.product_variants to authenticated;
grant all on table public.product_variants to service_role;

-- 4. Triggers de la variante ----------------------------------------------------
create trigger product_variants_set_updated_at
before update on public.product_variants
for each row execute function public.set_updated_at();

create or replace function public.product_variants_forbid_product_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.product_id is distinct from old.product_id then
    raise exception 'Una variante no puede cambiar de producto'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.product_variants_forbid_product_change() from public, anon, authenticated;

create trigger product_variants_forbid_product_change
before update of product_id on public.product_variants
for each row execute function public.product_variants_forbid_product_change();

create or replace function public.product_variants_sync_product_price()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product_id uuid := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  v_min numeric(10,2);
begin
  -- Candado primero y mínimo después: el SELECT siguiente ve lo que haya
  -- confirmado otra escritura concurrente sobre las variantes del producto.
  perform 1 from public.products p where p.id = v_product_id for update;
  if not found then
    return null; -- el producto se está borrando (cascade)
  end if;

  select min(v.price) into v_min
  from public.product_variants v
  where v.product_id = v_product_id;

  if v_min is not null then
    update public.products p
    set price = v_min
    where p.id = v_product_id
      and p.price is distinct from v_min;
  end if;

  return null;
end;
$$;

revoke all on function public.product_variants_sync_product_price() from public, anon, authenticated;

create trigger product_variants_sync_product_price
after insert or update of price or delete on public.product_variants
for each row execute function public.product_variants_sync_product_price();

create or replace function public.product_variants_require_one()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.products p where p.id = old.product_id)
     and not exists (select 1 from public.product_variants v where v.product_id = old.product_id) then
    raise exception 'Un producto debe tener al menos una variante'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke all on function public.product_variants_require_one() from public, anon, authenticated;

create constraint trigger product_variants_require_one
after delete on public.product_variants
deferrable initially deferred
for each row execute function public.product_variants_require_one();

-- 5. Triggers del producto -----------------------------------------------------
create or replace function public.products_create_default_variant()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.product_variants (product_id, name, price, position)
  values (new.id, '', new.price, 0);
  return null;
end;
$$;

revoke all on function public.products_create_default_variant() from public, anon, authenticated;

create trigger products_create_default_variant
after insert on public.products
for each row execute function public.products_create_default_variant();

create or replace function public.products_sync_variant_price()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
  v_min numeric(10,2);
begin
  select count(*), min(v.price) into v_count, v_min
  from public.product_variants v
  where v.product_id = new.id;

  if v_count = 0 or new.price = v_min then
    return null;
  end if;

  if v_count = 1 then
    update public.product_variants v
    set price = new.price
    where v.product_id = new.id
      and v.price is distinct from new.price;
    return null;
  end if;

  raise exception 'Este producto tiene varias variantes: cambia el precio en cada variante'
    using errcode = '22023';
end;
$$;

revoke all on function public.products_sync_variant_price() from public, anon, authenticated;

create trigger products_sync_variant_price
after update of price on public.products
for each row
when (old.price is distinct from new.price)
execute function public.products_sync_variant_price();
