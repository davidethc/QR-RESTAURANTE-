# E2E online orders (unit 2) - results

Date: 2026-10-25. Restaurant: `monky-qa`. Command:
`E2E_BASE_URL=http://localhost:3322 npx playwright test e2e/online --project=chromium --workers=1`

| Case | Result |
|---|---|
| Customer switches delivery <-> pickup on mobile (390x844) | PASS |
| Customer places pickup order "QA E2E", staff sees it in /orders, rejects with reason "QA E2E" | SKIPPED (see below) |

## Skip reason

`/pedir/monky-qa` shows "Pedidos en línea en pausa" / "Puedes ver el menú; los pedidos están cerrados".
The digital menu is paused for monky-qa. Per the unit rules it was not reactivated, so the order flow
(M18 P8, case 4) was NOT exercised end to end. The spec is written and selectors were derived from
the source (order-sheet.tsx, online-orders-panel.tsx), but they are unverified against a live order.
It runs automatically once the owner resumes online orders for monky-qa.

Note: the spec finishes the order by rejecting it with reason "QA E2E" from the "En línea" panel, because
online orders are accepted into the kitchen flow and charging is outside the panel.

## Real bugs

None found.

## Environment note

A worktree without `app/.env.local` makes login fail ("Your project's URL and Key are required to create a
Supabase client"); not an app bug.

## 2026-10-26 · re-run with the digital menu active

- Locators fixed: "Tus datos" (two matches) and the submit button (a hidden `sr-only` submit shares the name "Enviar pedido"; the test clicks the visible "Enviar pedido $…").
- `npx playwright test e2e/online --project=chromium --workers=1`: 2/2 passed. The pickup order is placed, appears to staff in "En línea" and is closed with reason "QA E2E" inside the system.
