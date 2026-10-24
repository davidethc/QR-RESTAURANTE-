# Tanda 4 · Database contract (M13 promotions, M12 digital menu, M16 printing)

Migrations (expand only, apply in this order): `20261024100000_m13_promotions.sql`,
`20261024110000_m12_digital_menu.sql`, `20261024120000_m16_printing.sql`.
Tests: `app/supabase/tests/m13_promotions.sql`, `m12_digital_menu.sql`, `m16_printing.sql`
(BEGIN … ROLLBACK, restaurant `monky-qa`).

All RPCs are `SECURITY DEFINER`, `search_path ''`. Errors are Spanish `RAISE` messages; field errors carry
`HINT 'field=<name>'` (same convention as M06). "Staff" below means an authenticated, ACTIVE member.

## M13 · Promotions

### Table `promotions`
`id, restaurant_id, name (1–80), type ('discount'|'buy_x_get_y'), value_type ('percent'|'fixed'), value,
receive_qty, buy_qty, applies_to ('products'|'categories'), target_ids uuid[], weekdays int[] (0=Sunday…6)
| starts_on/ends_on date, service_options jsonb, status ('active'|'paused'), created_by, created_at, updated_at`.
Exactly one activation form; `buy_x_get_y` only with weekdays. RLS: staff can SELECT; no direct writes.

### RPCs
| RPC | Params | Returns | Who |
|---|---|---|---|
| `save_promotion` | `p_restaurant_id, p_data jsonb, p_promotion_id uuid = null` | promotion row (jsonb) | OWNER, ADMIN, roles[] ADMIN/MENU_MANAGER |
| `delete_promotion` | `p_promotion_id` | void (hard delete) | same |
| `get_active_promotions` | `p_restaurant_id, p_channel text = null` | `[{id,name,type,value_type,value,receive_qty,buy_qty,applies_to,target_ids,service_options,label}]` active **today** (local) | staff |
| `can_manage_menu` | `p_restaurant_id` | boolean (to show/hide the screen) | authenticated |

`p_data` keys: `name, type, value_type, value, receive_qty, buy_qty, applies_to, target_ids[], weekdays[]` **or**
`starts_on + ends_on` (`YYYY-MM-DD`), `service_options` (partial allowed: missing keys = true), `status`.
`save_promotion` with an id replaces every field (send the whole form). Admin list: `select * from promotions`.

### How a promotion changes totals (server-side only)
Channels: `pos.tables`, `pos.dine_in_no_table`, `pos.takeaway`, `pos.delivery`, `digital_menu.tables` (QR),
`digital_menu.pickup`, `digital_menu.delivery`. Every order-creating RPC now prices with its channel:
`create_customer_order` → `digital_menu.tables`; `create_staff_order`, `add_ticket` → `pos.tables`;
`create_counter_order` → `pos.<service_type>`; `create_counter_sale` → `pos.takeaway`;
`add_items_to_bill` → channel of the bill's session; `place_online_order` → `digital_menu.<service_type>`.

Per line, evaluated on the restaurant's **local date** (`restaurants.timezone`, 00:00–23:59 inclusive):
- At most one `discount` and one `buy_x_get_y` apply; for each type the one with the biggest benefit for that line wins.
- `discount`: per unit, on the **variant price only** (modifiers are never discounted):
  percent → `round(variant × value / 100, 2)`; fixed → `least(value, variant)`.
- `buy_x_get_y` (X = `receive_qty`, Y = `buy_qty`): `floor(qty / X) × (X − Y)` units free, each worth the variant
  price **after** the discount. Counted per line (two lines of the same product are not combined).
- `promo_discount = round(unit_disc × qty + free × (variant − unit_disc), 2)`.
  Example §11: 2 × $2.50, 10% + 2x1 → 0.50 + 2.25 = 2.75 off, line pays **$2.25**.

Stored on `order_items`: `unit_price` = list unit price (variant + modifiers, unchanged meaning),
`promo_discount` (new, default 0), `promotions` (new, jsonb snapshot of the applied rules or null),
**`subtotal = unit_price × quantity − promo_discount`** (net). `orders.subtotal/total` and `bills.subtotal` are net,
so the promo is already inside `bills.subtotal`; manual `bill_discounts` apply on top of the net amount.
Deleting/pausing a promotion never changes existing lines. `edit_order_item` (variant change) recomputes the
discount from the line's own snapshot, not from today's promotions.

### `bill_json` additions
Bill: `promo_discount_total`. Each item: `list_subtotal` (= unit_price × quantity), `promo_discount`, `promotions`.
Ticket math: **Productos** = `subtotal + promo_discount_total`; **Descuento** = `promo_discount_total + discount_total`;
**Total** = `total`.

⚠️ Frontend: stop computing `unit_price × quantity` as a line total (staff-order-builder, tickets-detail,
use-charge-amounts). Use `subtotal`. For pay-by-item of k units use `round(subtotal × k / quantity, 2)`.
For struck prices on the menu/POS selector use `get_active_promotions` / `get_digital_menu.promotions` with the
same formulas (display only; the server price is the truth).

## M12 · Digital menu (delivery / pickup)

### Data
- `restaurants`: `digital_menu_status ('inactive'|'active'|'paused')`, `digital_menu_paused_from`,
  `digital_menu_paused_until` (null = until resumed), `whatsapp_number` (E.164), `whatsapp_monthly_volume`
  (`lt_50|50_150|150_500|gt_500`).
- `delivery_settings` (one row, defaults when absent): shipping `quote`, free shipping / min purchase off,
  delivery 25–45 min, pickup 15 min, `unconfirmed_ttl_minutes` 30.
- `payment_method_settings` (per `delivery|pickup`, default cash only) + bank fields. SELECT only for managers.
- `orders`: `confirmed_at`, `expires_at`, `expired_at` (reused from M06/M11: `service_type`, customer fields,
  `shipping_cost` null = "Por cotizar", `preferred_payment_method`, `pays_with_amount`, `status_review`,
  `source = 'web'`). Phone/address remain unreadable by `authenticated`; use `get_order_contact`.
- `online_order_tokens`: customer tracking token (no direct access).

### Public RPCs (anon)
| RPC | Params | Returns |
|---|---|---|
| `get_digital_menu` | `p_slug` | `{restaurant{…,whatsapp_number}, state{status,accepting_orders,reason('paused'|'closed'|'inactive'|null),paused_until,next_open_at,always_open}, delivery{times,free_shipping…,min_purchase…}, payment_methods{delivery,pickup:{cash,card,transfer,bank?}}, promotions[…label,channels], hidden_product_ids{delivery[],pickup[]}}`. Inactive → only `restaurant` + `state`. |
| `quote_online_order` | `p_slug, p_service_type ('delivery'|'pickup'), p_items` | server-priced `lines[]`, `subtotal`, `promo_discount_total`, `shipping{pending,free}`, `free_shipping{min_amount,remaining,reached}`, `min_purchase{…}` |
| `place_online_order` | `p_slug, p_service_type, p_items, p_client_request_id, p_customer_name, p_customer_phone, p_payment_method, p_delivery_address = null, p_pays_with_amount = null, p_general_comment = null` | order json (below) + `replayed` |
| `get_online_order` | `p_token` | order json |
| `confirm_online_order` | `p_token` | order json (step → `confirmed`) |

`p_items` = same shape as every order RPC: `[{product_id, variant_id?, quantity, notes?, modifiers?:[{option_id, qty?}]}]`
(1–50 lines). Catalog still comes from `get_public_menu(p_slug)`; hide `hidden_product_ids[<type>]`.
Order json: `order_id, short_code, folio, service_type, tracking_token, step ('new'|'confirmed'|'preparing'|'ready'|'delivered'|'expired'|'rejected'|'cancelled'), created_at, confirmed_at, expires_at, customer_name, preferred_payment_method, pays_with_amount, general_comment, subtotal, promo_discount_total, shipping_cost, shipping_pending, total, restaurant{name,slug,logo_url,whatsapp_number}, items[{product_name,variant_name,quantity,unit_price,list_subtotal,promo_discount,subtotal,notes,promotions[labels],options[]}]`.
No phone or address is ever returned publicly.

`place_online_order` errors: `HINT state=paused|closed|inactive`, `field=preferred_payment_method|min_purchase|customer_name|customer_phone|delivery_address.*|pays_with_amount|general_comment`, `rate_limit=phone` (≥3 unconfirmed from the same phone in 15 min) / `rate_limit=restaurant` (≥30 unconfirmed in 10 min).
Delivery address keys (validated): `calle, numero, colonia` (required), `entre_calles, referencias, lat, lng`.

### Staff RPCs
| RPC | Params | Who |
|---|---|---|
| `get_digital_menu_settings` | `p_restaurant_id` | OWNER, ADMIN, roles[] ADMIN/BRANCH_MANAGER |
| `set_digital_menu_whatsapp` | `p_restaurant_id, p_whatsapp_number, p_monthly_volume = null` | same (wizard step 1, "change number") |
| `activate_digital_menu` | `p_restaurant_id` | same (wizard step 2, needs WhatsApp) |
| `pause_digital_menu` | `p_restaurant_id, p_preset ('15m'|'30m'|'45m'|'1h'|'2h'|'today'|'indefinite'|'custom'), p_from = null, p_until = null` | same |
| `resume_digital_menu` | `p_restaurant_id` | same |
| `save_delivery_settings` | `p_restaurant_id, p_data jsonb` (patch) | same |
| `save_payment_method_settings` | `p_restaurant_id, p_channel, p_data jsonb` (patch) | same |
| `review_online_order` | `p_order_id` (opening → no longer "Nuevo") | OWNER, ADMIN, WAITER, cashier with register |
| `accept_online_order` | `p_order_id, p_shipping_cost = null` → PREPARING (KDS), confirmed, opens bill | same |
| `reject_online_order` | `p_order_id, p_reason = null` | same |
| `can_manage_digital_menu` / `can_handle_online_orders` | `p_restaurant_id` | authenticated (UI gating) |

Later shipping changes on a delivery order: existing `update_counter_order(p_order_id, {"shipping_cost": n}, p_confirm_total_increase)`.
Charging: existing M07 RPCs; prefill with `orders.preferred_payment_method` / `pays_with_amount`.
Unreviewed counter: existing `get_staff_counters` (`status_review = 'new'`).

### Lifecycle
`place_online_order` → PENDING, `status_review new`, own counter session, **no bill and not in KDS** →
`confirm_online_order` (customer) or `accept_online_order` (staff) sets `confirmed_at` →
`accept_online_order` → PREPARING + bill. Unconfirmed after `expires_at` → `expire_online_orders()` sets
CANCELLED + `expired_at` and closes the session (pg_cron every 5 min if installed; also lazily on every
`place_online_order`; the public step shows `expired` as soon as `expires_at` passes).

## M16 · Printing

`printing_settings` (one row; defaults when absent). RPCs, any active member (spec §6):
`get_printing_settings(p_restaurant_id)` → `{customer_ticket_font_size, customer_ticket_header, customer_ticket_footer, kitchen_ticket_font_size, advanced_printing(false), advanced_printing_available(false), restaurant{name,logo_url,address,phone,timezone}}`;
`save_printing_settings(p_restaurant_id, p_data)` patch with those four keys (empty text clears; `advanced_printing: true` is rejected as "próximamente").
Template data: customer ticket and pre-bill → `bill_json` (via the existing bill RPCs); kitchen ticket →
`get_kitchen_tickets`; cash cut → `get_cash_session_summary` / `list_cash_cuts`; delivery customer block →
`get_order_contact`.

## Assumptions and open product decisions
1. **2x1 + percent order**: percent first, then free units (matches the §11 reference $2.25). Not yet validated by product.
2. **Overlapping promotions**: one per type, biggest benefit wins (no stacking of two discounts). Assumption.
3. **Buy X get Y is per line**, not across lines/tickets of the same product. Assumption (conservative).
4. **Modifiers are not discounted**, and free units still pay their modifiers. Assumption.
5. **Expiry window** default 30 min (`unconfirmed_ttl_minutes`, configurable 5–1440). Spec gives no value.
6. **Online orders wait for staff** (PENDING, not in KDS) until accepted, to avoid cooking orders that may expire.
   Spec §5 says the ticket is "already in the KDS"; if product wants auto-send, change `place_online_order`.
7. **Opening hours** = shifts of all M01 schedules of the restaurant; no shifts = open 24 h.
8. **"Pagará con"** must cover the products subtotal (shipping unknown). Assumption.
9. **Rate limits** 3/phone/15 min and 30/restaurant/10 min. Assumption.
10. **WhatsApp volume buckets** `lt_50|50_150|150_500|gt_500` invented (spec: "enum de rangos").
11. **Printing settings editable by every role** (spec §6 says all roles access the screen); confirm whether
    waiters/kitchen should only read.
12. Promo/channel rules apply to the existing POS/QR paths from now on; product `service_options` are enforced
    **only** on the new `digital_menu.pickup/delivery` channels (existing paths unchanged).
13. Multi-branch link page (§7.3): no `branches` table yet; nothing added.

## Applying
Production has no PITR. Before applying, diff each `create or replace` body in M13 against
`pg_get_functiondef` in production (copied from the repo's latest migrations: m11, m04, caja_cashier_orders,
m07, bill_item_images). Run the tests inside a transaction with the migrations, e.g. build a scratch file
`begin; <m13> <m12> <m16> <test body without its own begin> rollback;` and check it ends with `rollback;`.
