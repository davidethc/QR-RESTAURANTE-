import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Store } from "lucide-react";
import { getDigitalMenu } from "@/lib/queries/digital-menu";
import { getPublicMenu } from "@/lib/queries/menu";
import { getPublicProductDetails } from "@/lib/queries/public-product-details";
import { SLUG_RE } from "@/lib/digital-menu";
import { MenuHeader } from "../../r/[slug]/[mesa]/_components/menu-header";
import { DigitalMenuApp } from "./_components/digital-menu-app";

export const instant = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Pedir · ${slug}` };
}

/**
 * M12 · Public delivery / pickup menu. No login: `proxy.ts` only matches the
 * staff area. The catalog comes from the cached `get_public_menu`; state,
 * times, payment methods and promotions from `get_digital_menu` on every load
 * (a pause must show up immediately).
 */
export default async function DigitalMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();

  const digital = await getDigitalMenu(slug);
  if (!digital) notFound();

  if (digital.state.status === "inactive") {
    return (
      <main className="flex min-h-dvh flex-col bg-background">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl border border-border bg-card">
            <Store aria-hidden className="size-8 text-primary" />
          </span>
          <h1 className="font-display text-title-lg font-bold text-foreground">{digital.restaurant.name}</h1>
          <p className="text-body text-muted-foreground">
            Este restaurante todavía no recibe pedidos a domicilio ni para recoger por aquí.
          </p>
        </div>
      </main>
    );
  }

  const menu = await getPublicMenu(slug);
  const productDetails = await getPublicProductDetails(menu.restaurant.id, slug);

  return (
    <main className="min-h-dvh bg-background">
      <MenuHeader
        restaurant={menu.restaurant}
        tableNumber={null}
        status={{
          open: digital.state.accepting_orders,
          label: digital.state.accepting_orders
            ? "Recibiendo pedidos"
            : digital.state.reason === "paused"
              ? "En pausa"
              : "Cerrado ahora",
        }}
      />
      <DigitalMenuApp
        slug={slug}
        digital={digital}
        categories={menu.categories}
        productDetails={productDetails}
        restaurantAddress={menu.restaurant.address}
      />
    </main>
  );
}
