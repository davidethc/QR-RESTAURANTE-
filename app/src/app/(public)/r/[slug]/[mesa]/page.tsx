import type { Metadata } from "next";
import { getTableSession } from "@/lib/session";
import { getPublicMenu } from "@/lib/queries/menu";
import { MenuHeader } from "./_components/menu-header";
import { MenuBrowser } from "./_components/menu-browser";
import { ActiveOrdersBanner } from "./_components/active-orders-banner";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

function ScanRequired() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">Escanea el código de tu mesa</h1>
      <p className="max-w-xs text-muted-foreground">
        Para ver la carta y hacer tu pedido, escanea el código QR que está en
        tu mesa.
      </p>
    </main>
  );
}

export default async function MenuPage({
  params,
}: {
  params: Promise<{ slug: string; mesa: string }>;
}) {
  const { slug } = await params;
  const session = await getTableSession();

  if (!session || session.restaurantSlug !== slug) {
    return <ScanRequired />;
  }

  const menu = await getPublicMenu(slug);

  return (
    <main className="min-h-full">
      <MenuHeader
        restaurant={menu.restaurant}
        tableNumber={session.tableNumber}
      />
      <ActiveOrdersBanner slug={slug} tableNumber={session.tableNumber} />
      <MenuBrowser
        categories={menu.categories}
        slug={slug}
        tableNumber={session.tableNumber}
      />
    </main>
  );
}
