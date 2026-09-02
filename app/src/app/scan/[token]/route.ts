import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setTableSession } from "@/lib/session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El QR físico apunta aquí: /scan/<qr_token>.
 * Intercambia el token por una sesión de mesa, la guarda en cookie
 * httpOnly, y redirige a la URL limpia que el cliente ve y comparte.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!UUID_RE.test(token)) {
    redirect("/qr-invalido");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_table_qr", {
    p_qr_token: token,
  });

  if (error || !data?.length) {
    redirect("/qr-invalido");
  }

  const resolved = data[0];

  await setTableSession({
    sessionToken: resolved.session_token,
    restaurantSlug: resolved.restaurant_slug,
    tableNumber: resolved.table_number,
  });

  redirect(`/r/${resolved.restaurant_slug}/${resolved.table_number}`);
}
