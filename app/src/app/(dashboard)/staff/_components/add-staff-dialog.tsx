"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notify } from "@/lib/notifications";
import { createStaffMember } from "@/lib/actions/staff-admin";
import { createStaffSchema, generateTempPassword } from "@/lib/validations/staff";
import { CredentialsCard } from "./credentials-card";
import { ROLE_HINT, ROLE_LABEL, type AssignableRole } from "./role-labels";

export function AddStaffDialog({
  restaurantId,
  roles,
}: {
  restaurantId: string;
  roles: AssignableRole[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("WAITER");
  const [password, setPassword] = useState(() => generateTempPassword());
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  function reset() {
    setFullName("");
    setEmail("");
    setRole("WAITER");
    setPassword(generateTempPassword());
    setError(null);
    setCreated(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = { fullName, email, role, password };
    const parsed = createStaffSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createStaffMember(restaurantId, parsed.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      notify.success(`${parsed.data.fullName} ya puede entrar al panel`);
      setCreated({ email: parsed.data.email, password: parsed.data.password });
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button className="h-10">
          <UserPlus /> Agregar
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle className="text-title-sm font-semibold">
            {created ? "Cuenta creada" : "Agregar persona"}
          </SheetTitle>
          <SheetDescription>
            {created
              ? "Ya puede iniciar sesión con estos datos."
              : "Crea su cuenta con una clave temporal y dísela en persona."}
          </SheetDescription>
        </SheetHeader>

        {created ? (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <CredentialsCard email={created.email} password={created.password} />
            </div>
            <SheetFooter className="flex-row justify-end border-t border-border px-6 py-4">
              <Button onClick={() => handleOpenChange(false)}>Listo</Button>
            </SheetFooter>
          </>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="staff-name">Nombre</FieldLabel>
                  <Input
                    id="staff-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="staff-email">Correo</FieldLabel>
                  <Input
                    id="staff-email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="staff-role">Rol</FieldLabel>
                  <Select value={role} onValueChange={(v) => setRole(v as AssignableRole)}>
                    <SelectTrigger id="staff-role" className="h-10 w-full">
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
                  <FieldDescription>{ROLE_HINT[role]}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="staff-password">Clave temporal</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="staff-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPassword(generateTempPassword())}
                      aria-label="Generar otra clave"
                    >
                      <RefreshCw />
                    </Button>
                  </div>
                </Field>
                {error && (
                  <p role="alert" className="text-meta text-destructive">
                    {error}
                  </p>
                )}
              </FieldGroup>
            </div>
            <SheetFooter className="flex-row justify-end border-t border-border px-6 py-4">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="animate-spin" />}
                Crear cuenta
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
