"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid, Loader2, Map as MapIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { createZone, deleteZone } from "@/lib/actions/zones";
import type { ZoneRow } from "@/lib/queries/zones";
import { SettingsCard } from "./settings-card";

function NewZoneDialog({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await createZone({ restaurantId, name });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.push(`/settings/zones/${r.data}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-11">
          <Plus /> Nueva zona
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Nueva zona</DialogTitle>
            <DialogDescription>
              Por ejemplo: comedor principal, barra, terraza, primer piso.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="zone-name">Nombre de zona</Label>
            <Input
              id="zone-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus
              className="min-h-11"
            />
            {error && (
              <p role="alert" className="text-meta text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending} className="min-h-11">
              {pending && <Loader2 className="animate-spin" />}
              Crear y dibujar plano
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ZonesSection({
  restaurantId,
  zones,
  className,
}: {
  restaurantId: string;
  zones: ZoneRow[];
  className?: string;
}) {
  const router = useRouter();
  return (
    <SettingsCard
      id="settings-zones"
      title="Zonas y mesas"
      help="Dibuja el plano de cada zona y coloca sus mesas como están en el local."
      icon={LayoutGrid}
      tone="info"
      className={className}
      aside={zones.length > 0 ? <NewZoneDialog restaurantId={restaurantId} /> : null}
    >
      {zones.length === 0 ? (
        <div className="rounded-control border border-dashed border-border bg-background">
          <EmptyState
            icon={LayoutGrid}
            title="Aún no hay zonas"
            description="Crea una zona (comedor, terraza, barra) y coloca sus mesas justo como las tienes en tu negocio."
            action={<NewZoneDialog restaurantId={restaurantId} />}
          />
        </div>
      ) : (
        <ul aria-label="Zonas" className="grid gap-3 md:grid-cols-2">
          {zones.map((z) => (
            <li
              key={z.id}
              className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-background p-3"
            >
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-control border border-border bg-card text-muted-foreground">
                <MapIcon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-semibold text-foreground">{z.name}</span>
                <span className="text-caption text-muted-foreground">
                  Plano de {z.gridCols} × {z.gridRows} celdas
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                <Button asChild variant="outline" className="min-h-11 bg-card">
                  <Link href={`/settings/zones/${z.id}`}>
                    <Pencil /> Editar plano
                  </Link>
                </Button>
                <ConfirmDialog
                  destructive
                  title={`¿Borrar la zona "${z.name}"?`}
                  description="Solo se puede borrar si no tiene mesas con sesión activa."
                  confirmLabel="Borrar"
                  successMessage="Zona borrada"
                  action={() => deleteZone(z.id)}
                  onSuccess={() => router.refresh()}
                  trigger={
                    <Button variant="outline" className="min-h-11 bg-card text-money-out-soft-foreground hover:text-money-out-soft-foreground" aria-label={`Borrar zona ${z.name}`}>
                      <Trash2 />
                      <span className="hidden sm:inline">Borrar</span>
                    </Button>
                  }
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
