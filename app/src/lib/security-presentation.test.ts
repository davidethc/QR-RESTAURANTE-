import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SecurityList } from "@/app/(dashboard)/security/_components/security-list";
import Loading from "@/app/(dashboard)/security/loading";
import { groupSecurityEvents, type SecurityEvent } from "./security-history";
const member = "11111111-1111-4111-8111-111111111111";
const order = "22222222-2222-4222-8222-222222222222";
const event: SecurityEvent = { id: "event-1", restaurant_id: "qa", group_key: "group-1", created_at: "2026-10-21T17:30:00Z", actor_user_id: member, action: "REJECT_ORDER", event_type: "order_cancelled", entity_type: "ORDER", entity_id: order, amount: 0, cash_movement_type: null, cash_movement_reason: null, cash_difference: -2.5, reason: "Pedido duplicado", metadata: { private: "no-renderizar-metadata" } };
function html(events: SecurityEvent[], filtered = false) {
  return renderToStaticMarkup(createElement(SecurityList, { groups: groupSecurityEvents(events), members: [{ id: member, name: "Ana" }], filtered }));
}
describe("presentación del historial", () => {
  it("vacío invita a revisar cuando ocurra una acción sensible", () => {
    expect(html([])).toContain("En cuanto haya una acción sensible, aparecerá aquí");
    expect(html([], true)).toContain("No hay eventos con estos filtros");
    expect(html([])).not.toContain("Ver pedido");
  });
  it("carga anuncia estado sin anticipar un total ni un vacío", () => {
    const markup = renderToStaticMarkup(createElement(Loading));
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Cargando historial");
    expect(markup).not.toContain("Todavía no hay");
    expect(markup).not.toContain("0 grupos");
  });
  it("cancelación muestra persona, fecha local, motivo y enlace al pedido", () => {
    const markup = html([event]);
    expect(markup).toContain("Ana");
    expect(markup).toContain("Pedido cancelado");
    expect(markup).toContain("12:30");
    expect(markup).toContain("Pedido duplicado");
    expect(markup).toContain(`/security/orders/${order}`);
    expect(markup).not.toContain("no-renderizar-metadata");
  });
  it("conserva importe cero y diferencia negativa", () => {
    const markup = html([event]);
    expect(markup).toContain("0,00");
    expect(markup).toContain("2,50");
    expect(markup).toContain("Diferencia de efectivo");
  });
  it("actor ausente y sistema tienen nombres seguros", () => {
    expect(html([{ ...event, actor_user_id: order }])).toContain("Miembro no disponible");
    expect(html([{ ...event, actor_user_id: null }])).toContain("Acción del sistema");
  });
});
