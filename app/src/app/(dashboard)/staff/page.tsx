import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { getMyRestaurant, getRestaurantStaff } from "@/lib/queries/staff";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { isManager } from "@/lib/permissions";
import { AddStaffDialog } from "./_components/add-staff-dialog";
import { getCashRegisters } from "@/lib/queries/cash";
import { MEMBER_ROLES } from "@/lib/validations/staff";
import { Button } from "@/components/ui/button";
import { MemberFormSheet } from "./_components/member-form-sheet";
import { UnlockPinButton } from "./_components/unlock-pin-button";
import { StaffList } from "./_components/staff-list";

// Ver la nota en (dashboard)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Personal" };

export default async function StaffPage() {
  await connection();
  const session = await getMyRestaurant();
  if (!isManager(session.role)) redirect("/orders");

  const canCreate = isAdminClientConfigured();
  const [staff, registers] = await Promise.all([
    getRestaurantStaff(session.restaurant.id),
    canCreate ? getCashRegisters(session.restaurant.id) : Promise.resolve([]),
  ]);
  const assignableRoles =
    session.role === "OWNER"
      ? (["ADMIN", "WAITER", "KITCHEN"] as const)
      : (["WAITER", "KITCHEN"] as const);

  return (
    <main>
      <PageHeader
        title="Personal"
        description="Quién entra al panel y qué puede hacer."
        action={
          canCreate ? (
            <div className="flex flex-wrap gap-2">
              <MemberFormSheet
                restaurantId={session.restaurant.id}
                registers={registers}
                assignableRoles={MEMBER_ROLES.filter(
                  (role) => session.role === "OWNER" || role !== "ADMIN",
                )}
                trigger={<Button className="min-h-11">Agregar miembro</Button>}
              />
              <AddStaffDialog
                restaurantId={session.restaurant.id}
                roles={[...assignableRoles]}
              />
            </div>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-4 px-4 pb-12 md:px-8">
        {!canCreate && (
          <p className="rounded-card border border-dashed border-border bg-muted p-3 text-meta text-muted-foreground">
            Para crear cuentas o cambiar claves falta configurar{" "}
            <code className="font-mono text-foreground">
              SUPABASE_SECRET_KEY
            </code>{" "}
            en el servidor. Mientras tanto puedes cambiar roles y activar o
            desactivar personas.
          </p>
        )}
        <UnlockPinButton restaurantId={session.restaurant.id} />
        <StaffList
          staff={staff}
          roles={[...assignableRoles]}
          canResetPassword={canCreate}
        />
      </div>
    </main>
  );
}
