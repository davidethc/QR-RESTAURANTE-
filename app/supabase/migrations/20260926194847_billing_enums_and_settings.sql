-- ---------------------------------------------------------------------------
-- Módulo 1 · M5 · Enums del cobro y la caja, y ajustes por restaurante.
--
-- billing_enabled = false (por defecto) deja todo como hoy. Solo monky-qa lo
-- activa mientras se prueba el módulo.
-- max_waiter_discount_pct = 0 por defecto: el mesero no puede descontar
-- hasta que el dueño lo configure.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'payment_method') then
    create type public.payment_method as enum ('CASH', 'CARD', 'TRANSFER', 'OTHER');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'bill_status') then
    -- PAID = saldo 0 con la sesión abierta; vuelve a OPEN si entra un pedido.
    create type public.bill_status as enum ('OPEN', 'PAID', 'CLOSED', 'VOID');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'payment_status') then
    create type public.payment_status as enum ('COMPLETED', 'VOIDED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'discount_kind') then
    create type public.discount_kind as enum ('PERCENT', 'FIXED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'bill_split_mode') then
    create type public.bill_split_mode as enum ('NONE', 'EQUAL', 'ITEMS');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'cash_session_status') then
    create type public.cash_session_status as enum ('OPEN', 'CLOSED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'cash_movement_type') then
    create type public.cash_movement_type as enum ('IN', 'OUT');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'cash_movement_reason') then
    create type public.cash_movement_reason as enum (
      'FLOAT_TOPUP', 'TIPS_PAYOUT', 'SUPPLIER_PAYMENT', 'EXPENSE',
      'REFUND', 'WITHDRAWAL', 'OTHER'
    );
  end if;
end;
$$;


alter table public.restaurants
  add column if not exists max_waiter_discount_pct numeric(5,2) not null default 0,
  add column if not exists billing_enabled boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurants_max_waiter_discount_pct_range'
      and conrelid = 'public.restaurants'::regclass
  ) then
    alter table public.restaurants
      add constraint restaurants_max_waiter_discount_pct_range
      check (max_waiter_discount_pct >= 0 and max_waiter_discount_pct <= 100);
  end if;
end;
$$;

comment on column public.restaurants.max_waiter_discount_pct is
  'Tope de descuento (en %) que un mesero puede aplicar a una cuenta. 0 = no puede descontar.';
comment on column public.restaurants.billing_enabled is
  'Activa el módulo de cobro y caja. En false el restaurante funciona como antes del módulo.';


-- ---------------------------------------------------------------------------
-- Ajustes sensibles: solo el OWNER los cambia.
--
-- La política restaurants_update_admin deja que un ADMIN actualice la fila
-- de su restaurante por la API. Estas tres columnas deciden si se cobra, cuánto
-- puede descontar un mesero y cómo se cortan los días de los reportes, así que
-- solo el dueño puede cambiarlas. business_day_cutoff nace en M1 pero su
-- protección vive aquí.
--
-- Sin usuario (auth.uid() is null: service_role, migraciones, SQL del
-- dashboard) se permite.
-- ---------------------------------------------------------------------------
create or replace function public.guard_restaurant_owner_settings()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if (new.billing_enabled is distinct from old.billing_enabled
      or new.max_waiter_discount_pct is distinct from old.max_waiter_discount_pct
      or new.business_day_cutoff is distinct from old.business_day_cutoff)
     and auth.uid() is not null
     and not public.user_has_restaurant_role(old.id, 'OWNER')
  then
    raise exception 'Solo el dueño puede cambiar el cobro, el tope de descuento o el corte del día'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_restaurant_owner_settings() from public, anon, authenticated;

drop trigger if exists restaurants_guard_owner_settings on public.restaurants;
create trigger restaurants_guard_owner_settings
before update of billing_enabled, max_waiter_discount_pct, business_day_cutoff
on public.restaurants
for each row execute function public.guard_restaurant_owner_settings();
