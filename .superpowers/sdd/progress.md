# SDD Progress — checkout recovery endpoints

Plan: docs/superpowers/plans/2026-06-29-checkout-recovery-endpoints.md
Mode: subagent-driven, NO COMMITS (user controls git). Targeted tests only.

- [x] Task 1: Mock layer + DTO types — review clean (Approved). Files: types/order.ts, orders.mock.ts, orders.mock.test.ts (11/11 pass). No commit (user).
  - MINOR (for final fix-wave): add test `cancelOrderMock` on CONFIRMED-unpaid order (primary trigger) in orders.mock.test.ts.
- [x] Task 2: API client wrappers — review clean (Approved, no issues). File: orders.ts. No commit (user).
- [x] Task 3: Shared recovery logic — review clean (Approved). Files: checkout-recovery.ts + .test.ts (9/9 pass). No commit (user).
  - MINOR (for final fix-wave): add `startOverOrder` `{kind:'error'}` test; extend `isPromoZeroOrder` test to cover other 3 PARTNER_* kinds + non-zero partner false case.
- [x] Task 4: StartOverDialog component — review clean (Approved). File: StartOverDialog.tsx. No commit (user).
  - MINOR (optional polish): scrim bg-black/40 vs existing modal /50; export props interface; no focus trap (repo-wide gap, out of scope).
- [x] Task 5: ResumePaymentScreen wiring — review clean (Approved). File: ResumePaymentScreen.tsx. error state is string|null. No commit (user).
  - MINOR (optional polish): change-method `error` branch could route `outcome.error` through `translateApiError` instead of hardcoded string.
- [x] Task 6: ConfirmStep start-over — review clean (Approved). File: ConfirmStep.tsx. Local isPromoZeroOrder removed. No commit (user).
- [x] Task 7: SuccessStatus markOrderPaidForMock — review clean (Approved). File: SuccessStatus.tsx. No commit (user).
- [x] Final Verification — V1: vitest 20/20 pass (mock 11 + recovery 9). V2: astro check UNAVAILABLE (@astrojs/check not installed; did not install deps). V3 substitute: `npm run build` exit 0 "Complete!" (imports resolve, components compile, no syntax errors).
- [x] Final whole-branch review (Opus) — VERDICT: Ready to merge. 0 Critical, 0 Important. Both flows traced end-to-end OK. All findings Minor (reviewer: defer all).
- [x] Fix-wave: M-T1, M-T3a, M-T3b (test gaps), M-T5 (translateApiError) applied. Vitest 22/22 pass; build exit 0. Deferred cosmetic (scrim /40 vs /50, export props iface, focus trap, SuccessStatus local isPromoZeroOrder — out of dedup scope).

## COMPLETE — all tasks done, branch ready to merge. NO COMMITS MADE (user controls git).
Evidence: 22/22 targeted vitest pass; `npm run build` exit 0; final whole-branch review (Opus) = Ready to merge.
