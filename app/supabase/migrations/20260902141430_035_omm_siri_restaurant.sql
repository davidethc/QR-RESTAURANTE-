
-- Restaurante real: Cafetería Omm Siri.
-- Reemplaza al demo conservando las cuentas del personal ya vinculadas.
update public.restaurants
set name        = 'Cafetería Omm Siri',
    slug        = 'omm-siri',
    description = 'Desayunos, almuerzos y postres caseros',
    phone       = '0991646999',
    address     = null,
    timezone    = 'America/Guayaquil',
    status      = 'ACTIVE'
where slug = 'demo';

-- Limpiar la carta de ejemplo
delete from public.products
where restaurant_id = (select id from public.restaurants where slug = 'omm-siri');

delete from public.categories
where restaurant_id = (select id from public.restaurants where slug = 'omm-siri');
