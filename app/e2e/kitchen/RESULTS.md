# M18 · Unit 5 — Kitchen KDS (monky-qa) — results

Date: 2026-10-25. Command: `E2E_BASE_URL=http://localhost:3325 npx playwright test e2e/kitchen --project=chromium --workers=1` (`next dev`, restaurant `monky-qa`).

Spec: `app/e2e/kitchen/kitchen-kds.spec.ts`. The order is located by a unique customer name (`QA KDS <stamp>`) with the note `QA E2E kitchen`, never by position.

## Cases

| Case | Result |
|---|---|
| P9 · owner creates a "Para llevar" order (QA dish "Agua QA", note) | PASS |
| P9 · kitchen (separate context) sees the ticket without reloading | PASS |
| Case 14 · counter counts tickets (comandas), not orders: counter == ticket cards rendered, order = exactly 1 "Comanda 1", counter >= 1 (consistency, no absolute values: other units create orders concurrently) | PASS |
| P9 · "Comanda lista" removes it from pending | PASS |
| P9 · ticket is in history with "Lista" badge | PASS |
| P9 · "Devolver a preparación" removes it from history | PASS |
| P9 · returned ticket reappears in /kitchen after a hard reload, "Comanda lista" again, back in history | PASS |
| Order note "QA E2E kitchen" shown on the KDS ticket | FAIL — bug 1 |
| Returned ticket visible when going back to /kitchen via the "Volver a cocina" link (no reload) | FAIL (intermittent) — bug 2 |
| Owner delivers the order ("Entregado" + confirmation) and charges it in cash (cash session was open); sheet shows "Cuenta finalizada" | PASS |
| Case 15 · fullscreen KDS (Esc / exit button) | MANUAL, skipped by design |

The two FAIL rows are `expect.soft` assertions, so they do not stop the flow: everything else was exercised in the same run. Overall the test is red until the app bugs are fixed.

Note: the KDS has no separate "preparing" state; tickets go pending -> ready (`Comanda lista`) and back with "Devolver a preparación". Marking a ticket ready does not set the order to READY, so the orders board still shows "En cocina" and asks "Cocina aún no lo marcó listo" on "Entregado"; the test confirms that dialog.

## Bugs (not fixed, per scope)

### 1. Order comment does not reach the kitchen ticket (counter orders)
- Steps: owner > /orders > "Nuevo pedido" > "Para llevar" > add "Agua QA", fill "Comentario para cocina (opcional)" = `QA E2E kitchen` > "Enviar a cocina · cobrar después". Kitchen opens /kitchen.
- Expected: the ticket shows the "Nota del pedido" block with `QA E2E kitchen` (`kds-ticket-card.tsx` renders `ticket.order_notes`).
- Actual: the ticket has no note block. The comment is saved (visible in the owner's order detail dialog), so it is not copied to `order_notes` on the kitchen ticket for counter orders. Printed ticket likely affected too (same field).
- Screenshot: run `kitchen-kds.spec.ts`; Playwright attaches it on failure (`test-results/.../test-failed-*.png`, not committed).

### 2. /kitchen can show stale data after "Devolver a preparación" (intermittent, 3 of 4 runs)
- Steps: kitchen > history > "Devolver a preparación" on a ticket > click "Volver a cocina".
- Expected: the returned ticket is listed as pending (the action calls `revalidatePath("/kitchen")`; the board also refetches on live events).
- Actual: the pending counter and list do not include the ticket for at least 10 s; a hard reload shows it (counter +1).
- Suspected cause (not verified): client router cache of /kitchen on soft navigation plus no refetch trigger.

## Leftovers on monky-qa

Earlier iterations of this unit (failed runs while developing the spec) left a few "QA KDS ..." orders; they were completed in kitchen, delivered and charged by a throwaway cleanup. One exploratory order, "Para llevar #2" (Pedido #41, "Agua QA", $1,25), may still be unpaid; the final spec leaves nothing open.
