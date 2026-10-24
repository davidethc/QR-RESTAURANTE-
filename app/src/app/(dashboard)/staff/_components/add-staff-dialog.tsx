"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Zap } from "lucide-react";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ChoiceCards } from "@/components/shared/choice-card";
import { notify } from "@/lib/notifications";
import { createStaffMember } from "@/lib/actions/staff-admin";
import { createStaffSchema, generateTempPassword } from "@/lib/validations/staff";
import { CredentialsCard } from "./credentials-card";
import { ROLE_HINT, ROLE_ICON, ROLE_LABEL, ROLE_TONE, type AssignableRole } from "./role-labels";

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
        <Button variant="outline" className="min-h-11 bg-card">
          <Zap /> Cuenta rápida
        </Button>
      </SheetTrigger>
      <SheetContent side="right" data-caja className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
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
              <Button className="min-h-11" onClick={() => handleOpenChange(false)}>Listo</Button>
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
                    className="min-h-11"
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
                    className="min-h-11"
                  />
                </Field>
                <Field>
                  <FieldLabel id="staff-role-label">Rol</FieldLabel>
                  <ChoiceCards<AssignableRole>
                    label="Rol"
                    size="md"
                    columns={2}
                    value={role}
                    onChange={setRole}
                    options={roles.map((r) => ({
                      value: r,
                      title: ROLE_LABEL[r],
                      description: ROLE_HINT[r],
                      icon: ROLE_ICON[r],
                      tone: ROLE_TONE[r],
                    }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="staff-password">Clave temporal</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="staff-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      className="min-h-11 font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="size-11"
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
              <Button type="button" variant="outline" className="min-h-11" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} className="min-h-11">
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
