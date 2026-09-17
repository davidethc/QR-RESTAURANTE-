
-- Bucket público para fotos de productos, logos y portadas.
-- Lectura pública (la carta debe cargar rápido, sin firmar URLs).
-- Escritura solo OWNER/ADMIN del restaurante dueño de la carpeta.
-- Convención de ruta: <restaurant_id>/<archivo>

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Cualquiera puede ver las imágenes (incluido el cliente del QR)
create policy product_images_public_read
on storage.objects
for select
to public
using (bucket_id = 'product-images');

-- Solo admin/owner del restaurante puede subir a su carpeta
create policy product_images_insert_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (
    public.user_has_restaurant_role(
      ((storage.foldername(name))[1])::uuid, 'OWNER'
    )
    or public.user_has_restaurant_role(
      ((storage.foldername(name))[1])::uuid, 'ADMIN'
    )
  )
);

create policy product_images_update_admin
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (
    public.user_has_restaurant_role(
      ((storage.foldername(name))[1])::uuid, 'OWNER'
    )
    or public.user_has_restaurant_role(
      ((storage.foldername(name))[1])::uuid, 'ADMIN'
    )
  )
);

create policy product_images_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (
    public.user_has_restaurant_role(
      ((storage.foldername(name))[1])::uuid, 'OWNER'
    )
    or public.user_has_restaurant_role(
      ((storage.foldername(name))[1])::uuid, 'ADMIN'
    )
  )
);
