import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTableSession, getTableSessionExpiresAt } from "@/lib/session";
import { getPublicMenu } from "@/lib/queries/menu";
import { getPublicProductDetails } from "@/lib/queries/public-product-details";
import { getTableStatus } from "@/lib/actions/table-status";
import { getSessionChannelName } from "@/lib/session-channel";
import { MenuHeader } from "./_components/menu-header";
import { MenuBrowser } from "./_components/menu-browser";
import { TableStatusProvider } from "./_components/table-status-provider";
import { ActiveOrderStrip } from "./_components/active-order-strip";
import { NameGate } from "./_components/name-gate";
import { AccountBar } from "./_components/account-bar";
import { SessionExpiryWatcher } from "./_components/session-expiry-watcher";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

export default async function MenuPage({
  params,
}: {
  params: Promise<{ slug: string; mesa: string }>;
}) {
  const { slug, mesa } = await params;
  // Las tres consultas se lanzan a la vez y se esperan después. Antes
  // los pedidos en curso salían en un `await` encadenado DESPUÉS de
  // resolver la carta (tres latencias en serie), así que el cliente no
  // veía ni un plato hasta que también habían vuelto sus pedidos.
  //
  // `getTableStatus` lee la cookie por su cuenta y devuelve
  // `{ ok: false }` si no hay sesión, sin llegar a tocar la base — por
  // eso se puede lanzar antes de saber si el cliente está en una mesa:
  // sin sesión no cuesta ni una petición de red.
  const menuPromise = getPublicMenu(slug);
  const statusPromise = getTableStatus();
  const session = await getTableSession();
  const menu = await menuPromise;
  const productDetails = await getPublicProductDetails(menu.restaurant.id, slug);

  /**
   * Dos modos, decididos por si hay sesión de mesa viva:
   *
   * - "mesa": el cliente escaneó el QR y está sentado. Pide normal y
   *   el pedido entra al panel del mesero en tiempo real.
   * - "carta": no hay sesión (se llevó la carta a casa, abrió un link
   *   compartido, o la sesión ya venció). Ve la carta completa y puede
   *   armar su pedido, pero se envía por WhatsApp — NO a una mesa.
   *
   * Deliberadamente la sesión es corta (1 h 30 min desde el escaneo,
   * ver lib/session.ts) y atada a la mesa: si no expirara, alguien
   * pidiendo desde su casa mandaría comida a una mesa donde ya está
   * sentada otra gente, y la cuenta le caería a ellos.
   */
  const inTable = Boolean(session && session.restaurantSlug === slug);

  // La mesa la decide el escaneo, nunca el número de la URL: el link
  // /r/<slug>/1 compartido no sirve para pedir a la Mesa 1 (sin cookie
  // se ve en modo carta). Si quien lo abre está sentado en otra mesa,
  // se le lleva a la suya para que la pantalla no diga un número falso.
  if (inTable && String(session!.tableNumber) !== mesa) {
    redirect(`/r/${slug}/${session!.tableNumber}`);
  }

  // Pedidos Y solicitudes en curso se resuelven en el servidor, para que
  // la franja de arriba y los botones de abajo salgan ya pintados en el
  // primer HTML y el celular no tenga que pedir nada al arrancar. A
  // partir de ahí los refresca la señal de Realtime del provider.
  const initialStatus = inTable ? await statusPromise : null;
  // El nombre del canal es un hash del token de sesión: el token en sí
  // nunca sale del servidor (la cookie es httpOnly). Ver session-channel.ts.
  const channelName = inTable ? await getSessionChannelName() : null;

  // Mesa recién escaneada y sin nombre: primero se le pone nombre (M11).
  // Si la consulta de la sesión falló (info null) no se bloquea la carta.
  if (inTable && initialStatus?.ok && initialStatus.data.info?.customerLabel === null) {
    return (
      <NameGate
        restaurantName={menu.restaurant.name}
        tableNumber={session!.tableNumber}
      />
    );
  }

  return (
    <main className="min-h-full">
      <MenuHeader
        restaurant={menu.restaurant}
        tableNumber={inTable ? session!.tableNumber : null}
      />
      {/* Un solo latido alimenta la franja de arriba y los botones de
          la barra inferior — son el mismo dato: qué tiene esta mesa en
          curso. Fuera de una mesa no se monta, así que la carta a
          domicilio no hace ni un sondeo. */}
      {inTable ? (
        <TableStatusProvider
          initialStatus={
            initialStatus?.ok
              ? initialStatus.data
              : { orders: [], calls: [], billPaid: false, info: null }
          }
          channelName={channelName}
        >
          <SessionExpiryWatcher
            expiresAt={getTableSessionExpiresAt(session!)}
          />
          <AccountBar tableNumber={session!.tableNumber} />
          <ActiveOrderStrip slug={slug} tableNumber={session!.tableNumber} />
          <MenuBrowser
            categories={menu.categories}
          productDetails={productDetails}
            slug={slug}
            tableNumber={session!.tableNumber}
            restaurantName={menu.restaurant.name}
            whatsappPhone={menu.restaurant.phone}
          />
        </TableStatusProvider>
      ) : (
        <MenuBrowser
          categories={menu.categories}
          productDetails={productDetails}
          slug={slug}
          tableNumber={null}
          restaurantName={menu.restaurant.name}
          whatsappPhone={menu.restaurant.phone}
        />
      )}
    </main>
  );
}
