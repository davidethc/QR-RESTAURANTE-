"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import {
  MemberFormSheet,
  type MemberFormExample,
  type MemberFormSheetProps,
} from "../(dashboard)/staff/_components/member-form-sheet";

const branches = [
  { id: "centro", name: "Centro", description: "Sucursal principal" },
  { id: "norte", name: "Norte" },
  { id: "sur", name: "Sur", description: "Sin cajas disponibles" },
];
const registers = [
  { id: "caja-centro", branchId: "centro", name: "Caja principal" },
  { id: "caja-norte", branchId: "norte", name: "Caja principal" },
];
const example: MemberFormExample = {
  firstName: "Alex",
  lastName: "Rivera",
  hasPin: true,
  emailEnabled: true,
  email: "alex@example.com",
  hasPassword: true,
  roles: ["WAITER", "CASHIER"],
  branchIds: ["centro"],
  registerIds: ["caja-centro"],
};

// TEMPORAL: datos ficticios y controles de revisión; no se conecta al personal.
export function MemberFormPreview() {
  const [loadState, setLoadState] =
    useState<MemberFormSheetProps["loadState"]>("ready");
  const [saveState, setSaveState] =
    useState<MemberFormSheetProps["saveState"]>("ready");
  const props = {
    branches,
    registers,
    currentBranchId: "centro",
    duplicateEmails: ["usado@example.com"],
    loadState,
    saveState,
    onRetry: () => setLoadState("ready"),
  };
  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <p className="text-meta text-muted-foreground">
        M00-T05 · Vista temporal para borrar · Datos ficticios
      </p>
      <h1 className="text-display font-semibold">Personal</h1>
      <p className="text-body text-muted-foreground">
        Revisar propuesta. Los cambios se pierden al cerrar. Correo duplicado de
        ejemplo: usado@example.com.
      </p>
      <div className="flex flex-wrap gap-3">
        <MemberFormSheet
          {...props}
          trigger={<Button className="min-h-11">Agregar miembro</Button>}
        />
        <MemberFormSheet
          {...props}
          mode="edit"
          initialMember={example}
          trigger={
            <Button variant="outline" className="min-h-11">
              Editar Alex Rivera
            </Button>
          }
        />
      </div>
      <details className="rounded-card border bg-card p-4">
        <summary className="min-h-11 cursor-pointer">
          Estados de ejemplo
        </summary>
        <div className="flex flex-wrap gap-3">
          {(["ready", "loading", "error"] as const).map((value, index) => (
            <Button
              key={value}
              variant="outline"
              className="min-h-11"
              aria-pressed={loadState === value}
              onClick={() => setLoadState(value)}
            >
              {["Carga normal", "Cargando", "Error de carga"][index]}
            </Button>
          ))}
          {(["ready", "saving", "error"] as const).map((value, index) => (
            <Button
              key={value}
              variant="outline"
              className="min-h-11"
              aria-pressed={saveState === value}
              onClick={() => setSaveState(value)}
            >
              {["Guardado normal", "Guardando", "Error de guardado"][index]}
            </Button>
          ))}
        </div>
      </details>
      <div className="rounded-card border bg-card">
        <EmptyState
          title="Agrega a tu equipo"
          description="Cada miembro tendrá su PIN, roles y sucursales asignadas."
        />
      </div>
    </main>
  );
}
