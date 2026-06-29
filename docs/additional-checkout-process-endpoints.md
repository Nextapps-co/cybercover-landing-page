# Checkout Process — Additional Endpoints (Integration)

**Branch:** `fix/create-company-after-payment`
**Date:** 2026-06-29
**Audience:** checkout (guest purchase) frontend team
**Status:** implemented on the branch, not yet released; live verification pending.

---

## Overview

Two new endpoints are added to the anonymous checkout flow so the customer can
recover from the payment screen without abandoning their data:

- **Change payment method — NEW (HIGH).** On a confirmed, not-yet-paid order the
  customer can switch from **online card (Stripe)** to **bank transfer**. Use this
  for a "Change payment method" button on the payment screen (e.g. after the
  customer hits the browser back button from the Stripe page). The switch is
  **one-way**: once an order is on bank transfer it cannot be switched back, because
  confirming a bank transfer already issues the proforma invoice.
- **Cancel / start over — NEW (MEDIUM).** The customer can cancel the current order
  ("Start over") from any point before payment. Use this for a "Start from the
  beginning" button that returns the user to plan selection; after a successful
  cancel, start a brand-new order with `POST /api/orders/start`.

Both endpoints are **anonymous** (no auth) — like every checkout step after
`POST /api/orders/start`, ownership is established by possessing the `orderId`.
Neither endpoint is breaking; the checkout works unchanged if the frontend does not
adopt them. Adopt them to expose the two buttons.

Where they sit in the existing flow:

```
start → company-data → personal-data → operational-standards → payment-method → confirm
                                                                                    │
                                                          ┌─────────────────────────┤
                                                          │ (CONFIRMED, not paid)   │
                                  online card ────────────┤                         │
                                  stripe-checkout-session  │                         │
                                  → [Stripe payment page]  │                         │
                                          │ back button    │                         │
                                          ▼                ▼                         ▼
                              PATCH …/change-payment-method   POST …/cancel   (pay → fulfilled)
                              (switch to bank transfer)       (start over)
```

---

## Frontend integration checklist

- [ ] **Add a "Change payment method" action** on the payment screen for orders
      confirmed with online card. On click, call
      `PATCH /api/orders/:orderId/change-payment-method` with `{ "paymentMethod": "BANK_TRANSFER" }`.
      On `200`, switch the UI to the **bank-transfer confirmation** view (the response
      carries the `confirmationToken` needed for the confirmation page and proforma
      download — see endpoint 1).
- [ ] **Stop showing "Change payment method"** once the order is already on bank
      transfer (the switch is one-way). If the call returns `409`, treat the order as
      no longer switchable and refresh its state via `GET /api/orders/:orderId`.
- [ ] **Add a "Start over" action** wherever the customer may abandon the current
      order. On click, call `POST /api/orders/:orderId/cancel` (no body). On `200`, route
      the user to plan selection and begin a fresh order with `POST /api/orders/start`.
- [ ] **Handle the paid race for "Start over":** if `cancel` returns `409`, the order
      was already paid in the meantime — do **not** route to plan selection; refresh the
      order state and continue the post-payment flow instead.
- [ ] **Both calls are safe to retry:** a repeated `cancel` on an already-cancelled
      order returns `200`. A repeated `change-payment-method` after the switch returns
      `409` (already on bank transfer).

---

## Detail

### 1. Change payment method (NEW, HIGH)

```
PATCH /api/orders/:orderId/change-payment-method
Auth: none (anonymous; orderId is the ownership token)
```

**Request body:**

```json
{ "paymentMethod": "BANK_TRANSFER" }
```

- `paymentMethod` is required. The only accepted value is `"BANK_TRANSFER"`.
  Any other value is rejected (see status codes).

**Success response — `200 OK`:**

```json
{
  "orderId": "ord_01HX...",
  "status": "CONFIRMED",
  "paymentMethod": "BANK_TRANSFER",
  "confirmationToken": "deadbeef-1234-4567-89ab-cdef01234567"
}
```

- This is the same shape returned by `POST /api/orders/:orderId/confirm` for a
  bank-transfer order. `confirmationToken` is now populated (it is `null` only for
  online-card orders) and is the token the frontend uses to open the order
  confirmation page (`GET /api/orders/:orderId/confirmation`) and download the
  proforma (`GET /api/orders/:orderId/proforma/download`).

**What the backend does** (no frontend action needed beyond switching the view):

- Sets the order's payment method to bank transfer (the order stays `CONFIRMED`).
- Cancels the pending online-card checkout session so the old Stripe page can no
  longer be paid.
- Issues the **proforma invoice** and creates a pending bank-transfer payment.

**When to call:** the order is `CONFIRMED`, not yet paid, and currently set to online
card (the customer reached the Stripe payment page, came back, and chose bank
transfer instead).

**Status codes:**

| Code  | When                                                                                                                        | Frontend handling                                                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `200` | Switched to bank transfer                                                                                                   | Show the bank-transfer confirmation view using `confirmationToken`          |
| `400` | `paymentMethod` missing or not a valid value                                                                                | Validation error — fix the request                                          |
| `404` | Unknown `orderId`                                                                                                           | Order not found                                                             |
| `409` | Not switchable: order is not `CONFIRMED`, is already on bank transfer, was already paid, or the target is not bank transfer | Hide/disable the action; refresh order state via `GET /api/orders/:orderId` |

**One-way rule:** there is no bank-transfer → online-card switch. Once an order is
on bank transfer the proforma has been sent, so the action must not be offered.

---

### 2. Cancel / start over (NEW, MEDIUM)

```
POST /api/orders/:orderId/cancel
Auth: none (anonymous; orderId is the ownership token)
```

**Request body:** none.

**Success response — `200 OK`:**

```json
{ "orderId": "ord_01HX...", "status": "CANCELLED" }
```

**What the backend does:**

- Marks the order `CANCELLED` (soft cancel — the order is not deleted).
- Cancels any pending online-card checkout session so it can no longer be paid.
- If a proforma was already issued (bank transfer), it is voided on the backend.

**When to call:** the customer wants to abandon the current order and start fresh.
Allowed while the order is in progress and **not yet paid** (`DRAFT` or `CONFIRMED`).
After a successful cancel, route to plan selection and create a new order with
`POST /api/orders/start` — do **not** reuse the cancelled `orderId`.

**Idempotent:** calling `cancel` again on an already-cancelled order returns `200`
with `status: "CANCELLED"` (no error). Safe for double-clicks.

**Status codes:**

| Code  | When                                                   | Frontend handling                                                                                                 |
| ----- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `200` | Order cancelled (or already cancelled)                 | Route to plan selection; start a new order                                                                        |
| `404` | Unknown `orderId`                                      | Order not found                                                                                                   |
| `409` | Order already **paid** (`PENDING_ALLOCATION` or later) | Do not route to plan selection; the purchase already completed — refresh state and continue the post-payment flow |

---

## Notes

- These endpoints are part of the anonymous checkout surface (base path
  `/api/orders`) and share its per-IP rate limit. Send `Content-Type: application/json`
  on the `change-payment-method` request.
- The `:orderId` is the same value returned by `POST /api/orders/start` and used by
  every other checkout step.
- A short timing window exists for both actions: if the customer completes the online
  card payment at the exact moment they click "change method" or "start over", the
  call returns `409` (the order is now paid). Treat `409` as "too late — refresh and
  continue", per the status-code tables above.
- The proforma / confirmation download flow for bank-transfer orders is unchanged —
  `GET /api/orders/:orderId/confirmation` and
  `GET /api/orders/:orderId/proforma/download`, both gated by the `confirmationToken`
  returned in endpoint 1's response.
- Backend behavior is described in the module docs
  ([`apps/cybercover-api-gateway/src/sales-order/README.md`](../apps/cybercover-api-gateway/src/sales-order/README.md));
  this document is the frontend-facing contract only.
