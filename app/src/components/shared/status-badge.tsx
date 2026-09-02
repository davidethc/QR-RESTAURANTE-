import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OrderStatus, CallStatus, TableStatus } from "@/config/constants";

/**
 * Insignias de estado — un componente por dominio (pedido, solicitud, mesa),
 * reutilizado en la carta del cliente, el panel del mesero y cocina.
 * El color y el texto en español quedan definidos una sola vez aquí.
 */

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pendiente",
  ACCEPTED: "Aceptado",
  PREPARING: "Preparando",
  READY: "Listo",
  DELIVERED: "Entregado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
};

const ORDER_STATUS_CLASS: Record<OrderStatus, string> = {
  PENDING: "bg-secondary text-secondary-foreground",
  ACCEPTED: "bg-accent text-accent-foreground",
  PREPARING: "bg-primary text-primary-foreground",
  READY: "bg-wine text-wine-foreground",
  DELIVERED: "bg-muted text-muted-foreground",
  REJECTED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-destructive/10 text-destructive",
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  return (
    <Badge className={cn(ORDER_STATUS_CLASS[status], className)}>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  PENDING: "Pendiente",
  ACCEPTED: "En proceso",
  ATTENDED: "Atendida",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
};

const CALL_STATUS_CLASS: Record<CallStatus, string> = {
  PENDING: "bg-wine text-wine-foreground",
  ACCEPTED: "bg-accent text-accent-foreground",
  ATTENDED: "bg-muted text-muted-foreground",
  REJECTED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-destructive/10 text-destructive",
};

export function CallStatusBadge({
  status,
  className,
}: {
  status: CallStatus;
  className?: string;
}) {
  return (
    <Badge className={cn(CALL_STATUS_CLASS[status], className)}>
      {CALL_STATUS_LABEL[status]}
    </Badge>
  );
}

const TABLE_STATUS_LABEL: Record<TableStatus, string> = {
  AVAILABLE: "Disponible",
  OCCUPIED: "Ocupada",
  ATTENTION: "Solicita atención",
  BILL_REQUESTED: "Pidió la cuenta",
  INACTIVE: "Inactiva",
};

const TABLE_STATUS_CLASS: Record<TableStatus, string> = {
  AVAILABLE: "border-border bg-background text-foreground",
  OCCUPIED: "bg-accent text-accent-foreground",
  ATTENTION: "bg-wine text-wine-foreground",
  BILL_REQUESTED: "bg-primary text-primary-foreground",
  INACTIVE: "bg-muted text-muted-foreground",
};

export function TableStatusBadge({
  status,
  className,
}: {
  status: TableStatus;
  className?: string;
}) {
  return (
    <Badge
      variant={status === "AVAILABLE" ? "outline" : "default"}
      className={cn(TABLE_STATUS_CLASS[status], className)}
    >
      {TABLE_STATUS_LABEL[status]}
    </Badge>
  );
}
