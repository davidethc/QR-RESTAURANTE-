"use client";

import { useState } from "react";
import type { Fill, Row, Workbook, Worksheet } from "exceljs";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notifications";
import type {
  DiscountRow,
  PaymentsByMethodRow,
  PeakHoursRow,
  PrepTimesRow,
  SalesByCategoryRow,
  SalesByPeriodRow,
  SalesByProductRow,
  SalesByStaffRow,
  SalesSummary,
} from "@/types/reports";

const MONEY_FMT = '"$"#,##0.00';
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0EF" } } as const;

const DAY_LABEL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export type ReportsExportData = {
  restaurantName: string;
  from: string;
  to: string;
  summary: SalesSummary;
  byPeriod: SalesByPeriodRow[];
  byProduct: SalesByProductRow[];
  byCategory: SalesByCategoryRow[];
  byStaff: SalesByStaffRow[];
  byMethod: PaymentsByMethodRow[];
  peakHours: PeakHoursRow[];
  prepTimes: PrepTimesRow[];
  discounts: DiscountRow[];
};

/**
 * `exceljs` se carga por importación dinámica: solo se descarga cuando el
 * dueño toca "Exportar a Excel" (mismo patrón que `TablesPdfButton` con
 * `jspdf`), así el paquete que llega al resto del panel no crece por esto.
 */
export function ReportsExportButton({ data, disabled }: { data: ReportsExportData; disabled?: boolean }) {
  const [isPending, setIsPending] = useState(false);

  async function handleExport() {
    setIsPending(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Monky";
      workbook.created = new Date();

      addSummarySheet(workbook, data);
      addPeriodSheet(workbook, data.byPeriod);
      addProductSheet(workbook, data.byProduct);
      addCategorySheet(workbook, data.byCategory);
      addStaffSheet(workbook, data.byStaff);
      addMethodSheet(workbook, data.byMethod);
      addPeakHoursSheet(workbook, data.peakHours);
      addPrepTimesSheet(workbook, data.prepTimes);
      addDiscountsSheet(workbook, data.discounts);

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reportes-${data.restaurantName.toLowerCase().replace(/\s+/g, "-")}-${data.from}_${data.to}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "No se pudo generar el Excel");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={disabled || isPending}>
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="h-4 w-4" />
      )}
      Exportar a Excel
    </Button>
  );
}

function styleHeader(row: Row) {
  row.font = { bold: true };
  row.fill = HEADER_FILL as Fill;
  row.commit();
}

function addSummarySheet(workbook: Workbook, data: ReportsExportData) {
  const sheet = workbook.addWorksheet("Resumen");
  sheet.columns = [
    { header: "Métrica", key: "label", width: 28 },
    { header: "Valor", key: "value", width: 18 },
  ];
  styleHeader(sheet.getRow(1));
  const s = data.summary;
  const rows: [string, number][] = [
    ["Rango", NaN],
    ["Cuentas cerradas", s.bills_count],
    ["Venta bruta", s.gross_sales],
    ["Descuentos", s.discounts],
    ["Venta neta", s.net_sales],
    ["Ticket promedio", s.avg_ticket],
    ["Propinas", s.tips],
    ["Pagos completados", s.payments_count],
    ["Cobrado", s.collected],
    ["Cuentas abiertas", s.open_bills_count],
    ["Total cuentas abiertas", s.open_bills_total],
    ["Pendiente por cobrar", s.open_bills_balance],
    ["Pedidos entregados", s.delivered_orders_count],
    ["Venta de pedidos entregados", s.delivered_orders_total],
  ];
  sheet.addRow({ label: "Desde", value: data.from });
  sheet.addRow({ label: "Hasta", value: data.to });
  const moneyLabels = new Set([
    "Venta bruta",
    "Descuentos",
    "Venta neta",
    "Ticket promedio",
    "Propinas",
    "Cobrado",
    "Total cuentas abiertas",
    "Pendiente por cobrar",
    "Venta de pedidos entregados",
  ]);
  for (const [label, value] of rows) {
    if (label === "Rango") continue;
    const row = sheet.addRow({ label, value });
    if (moneyLabels.has(label)) row.getCell("value").numFmt = MONEY_FMT;
  }
}

function addPeriodSheet(workbook: Workbook, rows: SalesByPeriodRow[]) {
  const sheet = workbook.addWorksheet("Ventas por periodo");
  sheet.columns = [
    { header: "Desde", key: "period_start", width: 14 },
    { header: "Hasta", key: "period_end", width: 14 },
    { header: "Cuentas", key: "bills_count", width: 12 },
    { header: "Venta bruta", key: "gross_sales", width: 14 },
    { header: "Descuentos", key: "discounts", width: 14 },
    { header: "Venta neta", key: "net_sales", width: 14 },
    { header: "Ticket promedio", key: "avg_ticket", width: 16 },
    { header: "Propinas", key: "tips", width: 12 },
    { header: "Pedidos entregados", key: "delivered_orders_total", width: 18 },
  ];
  styleHeader(sheet.getRow(1));
  for (const row of rows) sheet.addRow(row);
  formatMoneyColumns(sheet, ["gross_sales", "discounts", "net_sales", "avg_ticket", "tips", "delivered_orders_total"]);
}

function addProductSheet(workbook: Workbook, rows: SalesByProductRow[]) {
  const sheet = workbook.addWorksheet("Top productos");
  sheet.columns = [
    { header: "Producto", key: "product_name", width: 30 },
    { header: "Categoría", key: "category_name", width: 20 },
    { header: "Cantidad", key: "quantity", width: 12 },
    { header: "Venta bruta", key: "gross_sales", width: 14 },
    { header: "Pedidos", key: "orders_count", width: 12 },
  ];
  styleHeader(sheet.getRow(1));
  for (const row of rows) sheet.addRow({ ...row, category_name: row.category_name ?? "Sin categoría" });
  formatMoneyColumns(sheet, ["gross_sales"]);
}

function addCategorySheet(workbook: Workbook, rows: SalesByCategoryRow[]) {
  const sheet = workbook.addWorksheet("Ventas por categoría");
  sheet.columns = [
    { header: "Categoría", key: "category_name", width: 22 },
    { header: "Cantidad", key: "quantity", width: 12 },
    { header: "Venta bruta", key: "gross_sales", width: 14 },
    { header: "Productos", key: "products_count", width: 12 },
    { header: "Pedidos", key: "orders_count", width: 12 },
  ];
  styleHeader(sheet.getRow(1));
  for (const row of rows) sheet.addRow(row);
  formatMoneyColumns(sheet, ["gross_sales"]);
}

function addStaffSheet(workbook: Workbook, rows: SalesByStaffRow[]) {
  const sheet = workbook.addWorksheet("Ventas por mesero");
  sheet.columns = [
    { header: "Nombre", key: "full_name", width: 24 },
    { header: "Rol", key: "member_role", width: 14 },
    { header: "Pedidos aceptados", key: "orders_accepted", width: 16 },
    { header: "Total entregado", key: "orders_accepted_total", width: 16 },
    { header: "Pagos", key: "payments_count", width: 10 },
    { header: "Cobrado", key: "payments_amount", width: 14 },
    { header: "Propinas", key: "tips_amount", width: 12 },
  ];
  styleHeader(sheet.getRow(1));
  for (const row of rows) sheet.addRow({ ...row, member_role: row.member_role ?? "—" });
  formatMoneyColumns(sheet, ["orders_accepted_total", "payments_amount", "tips_amount"]);
}

function addMethodSheet(workbook: Workbook, rows: PaymentsByMethodRow[]) {
  const sheet = workbook.addWorksheet("Formas de pago");
  sheet.columns = [
    { header: "Método", key: "method", width: 16 },
    { header: "Pagos", key: "payments_count", width: 10 },
    { header: "Cobrado", key: "amount", width: 14 },
    { header: "Propinas", key: "tips", width: 12 },
    { header: "Total", key: "total_collected", width: 14 },
    { header: "Anulados", key: "voided_count", width: 10 },
    { header: "Monto anulado", key: "voided_amount", width: 14 },
  ];
  styleHeader(sheet.getRow(1));
  for (const row of rows) sheet.addRow(row);
  formatMoneyColumns(sheet, ["amount", "tips", "total_collected", "voided_amount"]);
}

function addPeakHoursSheet(workbook: Workbook, rows: PeakHoursRow[]) {
  const sheet = workbook.addWorksheet("Horas pico");
  sheet.columns = [
    { header: "Día", key: "day", width: 10 },
    { header: "Hora", key: "hour", width: 8 },
    { header: "Pedidos", key: "orders_count", width: 10 },
    { header: "Ítems", key: "items_count", width: 10 },
    { header: "Venta", key: "orders_total", width: 14 },
  ];
  styleHeader(sheet.getRow(1));
  for (const row of rows) {
    sheet.addRow({
      day: DAY_LABEL[row.isodow - 1] ?? row.isodow,
      hour: row.hour,
      orders_count: row.orders_count,
      items_count: row.items_count,
      orders_total: row.orders_total,
    });
  }
  formatMoneyColumns(sheet, ["orders_total"]);
}

function addPrepTimesSheet(workbook: Workbook, rows: PrepTimesRow[]) {
  const sheet = workbook.addWorksheet("Tiempos de cocina");
  sheet.columns = [
    { header: "Etapa", key: "stage", width: 14 },
    { header: "Pedidos", key: "orders_count", width: 10 },
    { header: "Descartados", key: "discarded_count", width: 12 },
    { header: "Promedio (min)", key: "avg_minutes", width: 14 },
    { header: "P50 (min)", key: "p50_minutes", width: 12 },
    { header: "P90 (min)", key: "p90_minutes", width: 12 },
  ];
  styleHeader(sheet.getRow(1));
  for (const row of rows) sheet.addRow(row);
}

function addDiscountsSheet(workbook: Workbook, rows: DiscountRow[]) {
  const sheet = workbook.addWorksheet("Descuentos");
  sheet.columns = [
    { header: "Fecha", key: "business_date", width: 12 },
    { header: "Cuenta #", key: "bill_number", width: 10 },
    { header: "Estado", key: "bill_status", width: 10 },
    { header: "Mesa", key: "table", width: 14 },
    { header: "Alcance", key: "product_name", width: 20 },
    { header: "Tipo", key: "kind", width: 10 },
    { header: "Valor", key: "value", width: 10 },
    { header: "Monto", key: "amount", width: 12 },
    { header: "Motivo", key: "reason", width: 24 },
    { header: "Aplicado por", key: "applied_by_name", width: 20 },
  ];
  styleHeader(sheet.getRow(1));
  for (const row of rows) {
    sheet.addRow({
      business_date: row.business_date,
      bill_number: row.bill_number,
      bill_status: row.bill_status,
      table: row.place_label ?? row.table_name ?? (row.table_number ? `Mesa ${row.table_number}` : "—"),
      product_name: row.product_name ?? "Toda la cuenta",
      kind: row.kind,
      value: row.value,
      amount: row.amount,
      reason: row.reason ?? "",
      applied_by_name: row.applied_by_name,
    });
  }
  formatMoneyColumns(sheet, ["amount"]);
}

function formatMoneyColumns(sheet: Worksheet, keys: string[]) {
  for (const key of keys) {
    const col = sheet.getColumn(key);
    col.numFmt = MONEY_FMT;
  }
}
