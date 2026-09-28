import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { getMyRestaurant, getRestaurantStaff } from "@/lib/queries/staff";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { isManager } from "@/lib/permissions";
import { AddStaffDialog } from "./_components/add-staff-dialog";
import { StaffList } from "./_components/staff-list";

// Ver la nota en (dashboard)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Personal" };

export default async function StaffPage() {
  await connection();
  const session = await getMyRestaurant();
  if (!isManager(session.role)) redirect("/orders");

  const staff = await getRestaurantStaff(session.restaurant.id);
  const canCreate = isAdminClientConfigured();
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
            <AddStaffDialog
              restaurantId={session.restaurant.id}
              roles={[...assignableRoles]}
            />
          ) : undefined
        }
      />
      <div className="flex flex-col gap-4 px-4 pb-10 sm:px-6">
        {!canCreate && (
          <p className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-meta text-muted-foreground">
            Para crear cuentas o cambiar claves falta configurar{" "}
            <code className="font-mono text-foreground">SUPABASE_SECRET_KEY</code> en
            el servidor. Mientras tanto puedes cambiar roles y activar o
            desactivar personas.
          </p>
        )}
        <StaffList staff={staff} roles={[...assignableRoles]} canResetPassword={canCreate} />
      </div>
    </main>
  );
}
