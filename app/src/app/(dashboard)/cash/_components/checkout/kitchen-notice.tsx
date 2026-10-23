import { ChefHat } from "lucide-react";

/** Aviso de cuenta pagada que sigue abierta por pedidos en cocina. */
export function KitchenNotice() {
  return (
    <div role="status" className="flex items-start gap-3 rounded-card border border-attention-border bg-attention-soft px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-attention-soft-foreground">
        <ChefHat className="size-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="text-body-sm font-semibold text-attention-soft-foreground">El pedido sigue en cocina</p>
        <p className="text-meta text-attention-soft-foreground">
          Ya está pagada. La cuenta se cierra sola cuando salgan los pedidos que siguen en cocina.
        </p>
      </div>
    </div>
  );
}
