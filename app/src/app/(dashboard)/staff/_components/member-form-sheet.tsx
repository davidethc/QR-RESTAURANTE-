"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Delete, KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { RecoverableError } from "@/components/shared/recoverable-error";

const roles = [
  [
    "SUPER_ADMIN",
    "Super administrador",
    "El dueño del negocio (no se asigna manualmente)",
  ],
  ["ADMIN", "Administrador", "Puede ver y controlar casi todo el negocio"],
  [
    "MEMBERS_ADMIN",
    "Administrador de miembros",
    "Puede agregar, editar y eliminar miembros, pero no otros administradores",
  ],
  [
    "BRANCH_MANAGER",
    "Gestor de sucursal",
    "Puede editar los datos de la sucursal, pero no crear ni eliminar sucursales",
  ],
  [
    "MENU_MANAGER",
    "Gestor de menú",
    "Puede agregar, editar y eliminar productos, personalizaciones y promociones",
  ],
  [
    "CASHIER",
    "Cajero",
    "Tiene acceso al panel de pedidos y puede cambiar la disponibilidad de productos (requiere caja asignada)",
  ],
  [
    "WAITER",
    "Mesero",
    "Tiene acceso al panel de mesas y puede cambiar la disponibilidad de productos",
  ],
  [
    "KITCHEN",
    "Cocinero",
    "Tiene acceso a las comandas digitales y puede cambiar la disponibilidad de productos",
  ],
] as const;

type MemberRole = (typeof roles)[number][0];
export type MemberFormExample = {
  firstName: string;
  lastName: string;
  hasPin: boolean;
  emailEnabled: boolean;
  email: string;
  hasPassword: boolean;
  roles: MemberRole[];
  branchIds: string[];
  registerIds: string[];
};
export type MemberFormSheetProps = {
  trigger: ReactNode;
  mode?: "create" | "edit";
  initialMember?: MemberFormExample;
  branches: { id: string; name: string; description?: string }[];
  registers: { id: string; branchId: string; name: string }[];
  currentBranchId?: string;
  /** Only UI examples: no lookup or persistence is performed. */
  duplicateEmails?: string[];
  loadState?: "ready" | "loading" | "error";
  saveState?: "ready" | "saving" | "error";
  onRetry?: () => void;
};

function Choice({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <FieldLabel
      htmlFor={id}
      className={`min-h-11 w-full items-start gap-3 rounded-control px-2 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${disabled ? "cursor-default bg-muted" : "cursor-pointer hover:bg-muted"}`}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
        className="mt-0.5 size-5 after:-inset-3"
      />
      <span className="min-w-0 flex-1">
        <span id={`${id}-title`} className="block text-body font-medium">
          {title}
        </span>
        {description && (
          <span
            id={`${id}-description`}
            className="mt-1 block text-body-sm font-normal leading-relaxed text-muted-foreground"
          >
            {description}
          </span>
        )}
      </span>
    </FieldLabel>
  );
}

function PinDialog({
  assigned,
  invalid,
  errorId,
  onAssign,
}: {
  assigned: boolean;
  invalid: boolean;
  errorId: string;
  onAssign: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [digits, setDigits] = useState("");
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function changeOpen(value: boolean) {
    setDigits("");
    setError(false);
    setOpen(value);
  }
  function confirm() {
    if (!/^\d{4}$/.test(digits)) {
      setError(true);
      input.current?.focus();
      return;
    }
    onAssign();
    changeOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
        >
          <KeyRound aria-hidden />
          {assigned ? "Cambiar PIN" : "Asignar PIN"}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Asignar PIN de acceso</DialogTitle>
          <DialogDescription>
            Escribe cuatro números o usa el teclado.
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={error}>
          <FieldLabel htmlFor={id}>PIN de 4 dígitos</FieldLabel>
          <Input
            ref={input}
            id={id}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={digits}
            className="min-h-11 text-center text-title tracking-widest"
            aria-invalid={error}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              setDigits(event.target.value.replace(/\D/g, "").slice(0, 4));
              setError(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                confirm();
              }
            }}
          />
          {error && (
            <FieldError id={`${id}-error`}>
              Ingresa exactamente 4 dígitos.
            </FieldError>
          )}
        </Field>
        <div className="grid grid-cols-3 gap-2" aria-label="Teclado numérico">
          {[
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "Limpiar",
            "0",
            "Borrar",
          ].map((key) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              className="min-h-12 text-body-lg"
              aria-label={key === "Borrar" ? "Borrar último dígito" : key}
              onClick={() => {
                setError(false);
                setDigits((value) =>
                  key === "Limpiar"
                    ? ""
                    : key === "Borrar"
                      ? value.slice(0, -1)
                      : (value + key).slice(0, 4),
                );
              }}
            >
              {key === "Borrar" ? <Delete aria-hidden /> : key}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => changeOpen(false)}
          >
            Cancelar
          </Button>
          <Button type="button" className="min-h-11" onClick={confirm}>
            Confirmar PIN
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Visual prototype. Credentials are never returned, logged or persisted. */
export function MemberFormSheet(props: MemberFormSheetProps) {
  const [open, setOpen] = useState(false);
  const [discard, setDiscard] = useState(false);
  const dirty = useRef(false);
  function requestClose(value: boolean) {
    if (!value && props.saveState === "saving") return;
    if (!value && dirty.current) setDiscard(true);
    else {
      dirty.current = false;
      setOpen(value);
    }
  }
  return (
    <Sheet open={open} onOpenChange={requestClose}>
      <SheetTrigger asChild>{props.trigger}</SheetTrigger>
      <SheetContent
        showCloseButton={false}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none lg:data-[side=right]:w-[min(64rem,100%)]"
      >
        {open && (
          <MemberForm
            {...props}
            markDirty={() => {
              dirty.current = true;
            }}
            onCancel={() => requestClose(false)}
          />
        )}
        <AlertDialog open={discard} onOpenChange={setDiscard}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Descartar los cambios?</AlertDialogTitle>
              <AlertDialogDescription>
                Los cambios de este formulario no se guardarán.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11">
                Seguir editando
              </AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                className="min-h-11"
                onClick={() => {
                  dirty.current = false;
                  setDiscard(false);
                  setOpen(false);
                }}
              >
                Descartar cambios
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

function MemberForm({
  mode = "create",
  initialMember,
  branches,
  registers,
  currentBranchId,
  duplicateEmails = [],
  loadState = "ready",
  saveState = "ready",
  onRetry,
  markDirty,
  onCancel,
}: MemberFormSheetProps & { markDirty: () => void; onCancel: () => void }) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const [member, setMember] = useState<MemberFormExample>(
    () =>
      initialMember ?? {
        firstName: "",
        lastName: "",
        hasPin: false,
        emailEnabled: false,
        email: "",
        hasPassword: false,
        roles: [],
        branchIds:
          currentBranchId &&
          branches.some((branch) => branch.id === currentBranchId)
            ? [currentBranchId]
            : [],
        registerIds: [],
      },
  );
  const [password, setPassword] = useState("");
  const [changePassword, setChangePassword] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [withoutAccess, setWithoutAccess] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const saving = saveState === "saving";
  const cashier = member.roles.includes("CASHIER");
  const selectedBranches = branches.filter((branch) =>
    member.branchIds.includes(branch.id),
  );
  const availableRegisters = registers.filter((register) =>
    selectedBranches.some((branch) => branch.id === register.branchId),
  );
  const selectedRegisters = availableRegisters.filter((register) =>
    member.registerIds.includes(register.id),
  );
  const needsPassword =
    member.emailEnabled && (!member.hasPassword || changePassword);
  const errors = {
    firstName: member.firstName.trim() ? "" : "Completa este campo.",
    lastName: member.lastName.trim() ? "" : "Completa este campo.",
    pin: member.hasPin ? "" : "Asigna un PIN de 4 dígitos.",
    email: !member.emailEnabled
      ? ""
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email.trim())
        ? "Escribe un correo válido."
        : duplicateEmails.some(
              (email) =>
                email.toLowerCase() === member.email.trim().toLowerCase(),
            )
          ? "Ya existe una cuenta con este correo. Usa su cuenta existente."
          : "",
    password: needsPassword && !password ? "Completa este campo." : "",
    registers:
      cashier && !selectedRegisters.length
        ? "Asigna al menos una caja para el rol Cajero."
        : "",
  };
  function update(patch: Partial<MemberFormExample>) {
    setMember((value) => ({ ...value, ...patch }));
    markDirty();
    setFeedback(false);
  }
  function toggle(values: string[], value: string, checked: boolean) {
    return checked
      ? [...values, value]
      : values.filter((item) => item !== value);
  }
  function simulateSave() {
    setWithoutAccess(false);
    setFeedback(saveState !== "error");
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setAttempted(true);
    if (Object.values(errors).some(Boolean)) {
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
    if (!selectedBranches.length) setWithoutAccess(true);
    else simulateSave();
  }
  const preview = (
    <aside
      ref={previewRef}
      id={`${id}-preview`}
      tabIndex={-1}
      aria-label="Vista previa del miembro"
      className="min-w-0 scroll-mt-6 rounded-card border bg-background p-6 outline-none focus-visible:ring-2 focus-visible:ring-ring lg:sticky lg:top-6"
    >
      <p className="mb-6 text-meta text-muted-foreground">
        Así quedará su acceso
      </p>
      <Avatar className="mb-4 size-14">
        <AvatarFallback className="bg-primary-soft text-title text-primary">
          {[member.firstName[0], member.lastName[0]]
            .filter(Boolean)
            .join("")
            .toUpperCase() || "·"}
        </AvatarFallback>
      </Avatar>
      <h3 className="break-words text-title font-semibold">
        {[member.firstName.trim(), member.lastName.trim()]
          .filter(Boolean)
          .join(" ") || "Nombre del miembro"}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {member.roles.length ? (
          roles
            .filter(([role]) => member.roles.includes(role))
            .map(([role, label]) => (
              <Badge
                key={role}
                className="h-auto whitespace-normal bg-primary-soft text-primary"
              >
                {label}
              </Badge>
            ))
        ) : (
          <Badge variant="secondary">Sin roles asignados</Badge>
        )}
      </div>
      <div className="my-5 border-t" />
      <h4 className="font-medium">Sucursales</h4>
      <p className="mt-2 break-words text-body-sm text-muted-foreground">
        {selectedBranches.map((branch) => branch.name).join(", ") ||
          "Sin acceso"}
      </p>
      {cashier && (
        <>
          <h4 className="mt-4 font-medium">Cajas</h4>
          <p className="mt-2 break-words text-body-sm text-muted-foreground">
            {selectedRegisters
              .map(
                (register) =>
                  `${register.name} · ${branches.find((branch) => branch.id === register.branchId)?.name}`,
              )
              .join(", ") || "Sin cajas asignadas"}
          </p>
        </>
      )}
      <div className="my-5 border-t" />
      <h4 className="font-medium">Acceso</h4>
      <p className="mt-2 text-body-sm text-muted-foreground">
        {member.hasPin ? "PIN asignado" : "PIN pendiente"}
      </p>
      <p className="mt-1 break-words text-body-sm text-muted-foreground">
        {member.emailEnabled
          ? member.email || "Correo pendiente"
          : "Sin correo"}
      </p>
      {member.emailEnabled && (
        <p className="mt-2 text-caption text-muted-foreground">
          El correo requiere confirmación.
        </p>
      )}
      <p className="mt-4 text-body-sm text-muted-foreground">
        El PIN y la contraseña nunca aparecen en esta vista.
      </p>
    </aside>
  );
  return (
    <>
      <SheetHeader className="shrink-0 border-b p-5 pr-18 sm:p-6 sm:pr-20">
        <SheetTitle className="text-title font-semibold">
          {mode === "edit" ? "Editar miembro" : "Agregar miembro"}
        </SheetTitle>
        <SheetDescription>
          Define quién puede entrar y qué podrá hacer en cada sucursal.
        </SheetDescription>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cerrar formulario"
          disabled={saving}
          className="absolute right-4 top-4 min-h-11 min-w-11"
          onClick={onCancel}
        >
          <X aria-hidden />
        </Button>
      </SheetHeader>
      {loadState === "loading" ? (
        <div aria-busy="true" className="space-y-6 p-6">
          <p role="status">Cargando…</p>
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-14 w-full" />
          ))}
        </div>
      ) : loadState === "error" ? (
        <div className="[&_button]:min-h-11">
          <RecoverableError
            title="No pudimos cargar el miembro"
            description="Reintenta para recuperar sus datos antes de editar."
            onRetry={() => onRetry?.()}
          />
        </div>
      ) : (
        <form
          ref={formRef}
          noValidate
          onSubmit={submit}
          aria-busy={saving}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            data-member-scroll
          >
            <div className="grid items-start gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <fieldset disabled={saving} className="min-w-0 space-y-7">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 lg:hidden"
                  onClick={() => {
                    previewRef.current?.scrollIntoView({ block: "start" });
                    previewRef.current?.focus({ preventScroll: true });
                  }}
                >
                  Ver vista previa
                </Button>
                <section aria-labelledby={`${id}-identity`}>
                  <h3
                    id={`${id}-identity`}
                    className="mb-4 text-title-sm font-semibold"
                  >
                    Datos del miembro
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(["firstName", "lastName"] as const).map((key) => (
                      <Field
                        key={key}
                        data-invalid={attempted && !!errors[key]}
                      >
                        <FieldLabel htmlFor={`${id}-${key}`}>
                          {key === "firstName" ? "Nombre" : "Apellido"}
                        </FieldLabel>
                        <Input
                          id={`${id}-${key}`}
                          required
                          autoComplete={
                            key === "firstName" ? "given-name" : "family-name"
                          }
                          className="min-h-11"
                          value={member[key]}
                          onChange={(event) =>
                            update({ [key]: event.target.value })
                          }
                          aria-invalid={attempted && !!errors[key]}
                          aria-describedby={
                            attempted && errors[key]
                              ? `${id}-${key}-error`
                              : undefined
                          }
                        />
                        {attempted && errors[key] && (
                          <FieldError id={`${id}-${key}-error`}>
                            {errors[key]}
                          </FieldError>
                        )}
                      </Field>
                    ))}
                  </div>
                </section>
                <section
                  className="space-y-4 border-t pt-6"
                  aria-labelledby={`${id}-access`}
                >
                  <h3
                    id={`${id}-access`}
                    className="text-title-sm font-semibold"
                  >
                    Acceso al local
                  </h3>
                  <p className="text-body-sm text-muted-foreground">
                    Este PIN se usa para iniciar sesión en los dispositivos del
                    local.
                  </p>
                  <Field>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Badge
                        variant="secondary"
                        className={
                          member.hasPin
                            ? "bg-primary-soft text-primary"
                            : "bg-warning-soft text-warning-soft-foreground"
                        }
                      >
                        {member.hasPin
                          ? "PIN asignado · ••••"
                          : "PIN pendiente"}
                      </Badge>
                      <PinDialog
                        assigned={member.hasPin}
                        invalid={attempted && !!errors.pin}
                        errorId={`${id}-pin-error`}
                        onAssign={() => update({ hasPin: true })}
                      />
                    </div>
                    {attempted && errors.pin && (
                      <FieldError id={`${id}-pin-error`}>
                        {errors.pin}
                      </FieldError>
                    )}
                  </Field>
                  <FieldLabel
                    htmlFor={`${id}-email-enabled`}
                    className="min-h-11 w-full cursor-pointer items-center gap-4 py-3"
                  >
                    <Switch
                      id={`${id}-email-enabled`}
                      checked={member.emailEnabled}
                      onCheckedChange={(checked) => {
                        update({ emailEnabled: checked });
                        if (!checked) {
                          setPassword("");
                          setChangePassword(false);
                        }
                      }}
                      className="after:-inset-y-3.5"
                    />
                    <span className="flex-1">
                      <span className="block text-body">
                        Permitir acceso con correo electrónico
                      </span>
                      <span className="mt-1 block text-body-sm font-normal text-muted-foreground">
                        El PIN sigue siendo obligatorio.
                      </span>
                    </span>
                  </FieldLabel>
                  {member.emailEnabled && (
                    <div className="space-y-4">
                      <Field data-invalid={attempted && !!errors.email}>
                        <FieldLabel htmlFor={`${id}-email`}>
                          Correo electrónico
                        </FieldLabel>
                        <Input
                          id={`${id}-email`}
                          type="email"
                          autoComplete="email"
                          required
                          className="min-h-11"
                          value={member.email}
                          onChange={(event) =>
                            update({ email: event.target.value })
                          }
                          aria-invalid={attempted && !!errors.email}
                          aria-describedby={`${id}-email-help${attempted && errors.email ? ` ${id}-email-error` : ""}`}
                        />
                        <FieldDescription id={`${id}-email-help`}>
                          Enviaremos un correo para confirmar la cuenta.
                        </FieldDescription>
                        {attempted && errors.email && (
                          <FieldError id={`${id}-email-error`}>
                            {errors.email}
                          </FieldError>
                        )}
                      </Field>
                      {member.hasPassword && !changePassword ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-body-sm text-muted-foreground">
                            Contraseña actual conservada
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            onClick={() => {
                              setChangePassword(true);
                              markDirty();
                            }}
                          >
                            Cambiar contraseña
                          </Button>
                        </div>
                      ) : (
                        <Field data-invalid={attempted && !!errors.password}>
                          <FieldLabel htmlFor={`${id}-password`}>
                            {member.hasPassword
                              ? "Nueva contraseña"
                              : "Contraseña"}
                          </FieldLabel>
                          <Input
                            id={`${id}-password`}
                            type="password"
                            autoComplete="new-password"
                            required
                            className="min-h-11"
                            value={password}
                            onChange={(event) => {
                              setPassword(event.target.value);
                              markDirty();
                              setFeedback(false);
                            }}
                            aria-invalid={attempted && !!errors.password}
                            aria-describedby={
                              attempted && errors.password
                                ? `${id}-password-error`
                                : undefined
                            }
                          />
                          {attempted && errors.password && (
                            <FieldError id={`${id}-password-error`}>
                              {errors.password}
                            </FieldError>
                          )}
                          {member.hasPassword && (
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-11"
                              onClick={() => {
                                setChangePassword(false);
                                setPassword("");
                              }}
                            >
                              Conservar contraseña actual
                            </Button>
                          )}
                        </Field>
                      )}
                    </div>
                  )}
                </section>
                <fieldset className="border-t pt-6">
                  <legend className="sr-only">Roles combinables</legend>
                  <h3 className="text-title-sm font-semibold">Roles</h3>
                  <p className="mb-3 mt-2 text-body-sm text-muted-foreground">
                    Puedes combinar varios roles. Sus permisos se suman.
                  </p>
                  <div className="divide-y">
                    {roles.map(([role, title, description]) => (
                      <Choice
                        key={role}
                        id={`${id}-${role}`}
                        title={title}
                        description={description}
                        checked={member.roles.includes(role)}
                        disabled={role === "SUPER_ADMIN"}
                        onChange={(checked) =>
                          update({
                            roles: toggle(
                              member.roles,
                              role,
                              checked,
                            ) as MemberRole[],
                            ...(role === "CASHIER" && !checked
                              ? { registerIds: [] }
                              : {}),
                          })
                        }
                      />
                    ))}
                  </div>
                  {!member.roles.length && (
                    <p className="mt-3 text-body-sm text-muted-foreground">
                      Sin roles asignados
                    </p>
                  )}
                </fieldset>
                <fieldset
                  className="border-t pt-6"
                  aria-describedby={
                    !selectedBranches.length
                      ? `${id}-branch-warning`
                      : undefined
                  }
                >
                  <legend className="sr-only">Sucursales con acceso</legend>
                  <h3 className="mb-3 text-title-sm font-semibold">
                    Sucursales con acceso
                  </h3>
                  {branches.map((branch) => (
                    <Choice
                      key={branch.id}
                      id={`${id}-branch-${branch.id}`}
                      title={branch.name}
                      description={branch.description}
                      checked={member.branchIds.includes(branch.id)}
                      onChange={(checked) => {
                        const branchIds = toggle(
                          member.branchIds,
                          branch.id,
                          checked,
                        );
                        update({
                          branchIds,
                          registerIds: member.registerIds.filter((registerId) =>
                            registers.some(
                              (register) =>
                                register.id === registerId &&
                                branchIds.includes(register.branchId),
                            ),
                          ),
                        });
                      }}
                    />
                  ))}
                  {!selectedBranches.length && (
                    <p
                      id={`${id}-branch-warning`}
                      className="mt-3 rounded-control bg-warning-soft p-4 text-body-sm text-warning-soft-foreground"
                    >
                      Sin una sucursal asignada, este miembro no podrá ingresar.
                    </p>
                  )}
                </fieldset>
                {cashier && (
                  <fieldset
                    tabIndex={-1}
                    aria-invalid={attempted && !!errors.registers}
                    aria-describedby={`${id}-register-help${attempted && errors.registers ? ` ${id}-register-error` : ""}`}
                    className="border-t pt-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <legend className="sr-only">Cajas asignadas</legend>
                    <h3 className="text-title-sm font-semibold">
                      Cajas asignadas
                    </h3>
                    <p
                      id={`${id}-register-help`}
                      className="my-3 text-body-sm text-muted-foreground"
                    >
                      Selecciona al menos una caja de sus sucursales.
                    </p>
                    {!selectedBranches.length && (
                      <p className="text-body-sm text-muted-foreground">
                        Selecciona una sucursal para ver sus cajas.
                      </p>
                    )}
                    {selectedBranches.map((branch) => (
                      <div key={branch.id}>
                        {!availableRegisters.some(
                          (register) => register.branchId === branch.id,
                        ) && (
                          <p className="rounded-control bg-muted p-3 text-body-sm">
                            {branch.name}: No hay cajas disponibles en esta
                            sucursal. Solicita una caja al administrador o
                            retira el rol Cajero.
                          </p>
                        )}
                      </div>
                    ))}
                    {availableRegisters.map((register) => (
                      <Choice
                        key={register.id}
                        id={`${id}-register-${register.id}`}
                        title={`${register.name} · ${branches.find((branch) => branch.id === register.branchId)?.name}`}
                        checked={member.registerIds.includes(register.id)}
                        onChange={(checked) =>
                          update({
                            registerIds: toggle(
                              member.registerIds,
                              register.id,
                              checked,
                            ),
                          })
                        }
                      />
                    ))}
                    {attempted && errors.registers && (
                      <FieldError id={`${id}-register-error`}>
                        {errors.registers}
                      </FieldError>
                    )}
                  </fieldset>
                )}
              </fieldset>
              {preview}
            </div>
          </div>
          <div className="shrink-0 space-y-3 border-t bg-card p-4 sm:px-6">
            {saveState === "error" && (
              <p
                role="alert"
                className="rounded-control bg-destructive-soft p-3 text-body-sm text-destructive"
              >
                No pudimos guardar el miembro. Tu información sigue aquí; vuelve
                a intentarlo.
              </p>
            )}
            {feedback && (
              <p
                role="status"
                className="rounded-control bg-primary-soft p-3 text-body-sm text-primary"
              >
                {mode === "edit" ? "Cambios revisados" : "Miembro revisado"} ·
                Confirmación de ejemplo, sin guardado real.
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                className="min-h-11 flex-1 sm:flex-none"
                onClick={onCancel}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="min-h-11 flex-1 sm:flex-none"
              >
                {saving
                  ? "Guardando…"
                  : mode === "edit"
                    ? "Guardar cambios"
                    : "Agregar miembro"}
              </Button>
            </div>
          </div>
        </form>
      )}
      <AlertDialog open={withoutAccess} onOpenChange={setWithoutAccess}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar sin acceso?</AlertDialogTitle>
            <AlertDialogDescription>
              No hay sucursales asignadas. El miembro quedará sin poder ingresar
              hasta que le asignes una.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">
              Revisar sucursales
            </AlertDialogCancel>
            <Button type="button" className="min-h-11" onClick={simulateSave}>
              Guardar sin acceso
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
