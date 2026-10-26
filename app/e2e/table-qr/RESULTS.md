# Table 2 + QR: E2E results (M18 P3, P4)

Date: 2026-10-25. Restaurant: `monky-qa` only, table 2 only. Run against `next dev -p 3323`,
`npx playwright test e2e/table-qr --project=chromium --workers=1`: **6 passed (1.2 min)**.

| Test | Covers | Result |
|---|---|---|
| prep: table 2 starts free | Settles/closes an old session through the UI if present | PASS |
| case 12 + 13 | Cancelling an order with an empty reason is rejected ("motivo") and the order stays; with reason "QA E2E" it is cancelled and "Cobrar y liberar" disappears | PASS |
| P3 + case 24 | Waiter opens table 2, sends a ticket with note "QA E2E"; "Separar uno" keeps the total units (2 before, 2 after, two lines) | PASS |
| case 17 | QR token is a UUID (not a number); `/scan/2` goes to `/qr-invalido`; plain `/r/monky-qa/2` without cookie gives no table session | PASS |
| P4 + case 16 | Mobile QR client names the table, orders (with note), calls the waiter and asks for the bill; owner and waiter contexts see the new order, "Llamando al mesero" and "Pide cuenta" within 5 s without reload | PASS |
| close | Owner charges (cash) and delivers the pending kitchen order; table 2 ends "Libre" | PASS |

## Real app bugs

None found in this run.

## Notes

- Table 2 held an old paid/unpaid session from earlier rounds in some runs; the prep test settles it via the UI (charge, or "Forzar cierre" with reason "QA E2E" when no active orders exist). Force close is refused while orders are active ("La mesa tiene pedidos activos"), so charging is used then.
- A paid bill does not release the table until the kitchen order is delivered ("El pedido sigue en cocina"). The close test therefore delivers table 2 orders from `/orders?table=2` and waits for the "Deshacer" window to expire (navigating away earlier cancels the delivery).
- The Next dev indicator overlaps the bottom action bar on a phone viewport; the QR context hides `nextjs-portal` (dev-only).
- Cold `next dev` compiles can take over 15 s; waits for login and first QR load use longer timeouts.
- Whether QR orders needed approval is handled conditionally (approved from staff when "Aprobar" shows); no setting was changed.
- Several earlier runs of this spec left orders on table 2 before the final fixes; all were settled through the UI and table 2 is left free.
