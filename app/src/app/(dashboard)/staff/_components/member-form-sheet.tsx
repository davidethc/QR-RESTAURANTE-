"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { Delete, KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { useRouter } from "next/navigation";
import { notify } from "@/lib/notifications";
import { saveMember } from "@/lib/actions/staff";
import { MEMBER_ROLES, type MemberRole } from "@/lib/validations/staff";
import type { CashRegisterOption } from "@/lib/queries/cash";
import {
  memberFormInput,
  memberFormErrors,
  memberServerErrorField,
  type MemberFormInitial,
  type MemberFormValues,
  type MemberFormErrors,
  type MemberFormField,
} from "./member-form-model";

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

export type MemberFormSheetProps = {
  restaurantId: string;
  registers: readonly CashRegisterOption[];
  assignableRoles?: readonly MemberRole[];
  trigger: ReactNode;
  initialMember?: MemberFormInitial;
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
  onAssign: (pin: string) => void;
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
    onAssign(digits);
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

export function MemberFormSheet(props: MemberFormSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [saving, startTransition] = useTransition();
  const dirty = useRef(false);
  const submitting = useRef(false);
  function requestClose(value: boolean) {
    if (submitting.current) return;
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
            saving={saving}
            markDirty={() => {
              dirty.current = true;
            }}
            onCancel={() => requestClose(false)}
            onSubmit={(input, onError) => {
              if (submitting.current) return;
              submitting.current = true;
              startTransition(async () => {
                try {
                  const result = await saveMember(props.restaurantId, input);
                  if (!result.ok) {
                    onError(result.error);
                    return;
                  }
                  dirty.current = false;
                  setOpen(false);
                  notify.success(
                    props.initialMember
                      ? "Miembro actualizado"
                      : "Miembro agregado",
                  );
                  router.refresh();
                } catch {
                  onError(
                    "No pudimos confirmar el guardado. Tu borrador sigue aquí. Revisa Personal antes de reintentar.",
                  );
                } finally {
                  submitting.current = false;
                }
              });
            }}
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
  initialMember,
  registers,
  assignableRoles = MEMBER_ROLES,
  saving,
  markDirty,
  onCancel,
  onSubmit,
}: MemberFormSheetProps & {
  saving: boolean;
  markDirty: () => void;
  onCancel: () => void;
  onSubmit: (
    input: ReturnType<typeof memberFormInput>,
    onError: (message: string) => void,
  ) => void;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [member, setMember] = useState<MemberFormValues>(
    () =>
      initialMember ?? {
        firstName: "",
        lastName: "",
        email: "",
        active: true,
        roles: [],
        cashRegisterIds: [],
      },
  );
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [changePassword, setChangePassword] = useState(false);
  const [errors, setErrors] = useState<MemberFormErrors>({});
  const [serverError, setServerError] = useState("");
  const editing = !!initialMember;
  const cashier = member.roles.includes("CASHIER");
  const pinAssigned = !!pin || initialMember?.hasPin === true;
  const selectedRegisters = registers.filter((register) =>
    member.cashRegisterIds.includes(register.id),
  );
  function clearError(field: MemberFormField) {
    setErrors((value) => ({ ...value, [field]: undefined }));
  }
  function update(patch: Partial<MemberFormValues>) {
    setMember((value) => ({ ...value, ...patch }));
    for (const field of Object.keys(patch))
      clearError(field as MemberFormField);
    markDirty();
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const input = memberFormInput(
      member,
      { pin, password },
      initialMember?.memberId,
    );
    const validation = memberFormErrors(
      member,
      input,
      initialMember ? initialMember.hasPin : false,
    );
    if (editing && changePassword && !password)
      validation.password = "Completa este campo.";
    setErrors(validation);
    if (Object.values(validation).some(Boolean)) {
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
    setServerError("");
    onSubmit(input, (message) => {
      setServerError(message);
      const field = memberServerErrorField(message);
      if (field) setErrors((value) => ({ ...value, [field]: message }));
      requestAnimationFrame(() => errorRef.current?.focus());
    });
  }
  function errorId(field: MemberFormField) {
    return errors[field] ? `${id}-${field}-error` : undefined;
  }
  function fieldError(field: MemberFormField) {
    return errors[field] ? (
      <FieldError id={`${id}-${field}-error`}>{errors[field]}</FieldError>
    ) : null;
  }
  return (
    <>
      <SheetHeader className="shrink-0 border-b p-5 pr-18 sm:p-6 sm:pr-20">
        <SheetTitle className="text-title font-semibold">
          {editing ? "Editar miembro" : "Agregar miembro"}
        </SheetTitle>
        <SheetDescription>
          Define su acceso y lo que podrá hacer en el local.
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
                  {(["firstName", "lastName"] as const).map((field) => (
                    <Field key={field} data-invalid={!!errors[field]}>
                      <FieldLabel htmlFor={`${id}-${field}`}>
                        {field === "firstName" ? "Nombre" : "Apellido"}
                      </FieldLabel>
                      <Input
                        id={`${id}-${field}`}
                        required
                        autoComplete={
                          field === "firstName" ? "given-name" : "family-name"
                        }
                        className="min-h-11"
                        value={member[field]}
                        onChange={(event) =>
                          update({ [field]: event.target.value })
                        }
                        aria-invalid={!!errors[field]}
                        aria-describedby={errorId(field)}
                      />
                      {fieldError(field)}
                    </Field>
                  ))}
                </div>
              </section>
              <section
                className="space-y-4 border-t pt-6"
                aria-labelledby={`${id}-access`}
              >
                <h3 id={`${id}-access`} className="text-title-sm font-semibold">
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
                        pinAssigned
                          ? "bg-primary-soft text-primary"
                          : "bg-warning-soft text-warning-soft-foreground"
                      }
                    >
                      {pinAssigned
                        ? pin
                          ? "PIN nuevo · ••••"
                          : "PIN asignado · ••••"
                        : editing && initialMember.hasPin === null
                          ? "PIN actual sin consultar"
                          : "PIN pendiente"}
                    </Badge>
                    <PinDialog
                      assigned={pinAssigned}
                      invalid={!!errors.pin}
                      errorId={`${id}-pin-error`}
                      onAssign={(value) => {
                        setPin(value);
                        clearError("pin");
                        markDirty();
                      }}
                    />
                  </div>
                  {fieldError("pin")}
                </Field>
                <p className="text-body-sm text-muted-foreground">
                  El acceso por correo está habilitado para todos los miembros.
                </p>
                <Field data-invalid={!!errors.email}>
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
                    onChange={(event) => update({ email: event.target.value })}
                    aria-invalid={!!errors.email}
                    aria-describedby={errorId("email")}
                  />
                  {fieldError("email")}
                </Field>
                {editing && !changePassword ? (
                  <Field>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-body-sm text-muted-foreground">
                        Contraseña actual conservada
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        aria-invalid={!!errors.password}
                        aria-describedby={errorId("password")}
                        onClick={() => setChangePassword(true)}
                      >
                        Cambiar contraseña
                      </Button>
                    </div>
                    {fieldError("password")}
                  </Field>
                ) : (
                  <Field data-invalid={!!errors.password}>
                    <FieldLabel htmlFor={`${id}-password`}>
                      {editing ? "Nueva contraseña" : "Contraseña"}
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
                        clearError("password");
                        markDirty();
                      }}
                      aria-invalid={!!errors.password}
                      aria-describedby={`${id}-password-help${errors.password ? ` ${errorId("password")}` : ""}`}
                    />
                    <FieldDescription id={`${id}-password-help`}>
                      Usa entre 8 y 72 caracteres.
                    </FieldDescription>
                    {fieldError("password")}
                    {editing && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => {
                          setChangePassword(false);
                          setPassword("");
                          clearError("password");
                        }}
                      >
                        Conservar contraseña actual
                      </Button>
                    )}
                  </Field>
                )}
              </section>
              <fieldset
                tabIndex={-1}
                aria-invalid={!!errors.roles}
                aria-describedby={errorId("roles")}
                className="border-t pt-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <legend className="sr-only">Roles combinables</legend>
                <h3 className="text-title-sm font-semibold">Roles</h3>
                <p className="mb-3 mt-2 text-body-sm text-muted-foreground">
                  Puedes combinar varios roles. Sus permisos se suman.
                </p>
                <div className="divide-y">
                  {roles.map(([role, title, description]) =>
                    role === "SUPER_ADMIN" ? (
                      <Choice
                        key={role}
                        id={`${id}-${role}`}
                        title={title}
                        description={description}
                        checked={false}
                        disabled
                        onChange={() => {}}
                      />
                    ) : (
                      <Choice
                        key={role}
                        id={`${id}-${role}`}
                        title={title}
                        description={description}
                        checked={member.roles.includes(role)}
                        disabled={!assignableRoles.includes(role)}
                        onChange={(checked) =>
                          update({
                            roles: checked
                              ? [...member.roles, role]
                              : member.roles.filter((value) => value !== role),
                            ...(role === "CASHIER" && !checked
                              ? { cashRegisterIds: [] }
                              : {}),
                          })
                        }
                      />
                    ),
                  )}
                </div>
                {!member.roles.length && (
                  <p className="mt-3 text-body-sm text-muted-foreground">
                    Sin roles asignados
                  </p>
                )}
                {fieldError("roles")}
              </fieldset>
              {cashier && (
                <fieldset
                  tabIndex={-1}
                  aria-invalid={!!errors.cashRegisterIds}
                  aria-describedby={errorId("cashRegisterIds")}
                  className="border-t pt-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <legend className="sr-only">Cajas asignadas</legend>
                  <h3 className="text-title-sm font-semibold">
                    Cajas asignadas
                  </h3>
                  <p className="my-3 text-body-sm text-muted-foreground">
                    Selecciona al menos una caja activa del local.
                  </p>
                  {!registers.length && (
                    <p className="rounded-control bg-muted p-3 text-body-sm">
                      No hay cajas activas disponibles. Solicita una caja al
                      administrador o retira el rol Cajero.
                    </p>
                  )}
                  {registers.map((register) => (
                    <Choice
                      key={register.id}
                      id={`${id}-register-${register.id}`}
                      title={register.name}
                      checked={member.cashRegisterIds.includes(register.id)}
                      onChange={(checked) =>
                        update({
                          cashRegisterIds: checked
                            ? [...member.cashRegisterIds, register.id]
                            : member.cashRegisterIds.filter(
                                (value) => value !== register.id,
                              ),
                        })
                      }
                    />
                  ))}
                  {fieldError("cashRegisterIds")}
                </fieldset>
              )}
              <Field className="border-t pt-6" data-invalid={!!errors.active}>
                <Choice
                  id={`${id}-active`}
                  title="Miembro activo"
                  description="Si está inactivo, no podrá ingresar a su cuenta."
                  checked={member.active}
                  onChange={(checked) => update({ active: checked })}
                />
                {fieldError("active")}
              </Field>
            </fieldset>
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
                    .filter(
                      ([role]) =>
                        role !== "SUPER_ADMIN" && member.roles.includes(role),
                    )
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
                <Badge variant="secondary">
                  {member.active ? "Activo" : "Inactivo"}
                </Badge>
              </div>
              {cashier && (
                <>
                  <div className="my-5 border-t" />
                  <h4 className="font-medium">Cajas</h4>
                  <p className="mt-2 break-words text-body-sm text-muted-foreground">
                    {selectedRegisters
                      .map((register) => register.name)
                      .join(", ") || "Sin cajas asignadas"}
                  </p>
                </>
              )}
              <div className="my-5 border-t" />
              <h4 className="font-medium">Acceso</h4>
              <p className="mt-2 text-body-sm text-muted-foreground">
                {pinAssigned
                  ? "PIN asignado"
                  : editing && initialMember.hasPin === null
                    ? "PIN actual sin consultar"
                    : "PIN pendiente"}
              </p>
              <p className="mt-1 break-words text-body-sm text-muted-foreground">
                {member.email || "Correo pendiente"}
              </p>
              <p className="mt-4 text-body-sm text-muted-foreground">
                El PIN y la contraseña nunca aparecen en esta vista.
              </p>
            </aside>
          </div>
        </div>
        <div className="shrink-0 space-y-3 border-t bg-card p-4 sm:px-6">
          {serverError && (
            <p
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="max-h-32 overflow-y-auto rounded-control bg-destructive-soft p-3 text-body-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {serverError}
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
                : editing
                  ? "Guardar cambios"
                  : "Agregar miembro"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
