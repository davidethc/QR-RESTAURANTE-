
-- TABLE SESSIONS: staff puede consultar sesiones de su restaurante
create policy table_sessions_select_staff on public.table_sessions
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

-- PRODUCT OPTION VALUES: staff consulta via producto
create policy product_option_values_select_members on public.product_option_values
  for select to authenticated
  using (
    exists (
      select 1
      from public.product_options po
      join public.products p on p.id = po.product_id
      where po.id = product_option_id
        and public.user_belongs_to_restaurant(p.restaurant_id)
    )
  );

-- ORDER ITEM OPTIONS: staff consulta via order_item -> order
create policy order_item_options_select_staff on public.order_item_options
  for select to authenticated
  using (
    exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_id
        and public.user_belongs_to_restaurant(o.restaurant_id)
    )
  );

-- PRODUCT OPTIONS: gestión por admin (V2 solo definió SELECT)
create policy product_options_insert_admin on public.product_options
  for insert to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (
          public.user_has_restaurant_role(p.restaurant_id, 'OWNER')
          or public.user_has_restaurant_role(p.restaurant_id, 'ADMIN')
        )
    )
  );

create policy product_options_update_admin on public.product_options
  for update to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (
          public.user_has_restaurant_role(p.restaurant_id, 'OWNER')
          or public.user_has_restaurant_role(p.restaurant_id, 'ADMIN')
        )
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (
          public.user_has_restaurant_role(p.restaurant_id, 'OWNER')
          or public.user_has_restaurant_role(p.restaurant_id, 'ADMIN')
        )
    )
  );

create policy product_options_delete_admin on public.product_options
  for delete to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (
          public.user_has_restaurant_role(p.restaurant_id, 'OWNER')
          or public.user_has_restaurant_role(p.restaurant_id, 'ADMIN')
        )
    )
  );

-- PRODUCT OPTION VALUES: gestión por admin
create policy product_option_values_insert_admin on public.product_option_values
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.product_options po
      join public.products p on p.id = po.product_id
      where po.id = product_option_id
        and (
          public.user_has_restaurant_role(p.restaurant_id, 'OWNER')
          or public.user_has_restaurant_role(p.restaurant_id, 'ADMIN')
        )
    )
  );

create policy product_option_values_update_admin on public.product_option_values
  for update to authenticated
  using (
    exists (
      select 1
      from public.product_options po
      join public.products p on p.id = po.product_id
      where po.id = product_option_id
        and (
          public.user_has_restaurant_role(p.restaurant_id, 'OWNER')
          or public.user_has_restaurant_role(p.restaurant_id, 'ADMIN')
        )
    )
  )
  with check (
    exists (
      select 1
      from public.product_options po
      join public.products p on p.id = po.product_id
      where po.id = product_option_id
        and (
          public.user_has_restaurant_role(p.restaurant_id, 'OWNER')
          or public.user_has_restaurant_role(p.restaurant_id, 'ADMIN')
        )
    )
  );

create policy product_option_values_delete_admin on public.product_option_values
  for delete to authenticated
  using (
    exists (
      select 1
      from public.product_options po
      join public.products p on p.id = po.product_id
      where po.id = product_option_id
        and (
          public.user_has_restaurant_role(p.restaurant_id, 'OWNER')
          or public.user_has_restaurant_role(p.restaurant_id, 'ADMIN')
        )
    )
  );
