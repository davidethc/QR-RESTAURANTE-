# Cash and shared settings (unit 6) — 2026-10-26

Restaurant: `monky-qa` only. Command:
`E2E_BASE_URL=http://localhost:3326 npx playwright test e2e/cash-settings --project=chromium --workers=1`
Result: 5 passed, 1 failed (real app bug), 1 skipped (feature absent).

| Case | Result | Notes |
|---|---|---|
| P10 cash in / cash out "QA E2E" ($5 in "Refuerzo de fondo", $5 out "Retiro", net zero) | PASS | Notes visible in `/cash/movimientos` |
| P11 + case 10 blind cut | PASS | Leftover unpaid counter orders (Para llevar #1, #3, Domicilio #4) charged through the UI first; no "Omitir" used. Wizard never shows an expected amount; denomination calculator used; result badge Exacto/Faltante/Sobrante shown on the cut page; register re-opened afterwards |
| Case 18 QR approval vs direct | PASS | Toggled and persisted after reload, restored |
| P12 pause / resume digital menu | PASS | `/pedir/monky-qa` shows "Pedidos en línea en pausa", then works again |
| P2 sold-out variant | FAIL | See bug 1. `/availability` and `/today` show Agotado; public menu does not |
| Cases 1–2 promotions | PASS | Weekday selector starts empty ("Todavía no elegiste ningún día"); "QA E2E promo" (date range today→tomorrow, 1 product, -10%) created and deleted |
| Case 26 tips toggle | SKIPPED (`fixme`) | There is no restaurant-level tips on/off setting; tips are chosen per payment (chips "Sin propina", %, custom) |

## Settings touched (original → final)

| Setting | Original | Final |
|---|---|---|
| QR orders (`/settings`) | recorded at run start, restored by the test (case 18 and `afterAll`) | same as original |
| Digital menu (online orders) | was PAUSED when found | ACTIVE (deliberate, so `online/pickup-order.spec.ts` can run) |
| Cash register | open | open (new session opened after the cut; the cut closed the previous one) |
| Product "Agua QA" availability | available | available (restored in `finally`) |
| "QA E2E promo" | did not exist | deleted |

## Bugs

1. **Variant sold out in `/availability` does not show Agotado in the public menu.**
   - Steps: owner → `/availability` → switch "Agua QA" to Agotado → open `/pedir/monky-qa`, expand every category, reload for 60 s.
   - Expected: "Agua QA" card shows "Agotado hoy" (as `/today` and `/availability` do).
   - Actual: card shows normally with the add button. `get_public_menu` reads `products.available` (migration 044), while `set_item_availability` flips the variant; `refreshPublicMenuTag` is called but the public RPC does not use the variant flag.
   - Screenshot: `app/test-results/cash-settings-cash-setting-78dcf-gotado-then-available-again-chromium/test-failed-1.png` (taken after the restore; the public page itself showed the product available).

## Other unit

`e2e/online/pickup-order.spec.ts` run once with the menu ACTIVE: 1 passed, 1 failed — test-side strict-mode violation (`getByRole('dialog').getByText('Tus datos')` matches 2 elements). Not an app bug; that unit's locator needs `.first()`/exact.
