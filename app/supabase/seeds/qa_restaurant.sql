-- ---------------------------------------------------------------------------
-- Semilla del restaurante aislado de pruebas `monky-qa`.
--
-- Requiere las migraciones de Fase 0 (billing_enabled, business_day_cutoff).
-- Idempotente: se puede correr varias veces; en cada corrida deja la
-- contraseña de los tres usuarios QA igual al valor inyectado.
--
-- La constante v_password lleva un placeholder (QA_PASSWORD entre dobles
-- guiones bajos) que el orquestador reemplaza al ejecutar con el valor de
-- app/.env.qa.local. Es la ÚNICA aparición del placeholder en el archivo. Nunca se versiona la contraseña real.
-- Si se ejecuta sin reemplazar, la semilla falla a propósito.
--
-- Usuarios (Auth, email confirmado):
--   qa-owner@monky.test   OWNER
--   qa-mesero@monky.test  WAITER
--   qa-cocina@monky.test  KITCHEN
-- Los campos de auth.users replican los de los usuarios demo actuales:
-- instance_id en ceros, aud/role 'authenticated', tokens en '' (GoTrue falla
-- al leer NULL en esas columnas), app_metadata {provider, providers}.
-- A diferencia de los demo, se crea además la fila en auth.identities
-- (provider 'email', provider_id = id del usuario), que es lo que hoy crea
-- el propio Supabase Auth al registrar por email.
-- ---------------------------------------------------------------------------

do $$
declare
  v_password constant text := '__QA_PASSWORD__';
  v_restaurant_id uuid;
  v_user_id uuid;
  v_cat_bebidas uuid;
  v_cat_platos uuid;
  u record;
begin
  -- Guardia: el literal se arma por partes para que el reemplazo del
  -- orquestador no lo toque.
  if v_password = '__QA_' || 'PASSWORD__' or length(v_password) < 8 then
    raise exception 'Reemplaza el placeholder de contraseña QA antes de ejecutar la semilla';
  end if;

  -- 1) Restaurante
  insert into public.restaurants (name, slug, timezone, billing_enabled)
  values ('Monky QA', 'monky-qa', 'America/Guayaquil', true)
  on conflict (slug) do update
    set name = excluded.name,
        timezone = excluded.timezone,
        billing_enabled = true
  returning id into v_restaurant_id;

  -- 2) Usuarios, perfiles y membresías
  for u in
    select *
    from (values
      ('qa-owner@monky.test',  'QA Dueño',  'OWNER'::public.member_role),
      ('qa-mesero@monky.test', 'QA Mesero', 'WAITER'::public.member_role),
      ('qa-cocina@monky.test', 'QA Cocina', 'KITCHEN'::public.member_role)
    ) as x(email, full_name, role)
  loop
    select id into v_user_id
    from auth.users
    where email = u.email;

    if v_user_id is null then
      v_user_id := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new,
        email_change, email_change_token_current, phone_change,
        phone_change_token, reauthentication_token,
        is_sso_user, is_anonymous
      )
      values (
        '00000000-0000-0000-0000-000000000000', v_user_id,
        'authenticated', 'authenticated', u.email,
        extensions.crypt(v_password, extensions.gen_salt('bf', 10)),
        now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', u.full_name),
        now(), now(),
        '', '', '', '', '', '', '', '',
        false, false
      );
    else
      update auth.users
      set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf', 10)),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = v_user_id;
    end if;

    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      v_user_id::text, v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(), now(), now()
    )
    on conflict (provider_id, provider) do nothing;

    -- handle_new_user ya crea el perfil al insertar en auth.users.
    insert into public.profiles (id, full_name)
    values (v_user_id, u.full_name)
    on conflict (id) do update set full_name = excluded.full_name;

    insert into public.restaurant_members (restaurant_id, user_id, role, status)
    values (v_restaurant_id, v_user_id, u.role, 'ACTIVE')
    on conflict (restaurant_id, user_id) do update
      set role = excluded.role,
          status = 'ACTIVE';

    v_user_id := null;
  end loop;

  -- 3) Mesas (qr_token lo genera el default gen_random_uuid())
  insert into public.tables (restaurant_id, number, name)
  values
    (v_restaurant_id, 1, 'Mesa 1'),
    (v_restaurant_id, 2, 'Mesa 2'),
    (v_restaurant_id, 3, 'Mesa 3')
  on conflict (restaurant_id, number) do nothing;

  -- 4) Categorías
  insert into public.categories (restaurant_id, name, position)
  values
    (v_restaurant_id, 'Bebidas', 1),
    (v_restaurant_id, 'Platos', 2)
  on conflict (restaurant_id, name) do nothing;

  select id into v_cat_bebidas from public.categories
  where restaurant_id = v_restaurant_id and name = 'Bebidas';

  select id into v_cat_platos from public.categories
  where restaurant_id = v_restaurant_id and name = 'Platos';

  -- 5) Productos (products no tiene unique por nombre: se evita duplicar
  --    con not exists)
  insert into public.products (restaurant_id, category_id, name, price, position)
  select v_restaurant_id, p.category_id, p.name, p.price, p.position
  from (values
    (v_cat_bebidas, 'Agua QA',     1.25::numeric, 1),
    (v_cat_bebidas, 'Café QA',     1.75::numeric, 2),
    (v_cat_platos,  'Almuerzo QA', 6.00::numeric, 1),
    (v_cat_platos,  'Empanada QA', 2.50::numeric, 2)
  ) as p(category_id, name, price, position)
  where not exists (
    select 1 from public.products x
    where x.restaurant_id = v_restaurant_id
      and x.name = p.name
  );
end;
$$;
