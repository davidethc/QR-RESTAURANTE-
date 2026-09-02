"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notifications";
import { rejectOrder } from "@/lib/actions/orders";

const REASONS = [
  "Producto agotado",
  "Producto no disponible",
  "Error en el pedido",
  "El restaurante no puede procesarlo",
  "Otro",
] as const;

export function RejectDialog({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();

  const finalReason = reason === "Otro" ? comment.trim() : reason;
  const canSubmit = finalReason.length > 0;

  function handleConfirm() {
    startTransition(async () => {
      const result = await rejectOrder(orderId, finalReason);
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      setOpen(false);
      notify.success("Pedido rechazado");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex-1">
          Rechazar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazar pedido</DialogTitle>
          <DialogDescription>
            Selecciona un motivo. El cliente lo verá.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={reason} onValueChange={setReason} className="gap-3">
          {REASONS.map((r) => (
            <div key={r} className="flex items-center gap-2">
              <RadioGroupItem value={r} id={r} />
              <Label htmlFor={r} className="font-normal">
                {r}
              </Label>
            </div>
          ))}
        </RadioGroup>

        {reason === "Otro" && (
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Describe el motivo"
            rows={2}
          />
        )}

        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!canSubmit || isPending}
            onClick={handleConfirm}
          >
            {isPending && <Loader2 className="animate-spin" />}
            Confirmar rechazo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
