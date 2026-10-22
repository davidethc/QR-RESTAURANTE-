"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { createZone, deleteZone } from "@/lib/actions/zones";
import type { ZoneRow } from "@/lib/queries/zones";

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
        <Button className="min-h-11 rounded-xl">
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
            <Button type="submit" disabled={pending} className="min-h-11 rounded-xl">
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
}: {
  restaurantId: string;
  zones: ZoneRow[];
}) {
  const router = useRouter();
  return (
    <section className="flex flex-col gap-3" aria-labelledby="zones-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="zones-title" className="font-display text-lg font-semibold">
            Zonas y mesas
          </h2>
          <p className="text-body-sm text-muted-foreground">
            Dibuja el plano de cada zona y coloca sus mesas.
          </p>
        </div>
        <NewZoneDialog restaurantId={restaurantId} />
      </div>
      {zones.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Aún no hay zonas"
          description="Organiza las zonas y mesas de tu negocio. Crea y posiciona las mesas justo como las tienes en tu negocio."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre de zona</TableHead>
                <TableHead className="w-px text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zones.map((z) => (
                <TableRow key={z.id}>
                  <TableCell className="py-3 text-body font-medium">{z.name}</TableCell>
                  <TableCell className="flex justify-end gap-2 py-2">
                    <Button asChild variant="outline" className="min-h-11 rounded-xl">
                      <Link href={`/settings/zones/${z.id}`}>
                        <Pencil /> Editar
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
                        <Button variant="outline" className="min-h-11 rounded-xl">
                          <Trash2 /> Borrar
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
