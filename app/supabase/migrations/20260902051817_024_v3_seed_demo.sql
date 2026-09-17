
do $$
declare
  v_restaurant_id uuid;
  v_entradas uuid;
  v_fuertes uuid;
  v_bebidas uuid;
  v_postres uuid;
begin
  insert into public.restaurants (name, slug, description, phone, address, status)
  values (
    'Restaurante Demo',
    'demo',
    'Restaurante de demostración para probar el sistema QR',
    '+593 99 999 9999',
    'Av. Principal 123, Guayaquil',
    'ACTIVE'
  )
  returning id into v_restaurant_id;

  insert into public.categories (restaurant_id, name, description, position)
  values (v_restaurant_id, 'Entradas', 'Para empezar', 1)
  returning id into v_entradas;

  insert into public.categories (restaurant_id, name, description, position)
  values (v_restaurant_id, 'Platos fuertes', 'Nuestros principales', 2)
  returning id into v_fuertes;

  insert into public.categories (restaurant_id, name, description, position)
  values (v_restaurant_id, 'Bebidas', 'Frías y calientes', 3)
  returning id into v_bebidas;

  insert into public.categories (restaurant_id, name, description, position)
  values (v_restaurant_id, 'Postres', 'Para cerrar', 4)
  returning id into v_postres;

  insert into public.products (restaurant_id, category_id, name, description, price, position)
  values
    (v_restaurant_id, v_entradas, 'Ceviche de camarón', 'Camarón fresco, limón, cebolla morada', 8.50, 1),
    (v_restaurant_id, v_entradas, 'Empanadas de verde', 'Tres unidades rellenas de queso', 4.00, 2),
    (v_restaurant_id, v_entradas, 'Patacones con queso', 'Plátano verde frito', 5.00, 3),
    (v_restaurant_id, v_fuertes, 'Encebollado', 'Albacora, yuca y cebolla curtida', 7.00, 1),
    (v_restaurant_id, v_fuertes, 'Seco de pollo', 'Con arroz, menestra y maduro', 9.50, 2),
    (v_restaurant_id, v_fuertes, 'Arroz con camarón', 'Camarón salteado, verduras', 11.00, 3),
    (v_restaurant_id, v_fuertes, 'Churrasco', 'Lomo, huevo frito, arroz y papas', 12.50, 4),
    (v_restaurant_id, v_bebidas, 'Jugo natural', 'Maracuyá, mora o naranja', 3.00, 1),
    (v_restaurant_id, v_bebidas, 'Cola personal', 'Gaseosa 500ml', 2.00, 2),
    (v_restaurant_id, v_bebidas, 'Café pasado', 'Café de altura', 2.50, 3),
    (v_restaurant_id, v_postres, 'Tres leches', 'Porción individual', 4.50, 1),
    (v_restaurant_id, v_postres, 'Helado de paila', 'Dos bolas, sabor a elección', 3.50, 2);

  insert into public.tables (restaurant_id, number, name, status)
  values
    (v_restaurant_id, 1, 'Mesa 1', 'AVAILABLE'),
    (v_restaurant_id, 2, 'Mesa 2', 'AVAILABLE'),
    (v_restaurant_id, 3, 'Mesa 3', 'AVAILABLE'),
    (v_restaurant_id, 4, 'Mesa 4', 'AVAILABLE'),
    (v_restaurant_id, 5, 'Terraza', 'AVAILABLE');
end $$;
