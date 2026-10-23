"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, KeyRound, Loader2, Wallet, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/empty-state";
import { posPressable, toneSoft, type PosTone } from "@/components/shared/pos-tone";
import { notify } from "@/lib/notifications";
import { updateStaffMember } from "@/lib/actions/staff-admin";
import { cn } from "@/lib/utils";
import type { StaffMember } from "@/types/staff";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { ROLE_ICON, ROLE_LABEL, ROLE_TONE, EXTRA_ROLE_LABEL, type AssignableRole } from "./role-labels";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "·"
  );
}

function Chip({ tone, icon: Icon, children }: { tone: PosTone; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-caption font-semibold", toneSoft[tone])}>
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  );
}

function StaffCard({
  member,
  roles,
  canResetPassword,
  registerNames,
}: {
  member: StaffMember;
  roles: AssignableRole[];
  canResetPassword: boolean;
  registerNames: Map<string, string>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const name = member.full_name ?? member.email;
  const active = member.status === "ACTIVE";
  const editable = member.can_manage && member.role !== "OWNER";
  const extraRoles = member.roles.filter((r) => EXTRA_ROLE_LABEL[r] && r !== member.role);
  const registers = member.cash_register_ids.map((id) => registerNames.get(id)).filter((n): n is string => !!n);
  const RoleIcon = ROLE_ICON[member.role];

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
      aria-busy={isPending}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-card border border-border bg-card transition-opacity duration-150 motion-reduce:transition-none",
        isPending && "pointer-events-none opacity-70"
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <span
          aria-hidden
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full border text-body-sm font-semibold",
            active ? toneSoft[ROLE_TONE[member.role]] : "border-border bg-secondary text-muted-foreground"
          )}
        >
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold leading-tight text-foreground">
            {name}
            {member.is_me && <span className="font-normal text-muted-foreground"> (tú)</span>}
          </p>
          <p className="truncate text-meta text-muted-foreground">{member.email}</p>
        </div>
        {isPending ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Guardando" />
        ) : (
          <Chip tone={active ? "money-in" : "neutral"} icon={active ? Check : CircleAlert}>
            {active ? "Activo" : "Sin acceso"}
          </Chip>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
        {editable ? (
          <div role="radiogroup" aria-label={`Rol de ${name}`} className="flex flex-wrap gap-2">
            {roles.map((r) => {
              const selected = member.role === r;
              const Icon = ROLE_ICON[r];
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={isPending}
                  onClick={() => !selected && save(r, active, `${name} ahora es ${ROLE_LABEL[r]}`)}
                  className={cn(
                    posPressable,
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3 text-body-sm font-semibold",
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground hover:border-border-strong"
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {ROLE_LABEL[r]}
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <Chip tone={ROLE_TONE[member.role]} icon={RoleIcon}>
              {ROLE_LABEL[member.role]}
            </Chip>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Chip tone={member.has_pin ? "info" : "attention"} icon={KeyRound}>
            {member.has_pin ? "PIN asignado" : "Sin PIN"}
          </Chip>
          {member.cash_register_ids.length > 0 && (
            <Chip tone="money-in" icon={Wallet}>
              {registers.length > 0
                ? registers.join(", ")
                : `${member.cash_register_ids.length} ${member.cash_register_ids.length === 1 ? "caja" : "cajas"}`}
            </Chip>
          )}
          {extraRoles.map((r) => (
            <Chip key={r} tone="neutral">
              {EXTRA_ROLE_LABEL[r]}
            </Chip>
          ))}
        </div>
      </div>

      {editable && (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border bg-secondary/40 px-4 py-2.5">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-body-sm font-medium text-foreground">
            <Switch
              checked={active}
              disabled={isPending}
              onCheckedChange={(checked) =>
                save(
                  member.role as AssignableRole,
                  checked,
                  checked ? `${name} puede volver a entrar` : `${name} ya no puede entrar`
                )
              }
              aria-label={`Acceso de ${name}`}
            />
            {active ? "Puede entrar" : "Sin acceso"}
          </label>
          {canResetPassword && active && (
            <ResetPasswordDialog memberId={member.member_id} name={name} email={member.email} />
          )}
        </div>
      )}
    </li>
  );
}

export function StaffList({
  staff,
  roles,
  canResetPassword,
  registers,
  emptyAction,
}: {
  staff: StaffMember[];
  roles: AssignableRole[];
  canResetPassword: boolean;
  registers: readonly { id: string; name: string }[];
  emptyAction?: React.ReactNode;
}) {
  if (staff.length === 0) {
    return (
      <div className="rounded-card border border-border bg-card">
        <EmptyState icon={Users} title="Sin personal" description="Agrega a tu equipo para que entre al panel." action={emptyAction} />
      </div>
    );
  }

  const registerNames = new Map(registers.map((r) => [r.id, r.name]));

  return (
    <ul aria-label="Equipo" className="grid items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {staff.map((member) => (
        <StaffCard
          key={member.member_id}
          member={member}
          roles={roles}
          canResetPassword={canResetPassword}
          registerNames={registerNames}
        />
      ))}
    </ul>
  );
}
