import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { requireRouteAccess } from "@/lib/auth/require-route-access";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getDigitalMenuSettings } from "@/lib/queries/digital-menu";
import { DigitalMenuSettingsView } from "./_components/digital-menu-settings";

export const instant = false;
export const metadata: Metadata = { title: "Menú digital" };

/** M12 · Configuración › Menú digital (OWNER, ADMIN, BRANCH_MANAGER — same as can_manage_digital_menu). */
export default async function DigitalMenuSettingsPage() {
  await connection();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/settings/menu-digital");
  const settings = await getDigitalMenuSettings(session.restaurant.id);

  return (
    <main data-caja className="min-h-full bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3 md:px-5">
        <Link
          href="/settings"
          className="flex min-h-12 items-center gap-1.5 rounded-button px-2 text-body-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" /> Configuración
        </Link>
        <h1 className="text-body font-semibold text-foreground">/ Menú digital</h1>
      </div>
      <DigitalMenuSettingsView
        restaurantId={session.restaurant.id}
        restaurantName={session.restaurant.name}
        initialSettings={settings}
      />
    </main>
  );
}
