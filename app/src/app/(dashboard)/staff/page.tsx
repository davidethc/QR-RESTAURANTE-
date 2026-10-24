import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import { connection } from "next/server";
import { KeyRound, TriangleAlert, UserCheck, UserPlus, Users } from "lucide-react";
import { StatusMetric, StatusPill, StatusStrip } from "@/components/shared/status-strip";
import { getMyRestaurant, getRestaurantStaff } from "@/lib/queries/staff";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { AddStaffDialog } from "./_components/add-staff-dialog";
import { getCashRegisters } from "@/lib/queries/cash";
import { MEMBER_ROLES } from "@/lib/validations/staff";
import { Button } from "@/components/ui/button";
import { MemberFormSheet } from "./_components/member-form-sheet";
import { UnlockPinButton } from "./_components/unlock-pin-button";
import { DevicesSection } from "./_components/devices-section";
import { StaffList } from "./_components/staff-list";

// Ver la nota en (dashboard)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Personal" };

export default async function StaffPage() {
  await connection();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/staff");

  const canCreate = isAdminClientConfigured();
  const [staff, registers] = await Promise.all([
    getRestaurantStaff(session.restaurant.id),
    canCreate ? getCashRegisters(session.restaurant.id) : Promise.resolve([]),
  ]);
  const assignableRoles =
    session.role === "OWNER"
      ? (["ADMIN", "WAITER", "KITCHEN"] as const)
      : (["WAITER", "KITCHEN"] as const);

  const activeCount = staff.filter((m) => m.status === "ACTIVE").length;
  const withoutPin = staff.filter((m) => m.status === "ACTIVE" && !m.has_pin).length;

  const addActions = canCreate ? (
    <>
      <MemberFormSheet
        restaurantId={session.restaurant.id}
        registers={registers}
        assignableRoles={MEMBER_ROLES.filter(
          (role) => session.role === "OWNER" || role !== "ADMIN",
        )}
        trigger={
          <Button className="min-h-11">
            <UserPlus /> Agregar miembro
          </Button>
        }
      />
      <AddStaffDialog
        restaurantId={session.restaurant.id}
        roles={[...assignableRoles]}
      />
    </>
  ) : undefined;

  return (
    <main data-caja className="min-h-full bg-background">
      <h1 className="sr-only">Personal</h1>
      <StatusStrip
        status={
          <StatusPill tone="info" icon={Users} title="Personal" detail="Quién entra al panel y qué puede hacer" />
        }
        metrics={
          <>
            <StatusMetric label="Miembros" value={String(staff.length)} tone="info" icon={Users} />
            <StatusMetric label="Con acceso" value={String(activeCount)} tone="money-in" icon={UserCheck} />
            <StatusMetric
              label="Sin PIN"
              value={String(withoutPin)}
              tone={withoutPin > 0 ? "attention" : "neutral"}
              icon={KeyRound}
            />
          </>
        }
        actions={addActions}
      />
      <div className="flex flex-col gap-4 px-4 pb-12 pt-4 md:px-5">
        {!canCreate && (
          <p className="flex items-start gap-2 rounded-card border border-attention-border bg-attention-soft p-3 text-meta text-attention-soft-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Para crear cuentas o cambiar claves falta configurar{" "}
              <code className="font-mono">SUPABASE_SECRET_KEY</code> en el
              servidor. Mientras tanto puedes cambiar roles y activar o
              desactivar personas.
            </span>
          </p>
        )}
        <div className="flex flex-col gap-4">
          <section aria-labelledby="staff-team" className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="staff-team" className="flex items-center gap-2 text-body font-semibold text-foreground">
                <Users className="size-4 text-muted-foreground" aria-hidden /> Equipo
              </h2>
              <p className="text-caption text-muted-foreground">Toca un rol para cambiarlo. Se guarda al momento.</p>
            </div>
            <StaffList
              staff={staff}
              roles={[...assignableRoles]}
              canResetPassword={canCreate}
              registers={registers}
              emptyAction={addActions}
            />
          </section>
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <DevicesSection restaurantId={session.restaurant.id} />
            <UnlockPinButton restaurantId={session.restaurant.id} />
          </div>
        </div>
      </div>
    </main>
  );
}
