"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { notify } from "@/lib/notifications";
import { resetStaffPassword } from "@/lib/actions/staff-admin";
import { generateTempPassword } from "@/lib/validations/staff";
import { CredentialsCard } from "./credentials-card";

export function ResetPasswordDialog({
  memberId,
  name,
  email,
}: {
  memberId: string;
  name: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [newPassword, setNewPassword] = useState<string | null>(null);

  function handleReset() {
    const password = generateTempPassword();
    startTransition(async () => {
      const result = await resetStaffPassword({ memberId, password });
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      setNewPassword(password);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setNewPassword(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label={`Generar nueva clave para ${name}`}
        >
          <KeyRound className="size-4" strokeWidth={1.75} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva clave para {name}</DialogTitle>
          <DialogDescription>
            {newPassword
              ? "La clave anterior ya no sirve."
              : "Se genera una clave temporal y la anterior deja de funcionar."}
          </DialogDescription>
        </DialogHeader>
        {newPassword ? (
          <>
            <CredentialsCard email={email} password={newPassword} />
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Listo</Button>
            </DialogFooter>
          </>
        ) : (
          <DialogFooter>
            <Button onClick={handleReset} disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              Generar clave nueva
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
