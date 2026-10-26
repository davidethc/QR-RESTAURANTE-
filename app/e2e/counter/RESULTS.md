# Counter orders E2E results (M18 P5-P7, cases 12 and 21)

Date: 2026-10-25. Restaurant: `monky-qa`. Command:
`E2E_BASE_URL=http://localhost:3324 npx playwright test e2e/counter --project=chromium --workers=1`

| Case | Result | Notes |
|---|---|---|
| P5 "Para comer aquí" created from "Nuevo pedido" | FAIL (app gap, test is `test.fail`) | See bug 1 |
| P6 takeaway: create + charge | PASS | Cash session was open; charged in cash |
| P7 delivery (name "QA E2E", phone, address): create + charge | PASS | Created unpaid, then charged |
| Case 21 phone prefilled on edit | PASS | Phone field of "Editar pedido" holds the saved value |
| Case 12 counter cancel asks for reason | PASS | Empty reason keeps dialog open with an error; "QA E2E" cancels |

Playwright summary: 4 tests, 3 passed + 1 expected failure (P5). tsc, eslint (e2e/counter) and vitest (599) green.

## Bugs / gaps

1. "Para comer aquí" cannot be created from "Nuevo pedido"
   - Steps: owner, /orders, "Nuevo pedido".
   - Expected: type picker offers "Para comer aquí" (dine-in without table) next to "Para llevar" and "Domicilio" (M18 P5).
   - Actual: picker offers only "Para llevar", "Mesa", "Domicilio". The old counter modal still supports `dine_in_no_table`, but it is edit-only. Existing "Para comer aquí" orders are listed in the panel.
   - Screenshot: none (assertion on picker contents; `test-results/` is not committed).

## Notes

- Cancel flow is reached through the charge sheet ("Cancelar venta"), only while the order has no payments.
- Everything created is labelled "QA E2E"; every order is either paid or cancelled.
- Setup needed `app/.env.local` linked besides `.env.qa.local` (not committed).

## 2026-10-25 · re-run after fixes (fix/m18-bugs)

- P5 fixed: "Nuevo pedido" now offers "Para comer aquí" (saved as `dine_in_no_table`). The test now creates and charges a dine-in order instead of expecting a failure.
- `npx playwright test e2e/counter --project=chromium --workers=1`: 4/4 passed.
