# Physical-Media Commerce Vertical — Implementation Plan

**Status:** Phase P0 **complete, validated, and DEPLOYED to production** (schema + RLS + money math, committed `84b6be7`; validated against an isolated local Postgres, then applied to the live project via `supabase db push` and re-verified with `get_advisors` on 2026-07-13 — see `CHANGELOG.md`). **P1 is now unblocked.** Decisions §10 #2–4 still open. · **Author:** Claude · **Date:** 2026-07-13

## 1. Context — why this is the differentiator

Per the audit (`movieknight-audit-report.md` §3, §9), the physical-media marketplace is the one vertical no competitor (Letterboxd/Trakt/JustWatch/Serializd) offers, and it currently has **zero code**. The strategic value isn't "an online store" — it's the **integration**: a collector browsing a film's detail page can buy or sell the physical disc, linked to the *same* `titles` catalog that powers tracking, discovery, and social. That FK from a product to `titles.id` is the moat.

This plan reuses the stack already in place — Supabase (Postgres + RLS), Next.js 16 App Router, Zustand, the `lib/supabase-server.ts` service-client pattern for trusted mutations — rather than introducing anything new except a payment processor.

## 2. The one fork that changes everything — fulfillment model

Everything downstream (schema, payments, effort, risk) depends on this:

| | **A. First-party retail** | **B. P2P marketplace** (recommended for the "collector" positioning) |
|---|---|---|
| Who sells | MovieKnight holds inventory, sells directly | Users list their own discs; MovieKnight takes a fee |
| Payments | Stripe Checkout (one payee) | **Stripe Connect** (split payment → seller payout) |
| Complexity | Lower — one seller, simple orders | Higher — seller onboarding, payouts, disputes, ratings |
| Differentiator strength | Moderate (it's a store) | **High** — a Discogs-for-physical-media around the catalog |
| Build time (solo) | ~2 weeks | ~4–5 weeks |

**Recommendation:** Start with a **first-party retail MVP** (model A) to prove the catalog→cart→checkout→order loop end-to-end fast, but **design the schema so model B is an additive migration** (a `seller_id` on listings, nullable = first-party). This de-risks the big build: you get a shippable store in ~2 weeks and can layer the marketplace on once the core loop is proven. The rest of this plan assumes that staged approach.

## 3. Data model (new migration, `supabase/migrations/`)

All tables FK to the existing `titles(id)` where a product represents a physical edition of a tracked film/show. New tables:

- **`product_editions`** — a physical edition of a title. `id`, `title_id → titles(id)`, `format` (`dvd`|`bluray`|`4k`|`vhs`|`boxset`), `edition_name` (e.g. "Criterion #712"), `region` (`A`|`B`|`1`|`2`…), `upc`, `cover_image_url`, `created_at`.
- **`listings`** — something for sale. `id`, `edition_id → product_editions`, `seller_id → profiles(id)` *(NULL = first-party; the model-B hook)*, `condition` (`new`|`like_new`|`good`|`fair`), `price_cents`, `currency` (default `CAD`), `quantity`, `status` (`active`|`sold`|`paused`), `created_at`.
- **`carts`** / **`cart_items`** — server-persisted cart keyed by `user_id`; `cart_items(cart_id, listing_id, quantity)`. (Client mirror in Zustand for instant UX.)
- **`orders`** — `id`, `buyer_id → profiles`, `status` (`pending`|`paid`|`fulfilled`|`cancelled`|`refunded`), `subtotal_cents`, `tax_cents`, `shipping_cents`, `total_cents`, `currency`, `stripe_payment_intent_id`, `shipping_address_id`, `created_at`.
- **`order_items`** — snapshot of each purchased line (`order_id`, `listing_id`, `edition_id`, `title_id`, `unit_price_cents`, `quantity`, and denormalized title/edition text so history survives a listing deletion).
- **`shipping_addresses`** — `id`, `user_id`, name/line1/line2/city/province/postal/country. (Canadian provinces enum for tax.)

**RLS** (mirrors existing conventions in `docs/database.md`): buyers read/write only their own cart/orders/addresses; listings are public-read, writable only by their `seller_id` (or service-role for first-party); orders are inserted server-side only (service client) after payment confirmation, never directly by the client.

## 4. Payments (Stripe) — and the security boundary

- **Model A:** Stripe **Checkout Sessions** (hosted) or Payment Intents. Simplest, PCI-minimal.
- **Model B:** Stripe **Connect** (Express accounts) for seller payouts + application fee.
- **Flow:** client calls a Next.js route handler (`app/api/checkout/route.ts`) → server creates a PaymentIntent/Checkout Session with the server-side secret key → returns client secret → Stripe.js collects card data **in Stripe's iframe** → a **webhook** (`app/api/webhooks/stripe/route.ts`, signature-verified) marks the order `paid` and decrements inventory via the service client.
- **Security boundary (hard rule):** the app **never** sees or stores card numbers — Stripe Elements/Checkout handles all card data. **You** create the Stripe account and provide `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` as env vars; I never enter payment credentials. This matches the project's existing env pattern (`lib/env.ts`).

## 5. Cart & checkout UX

- Cart in Zustand (`lib/store.ts` already the global store) for instant add/remove, synced to `cart_items` server-side on change (debounced), so it survives devices — consistent with the app's "real-time cross-device sync" positioning.
- Checkout: address → review (tax + shipping computed server-side) → Stripe → confirmation. Guest checkout deferred (auth already exists; require login for v1).

## 6. Canadian-market specifics

- **Currency:** CAD throughout (`price_cents`, `currency`).
- **Tax:** GST/HST/PST varies by destination province (5%–15%). A server-side `computeTax(province, subtotal)` helper + a `tax_rates` reference table (13 provinces/territories). Computed at checkout, stored on the order.
- **Shipping:** flat-rate or weight-tiered table to start; Canada Post API integration is a later enhancement.

## 7. UI surfaces (Next.js App Router)

- `app/(app)/shop/page.tsx` — browse editions (reuses the `TitleCard`/grid patterns).
- Buy/sell panel **on the existing title detail page** (`DetailClient.tsx`) — the key integration point: "Own it / Buy it / Sell yours."
- `app/(app)/cart/page.tsx`, `app/(app)/checkout/page.tsx`, `app/(app)/orders/page.tsx` (history).
- Model B later: `app/(app)/sell/…` seller listing flow + seller dashboard.

## 8. Testing & ops (closes audit gaps in the same stroke)

- Unit tests (Vitest, now in place): tax computation, cart totals, order-total math — pure functions, high-value to lock down since money is involved.
- A Stripe **test-mode** e2e of the checkout flow before go-live.
- Webhook idempotency (Stripe retries) + order-state machine tests.

## 9. Phasing & effort (solo build time, honest hours/days)

| Phase | Scope | Effort | "Done" when | Status |
|---|---|---|---|---|
| **P0** Schema + RLS | All tables, RLS policies, tax reference data, seed a few editions, money-math helpers + tests | 2 days | Migration applies; RLS verified; can query editions for a title | ✅ **Done and DEPLOYED** (`84b6be7`); validated locally, applied to prod, and re-verified via `get_advisors` on 2026-07-13 |
| **P1** Catalog + cart | Shop page, detail-page buy panel, Zustand+server cart | 3 days | Add-to-cart works cross-device; cart persists | ⬜ **Unblocked, not started** — live tables are ready to build against |
| **P2** Checkout + Stripe (test mode) | Checkout route, PaymentIntent, webhook, order creation, tax/shipping calc | 3–4 days | Test-mode purchase creates a `paid` order; inventory decrements | ⬜ Blocked on your Stripe account + §10 #2 |
| **P3** Orders + polish | Order history, emails/confirmation, edge cases, tests | 2 days | Buyer sees order history; refund path defined | ⬜ Not started |
| **P4** (optional, model B) | Seller listings, Stripe Connect payouts, seller dashboard | +2 weeks | A user can list, sell, and get paid out | ⬜ Not started |

**Done in P0:** `supabase/migrations/20260712000001_commerce_schema.sql` (8 tables + RLS + 13-province tax seed + first-party listing seeds) and `lib/commerce.ts` (+ 16 tests) — validated locally against an isolated Postgres instance, then **applied to the live Supabase project** (`supabase db push`, 2026-07-13) and confirmed via a post-deploy `get_advisors` re-run. **P1 is unblocked** — the shop page, buy panel, and cart can now be built against real live tables. (Note: `deploy-migrations.yml`'s auto-apply-on-push was found broken during this deploy — invalid `--project-ref` flag on `db push` — and has been fixed. The `SUPABASE_DB_PASSWORD` Actions secret was added 2026-07-13, so future migration pushes to `master` auto-deploy.)

**First-party MVP (P0–P3): ~2 weeks.** Marketplace (P4): +2 weeks. Deployed behind a feature flag until the Stripe account is live.

## 10. Decisions I need from you before building

1. **Fulfillment model** — confirm the recommended path (first-party MVP now, marketplace-ready schema, P2P later) vs. going straight to P2P.
2. **Stripe** — do you have (or will you create) a Stripe account? I build the integration; you own the account + keys. Any preference for Checkout (hosted) vs. Elements (in-app)?
3. **Inventory source (model A)** — where does first-party stock/pricing come from (manual admin entry to start is fine)?
4. **Scope of v1 catalog** — every tracked title, or a curated subset of editions to seed?

## 11. What I'll build first, on your go-ahead

Phase **P0** (schema + RLS + tax/shipping reference + a handful of seeded editions) — it's self-contained, unblocks everything else, involves no payment credentials, and is fully testable. I'll open it as its own migration + a Vitest suite for the tax/total math, then check in before wiring Stripe.
