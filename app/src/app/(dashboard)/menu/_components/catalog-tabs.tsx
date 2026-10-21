"use client";

import { useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { ModifierBoard } from "./modifier-board";

export function CatalogTabs({ restaurantId, description, action, children }: { restaurantId: string; description: string; action: ReactNode; children: ReactNode }) {
  const [tab, setTab] = useState("products");
  return (
    <>
    <PageHeader title="Carta" description={tab === "products" ? description : undefined} action={tab === "products" ? action : undefined} />
    <Tabs value={tab} onValueChange={setTab} className="gap-6">
      <TabsList aria-label="Secciones del menú" className="mx-4 h-auto group-data-horizontal/tabs:h-auto max-w-full md:mx-8">
        <TabsTrigger value="products" className="min-h-11">Productos</TabsTrigger>
        <TabsTrigger value="modifiers" className="min-h-11">Personalizaciones</TabsTrigger>
      </TabsList>
      <TabsContent value="products">{children}</TabsContent>
      <TabsContent value="modifiers"><ModifierBoard restaurantId={restaurantId} /></TabsContent>
    </Tabs>
    </>
  );
}
