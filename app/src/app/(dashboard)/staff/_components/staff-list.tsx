"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { notify } from "@/lib/notifications";
import { updateStaffMember } from "@/lib/actions/staff-admin";
import { cn } from "@/lib/utils";
import type { StaffMember } from "@/types/staff";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { ROLE_LABEL, type AssignableRole } from "./role-labels";

function StaffRow({
  member,
  roles,
  canResetPassword,
}: {
  member: StaffMember;
  roles: AssignableRole[];
  canResetPassword: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const name = member.full_name ?? member.email;
  const active = member.status === "ACTIVE";

  function save(role: AssignableRole, nextActive: boolean, message: string) {
    startTransition(async () => {
      const result = await updateStaffMember({
        memberId: member.member_id,
        role,
        active: nextActive,
      });
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      notify.success(message);
      router.refresh();
    });
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-3 px-4 py-3.5 transition-colors duration-150 sm:flex-row sm:items-center sm:gap-4 sm:px-5",
        !active && "opacity-60",
        isPending && "pointer-events-none opacity-70"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium text-foreground">
          {name}
          {member.is_me && <span className="font-normal text-muted-foreground"> (tú)</span>}
        </p>
        <p className="truncate text-meta text-muted-foreground">{member.email}</p>
      </div>

      {member.can_manage && member.role !== "OWNER" ? (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Select
            value={member.role}
            onValueChange={(v) =>
              save(v as AssignableRole, active, `${name} ahora es ${ROLE_LABEL[v as AssignableRole]}`)
            }
          >
            <SelectTrigger className="h-9 w-36" aria-label={`Rol de ${name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-meta text-muted-foreground">
            <Switch
              checked={active}
              onCheckedChange={(checked) =>
                save(
                  member.role as AssignableRole,
                  checked,
                  checked ? `${name} puede volver a entrar` : `${name} ya no puede entrar`
                )
              }
              aria-label={`Acceso de ${name}`}
            />
            {active ? "Activo" : "Sin acceso"}
          </label>
          {canResetPassword && active && (
            <ResetPasswordDialog memberId={member.member_id} name={name} email={member.email} />
          )}
        </div>
      ) : (
        <Badge variant="secondary" className="w-fit">
          {ROLE_LABEL[member.role]}
        </Badge>
      )}
    </li>
  );
}

export function StaffList({
  staff,
  roles,
  canResetPassword,
}: {
  staff: StaffMember[];
  roles: AssignableRole[];
  canResetPassword: boolean;
}) {
  if (staff.length === 0) {
    return <EmptyState icon={Users} title="Sin personal" description="Agrega a tu equipo para que entre al panel." />;
  }

  return (
    <ul className="divide-y divide-border rounded-card border border-border bg-card">
      {staff.map((member) => (
        <StaffRow
          key={member.member_id}
          member={member}
          roles={roles}
          canResetPassword={canResetPassword}
        />
      ))}
    </ul>
  );
}
