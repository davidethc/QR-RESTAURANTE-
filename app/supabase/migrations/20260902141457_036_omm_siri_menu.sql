
do $$
declare
  r uuid;
  c_desayunos uuid; c_pizzas uuid; c_fuertes uuid; c_snacks uuid;
  c_postres uuid; c_bebidas uuid; c_porciones uuid; c_reuniones uuid;
begin
  select id into r from public.restaurants where slug = 'omm-siri';

  insert into public.categories (restaurant_id, name, description, position) values
    (r, 'Desayunos',            'Tigrillos, bolones, mote y sango', 1) returning id into c_desayunos;
  insert into public.categories (restaurant_id, name, description, position) values
    (r, 'Pizzas',               'Jamón, salami y queso', 2) returning id into c_pizzas;
  insert into public.categories (restaurant_id, name, description, position) values
    (r, 'Platos fuertes',       null, 3) returning id into c_fuertes;
  insert into public.categories (restaurant_id, name, description, position) values
    (r, 'Snacks y sánduches',   null, 4) returning id into c_snacks;
  insert into public.categories (restaurant_id, name, description, position) values
    (r, 'Postres',              null, 5) returning id into c_postres;
  insert into public.categories (restaurant_id, name, description, position) values
    (r, 'Bebidas',              null, 6) returning id into c_bebidas;
  insert into public.categories (restaurant_id, name, description, position) values
    (r, 'Porciones adicionales','Para acompañar tu plato', 7) returning id into c_porciones;
  insert into public.categories (restaurant_id, name, description, position) values
    (r, 'Menú para reuniones',  'Solo con reserva previa', 8) returning id into c_reuniones;

  -- DESAYUNOS
  insert into public.products (restaurant_id, category_id, name, description, price, position) values
    (r, c_desayunos, 'Tigrillo normal',                  null, 5.00, 1),
    (r, c_desayunos, 'Tigrillo mixto',                   null, 6.00, 2),
    (r, c_desayunos, 'Medio tigrillo normal',            null, 3.00, 3),
    (r, c_desayunos, 'Medio tigrillo mixto',             null, 3.50, 4),
    (r, c_desayunos, 'Medio tigrillo normal con bistec', null, 4.25, 5),
    (r, c_desayunos, 'Medio tigrillo mixto con bistec',  null, 4.75, 6),
    (r, c_desayunos, 'Bolón de chicharrón',                     null, 1.50, 7),
    (r, c_desayunos, 'Bolón de chicharrón + huevo',             null, 2.00, 8),
    (r, c_desayunos, 'Bolón de chicharrón + huevo + bistec',    null, 3.25, 9),
    (r, c_desayunos, 'Bolón de maduro',                         null, 1.50, 10),
    (r, c_desayunos, 'Mote pillo con queso',            null, 2.50, 11),
    (r, c_desayunos, 'Mote pillo + filete de cerdo',    null, 4.00, 12),
    (r, c_desayunos, 'Mote con chicharrón',             'Mote sucio', 3.00, 13),
    (r, c_desayunos, 'Sango con huevo',                 null, 2.50, 14),
    (r, c_desayunos, 'Sango con chicharrón y huevo',    null, 3.00, 15),
    (r, c_desayunos, 'Tortillas de choclo con queso',   null, 1.25, 16);

  -- PIZZAS
  insert into public.products (restaurant_id, category_id, name, description, price, position) values
    (r, c_pizzas, 'Pizza pequeña', 'Jamón, salami y queso',  8.00, 1),
    (r, c_pizzas, 'Pizza mediana', 'Jamón, salami y queso', 10.00, 2);

  -- PLATOS FUERTES
  insert into public.products (restaurant_id, category_id, name, description, price, position) values
    (r, c_fuertes, 'Lasaña de pollo',                    null, 5.50, 1),
    (r, c_fuertes, 'Crepe de pollo con champiñones',     null, 4.25, 2),
    (r, c_fuertes, 'Espagueti con pollo y champiñones',  null, 5.50, 3),
    (r, c_fuertes, 'Filete de pollo + ensalada fresca',  null, 4.50, 4),
    (r, c_fuertes, 'Ensalada fresca de verduras',        null, 3.00, 5);

  -- SNACKS Y SÁNDUCHES
  insert into public.products (restaurant_id, category_id, name, description, price, position) values
    (r, c_snacks, 'Empanada de verde',  null, 1.50, 1),
    (r, c_snacks, 'Empanada de yuca',   null, 1.50, 2),
    (r, c_snacks, 'Prensado mixto',     null, 1.50, 3),
    (r, c_snacks, 'Sánduche de pollo',  null, 4.00, 4);

  -- POSTRES
  insert into public.products (restaurant_id, category_id, name, description, price, position) values
    (r, c_postres, 'Crepe de frutas + helado',  null, 3.00, 1),
    (r, c_postres, 'Crepe de Nutella + helado', null, 3.50, 2),
    (r, c_postres, 'Ensalada de frutas',        null, 3.25, 3),
    (r, c_postres, 'Torta de harina de almendras y chocolate',
       'Relleno de dátiles, chocolate al 70% y arándanos. Sin gluten', 2.75, 4),
    (r, c_postres, 'Copa de fresas con helado',   null, 2.00, 5),
    (r, c_postres, 'Bananas flameadas con helado',null, 3.00, 6);

  -- BEBIDAS
  insert into public.products (restaurant_id, category_id, name, description, price, position) values
    (r, c_bebidas, 'Café filtrado',              null, 0.50, 1),
    (r, c_bebidas, 'Café tinto',                 null, 1.25, 2),
    (r, c_bebidas, 'Café con leche',             null, 1.25, 3),
    (r, c_bebidas, 'Capuchino',                  null, 1.75, 4),
    (r, c_bebidas, 'Chocolate amargo con leche', null, 1.75, 5),
    (r, c_bebidas, 'Agua aromática',             null, 0.50, 6),
    (r, c_bebidas, 'Té helado',                  null, 1.00, 7),
    (r, c_bebidas, 'Jugos en agua',              null, 1.50, 8),
    (r, c_bebidas, 'Batido de frutas en leche',  null, 2.00, 9),
    (r, c_bebidas, 'Colas',                      null, 1.00, 10),
    (r, c_bebidas, 'Agua',                       null, 0.75, 11),
    (r, c_bebidas, 'Agua con gas',               null, 1.00, 12);

  -- PORCIONES ADICIONALES
  insert into public.products (restaurant_id, category_id, name, description, price, position) values
    (r, c_porciones, 'Porción de queso mozzarella', null, 1.50, 1),
    (r, c_porciones, 'Porción de queso fresco',     null, 0.50, 2),
    (r, c_porciones, 'Porción de chicharrón',       null, 1.50, 3),
    (r, c_porciones, 'Porción de bistec de carne',  null, 1.25, 4);

  -- MENÚ PARA REUNIONES
  insert into public.products (restaurant_id, category_id, name, description, price, position) values
    (r, c_reuniones, 'Parrillada Junior', 'Requiere reserva previa', 7.00, 1);
end $$;
