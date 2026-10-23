"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import {
  BookOpen,
  Check,
  ChefHat,
  ConciergeBell,
  Copy,
  Crown,
  KeyRound,
  Power,
  ShieldCheck,
  Store,
  UserCog,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { toneSoft } from "@/components/shared/pos-tone";
import { cn } from "@/lib/utils";
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

const ROLE_ICONS: Record<(typeof roles)[number][0], LucideIcon> = {
  SUPER_ADMIN: Crown,
  ADMIN: ShieldCheck,
  MEMBERS_ADMIN: UserCog,
  BRANCH_MANAGER: Store,
  MENU_MANAGER: BookOpen,
  CASHIER: Wallet,
  WAITER: ConciergeBell,
  KITCHEN: ChefHat,
};

function SectionTitle({
  id,
  icon: Icon,
  step,
  children,
}: {
  id?: string;
  icon: LucideIcon;
  step?: number;
  children: ReactNode;
}) {
  return (
    <h3 id={id} className="mb-4 flex items-center gap-2.5 text-body font-semibold text-foreground">
      <span aria-hidden className="flex size-8 items-center justify-center rounded-control border border-border bg-secondary text-muted-foreground">
        <Icon className="size-4" />
      </span>
      {step ? <span className="sr-only">Paso {step}: </span> : null}
      {children}
    </h3>
  );
}

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
  icon: Icon,
  onChange,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  onChange: (checked: boolean) => void;
}) {
  return (
    <FieldLabel
      htmlFor={id}
      className={cn(
        "min-h-14 w-full items-start gap-3 rounded-control border-2 p-3 transition-[border-color,background-color,box-shadow] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring motion-reduce:transition-none",
        disabled
          ? "cursor-default border-dashed border-border bg-muted"
          : checked
            ? "cursor-pointer border-foreground bg-card shadow-sm"
            : "cursor-pointer border-border bg-card hover:border-border-strong",
      )}
    >
      {Icon && (
        <span
          aria-hidden
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-control border",
            checked ? "border-foreground bg-foreground text-background" : "border-border bg-secondary text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
      )}
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
        className={cn("mt-0.5 size-5 after:-inset-3", Icon && "order-last")}
      />
      <span className="min-w-0 flex-1">
        <span id={`${id}-title`} className="block text-body font-medium">
          {title}
        </span>
        {description && (
          <span
            id={`${id}-description`}
            className="mt-0.5 block text-meta font-normal leading-snug text-muted-foreground"
          >
            {description}
          </span>
        )}
      </span>
    </FieldLabel>
  );
}

function PinRevealDialog({
  reveal,
  onClose,
}: {
  reveal: { name: string; pin: string; notice?: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!reveal) return;
    try {
      await navigator.clipboard.writeText(reveal.pin);
      setCopied(true);
    } catch {
      notify.error("No se pudo copiar. Anota el PIN a mano.");
    }
  }
  return (
    <Dialog
      open={!!reveal}
      onOpenChange={(value) => {
        if (!value) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>PIN de {reveal?.name}</DialogTitle>
          <DialogDescription>
            Anótalo y entrégaselo; no se volverá a mostrar.
          </DialogDescription>
        </DialogHeader>
        <p
          className="rounded-control bg-muted p-4 text-center font-mono text-display tracking-widest"
          aria-label={`PIN ${reveal?.pin.split("").join(" ")}`}
        >
          {reveal?.pin}
        </p>
        {reveal?.notice && (
          <p
            role="status"
            className="rounded-control bg-warning-soft p-3 text-body-sm text-warning-soft-foreground"
          >
            {reveal.notice}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={copy}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copiado" : "Copiar PIN"}
          </Button>
          <Button type="button" className="min-h-11" onClick={() => {
            setCopied(false);
            onClose();
          }}>
            Ya lo anoté
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
  const [reveal, setReveal] = useState<{
    name: string;
    pin: string;
    notice?: string;
  } | null>(null);
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
        data-caja
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
                    onError(result.error, result.field);
                    return;
                  }
                  dirty.current = false;
                  setOpen(false);
                  notify.success(
                    props.initialMember
                      ? "Miembro actualizado"
                      : "Miembro agregado",
                  );
                  const { pin, notice } = result.data;
                  if (pin) setReveal({ name: input.fullName, pin, notice });
                  else if (notice) notify.success(notice);
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
        <PinRevealDialog reveal={reveal} onClose={() => setReveal(null)} />
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
    onError: (message: string, field?: string) => void,
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
  const [generatePin, setGeneratePin] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPin, setConfirmPin] = useState(false);
  const [changePassword, setChangePassword] = useState(false);
  const [errors, setErrors] = useState<MemberFormErrors>({});
  const [serverError, setServerError] = useState("");
  const editing = !!initialMember;
  const cashier = member.roles.includes("CASHIER");
  const pinAssigned = generatePin || initialMember?.hasPin === true;
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
      { generatePin, password },
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
    onSubmit(input, (message, serverField) => {
      setServerError(message);
      const field =
        serverField === "email" || serverField === "password"
          ? serverField
          : memberServerErrorField(message);
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
      <SheetHeader className="shrink-0 border-b border-border bg-card p-5 pr-18 sm:p-6 sm:pr-20">
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
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background"
          data-member-scroll
        >
          <div className="grid items-start gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <fieldset disabled={saving} className="min-w-0 space-y-4">
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
              <section aria-labelledby={`${id}-identity`} className="rounded-card border border-border bg-card p-4 sm:p-5">
                <SectionTitle id={`${id}-identity`} icon={UserRound} step={1}>
                  Datos del miembro
                </SectionTitle>
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
                className="space-y-4 rounded-card border border-border bg-card p-4 sm:p-5"
                aria-labelledby={`${id}-access`}
              >
                <SectionTitle id={`${id}-access`} icon={KeyRound} step={2}>
                  Acceso al local
                </SectionTitle>
                <p className="text-body-sm text-muted-foreground">
                  El PIN se genera automáticamente y se muestra una sola vez al
                  guardar.
                </p>
                <Field>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-background p-3">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "h-7 gap-1 border px-2.5",
                        editing && !generatePin && initialMember.hasPin !== false
                          ? toneSoft.info
                          : toneSoft.attention,
                      )}
                    >
                      <KeyRound className="size-3.5" aria-hidden />
                      {!editing
                        ? "Se generará al guardar"
                        : generatePin
                          ? "PIN nuevo al guardar"
                          : initialMember.hasPin === false
                            ? "Sin PIN"
                            : "PIN asignado · ••••"}
                    </Badge>
                    {editing &&
                      (generatePin ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => setGeneratePin(false)}
                        >
                          Conservar PIN actual
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          aria-invalid={!!errors.pin}
                          aria-describedby={errorId("pin")}
                          onClick={() => setConfirmPin((value) => !value)}
                          aria-expanded={confirmPin}
                        >
                          <KeyRound aria-hidden />
                          Generar nuevo PIN
                        </Button>
                      ))}
                  </div>
                  {fieldError("pin")}
                </Field>
                {confirmPin && !generatePin && (
                  <div
                    role="group"
                    aria-labelledby={`${id}-pin-confirm`}
                    className="flex flex-col gap-3 rounded-control border border-attention-border bg-attention-soft p-3 text-attention-soft-foreground"
                  >
                    <div>
                      <p id={`${id}-pin-confirm`} className="text-body-sm font-semibold">¿Generar un PIN nuevo?</p>
                      <p className="text-meta">El PIN anterior deja de servir en cuanto guardes.</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 bg-card"
                        onClick={() => setConfirmPin(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        className="min-h-11"
                        onClick={() => {
                          setGeneratePin(true);
                          clearError("pin");
                          markDirty();
                          setConfirmPin(false);
                        }}
                      >
                        Generar nuevo PIN
                      </Button>
                    </div>
                  </div>
                )}
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
                className="rounded-card border border-border bg-card p-4 sm:p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <legend className="sr-only">Roles combinables</legend>
                <SectionTitle icon={ShieldCheck} step={3}>Roles</SectionTitle>
                <p className="mb-3 mt-1 text-body-sm text-muted-foreground">
                  Puedes combinar varios roles. Sus permisos se suman.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {roles.map(([role, title, description]) =>
                    role === "SUPER_ADMIN" ? (
                      <Choice
                        key={role}
                        id={`${id}-${role}`}
                        title={title}
                        description={description}
                        icon={ROLE_ICONS[role]}
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
                        icon={ROLE_ICONS[role]}
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
                  className="rounded-card border border-border bg-card p-4 sm:p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <legend className="sr-only">Cajas asignadas</legend>
                  <SectionTitle icon={Wallet}>Cajas asignadas</SectionTitle>
                  <p className="my-3 text-body-sm text-muted-foreground">
                    Selecciona al menos una caja activa del local.
                  </p>
                  {!registers.length && (
                    <p className="rounded-control border border-attention-border bg-attention-soft p-3 text-body-sm text-attention-soft-foreground">
                      No hay cajas activas disponibles. Solicita una caja al
                      administrador o retira el rol Cajero.
                    </p>
                  )}
                  {registers.map((register) => (
                    <Choice
                      key={register.id}
                      id={`${id}-register-${register.id}`}
                      title={register.name}
                      icon={Wallet}
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
              <Field className="rounded-card border border-border bg-card p-4 sm:p-5" data-invalid={!!errors.active}>
                <Choice
                  id={`${id}-active`}
                  title="Miembro activo"
                  icon={Power}
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
              className="min-w-0 scroll-mt-6 rounded-card border border-border bg-card p-5 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring lg:sticky lg:top-0"
            >
              <p className="mb-6 text-meta text-muted-foreground">
                Así quedará su acceso
              </p>
              <Avatar className="mb-4 size-14">
                <AvatarFallback className="border border-info-border bg-info-soft text-title text-info-soft-foreground">
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
                        className={cn("h-auto whitespace-normal border", toneSoft.info)}
                      >
                        {label}
                      </Badge>
                    ))
                ) : (
                  <Badge variant="secondary">Sin roles asignados</Badge>
                )}
                <Badge className={cn("border", toneSoft[member.active ? "money-in" : "neutral"])}>
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
                {!editing
                  ? "PIN se generará al guardar"
                  : generatePin
                    ? "PIN nuevo al guardar"
                    : pinAssigned
                      ? "PIN asignado"
                      : initialMember.hasPin === null
                        ? "PIN actual sin consultar"
                        : "Sin PIN"}
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
        <div className="shrink-0 space-y-3 border-t border-border bg-card p-4 sm:px-6">
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
