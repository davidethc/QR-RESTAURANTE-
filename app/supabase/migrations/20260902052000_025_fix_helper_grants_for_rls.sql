
-- Las políticas RLS invocan estas funciones con los permisos del usuario.
-- Sin EXECUTE para authenticated, todo SELECT del personal falla.
-- Se mantiene revocado para anon: el cliente anónimo nunca las necesita.
grant execute on function public.user_belongs_to_restaurant(uuid) to authenticated;
grant execute on function public.user_has_restaurant_role(uuid, public.member_role) to authenticated;
