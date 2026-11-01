# Repayment implementation
Goal: integrate November2026 monthly repayment ledger and forecast into Pulse.
Spec: ../specs/2026-11-01-repayment-design.md
Architecture: pure repayment.js model plus app.js UI; index monthly dialog; scoped CSS. Existing state/cloud payload adds repayment.months records keyed month. No backend schema changes.
Review focus: interest and rounding, replacement not double-counting, missing months vs future projections, overpayments and zero balances, per-month merge/storage rollback, no fictitious savings.
- [x] Write failing model tests for initial balances, first-month interest/payment, editing history, missing month, corrections, payoff cap, forecast snowball and non-amortization.
- [x] Implement model normalize/calculate/forecast and test.
- [x] Add app monthly form tests and sync roundtrip; implement UI and persistence.
- [x] Verify full suite, syntax, mobile preview; independent review.
- [x] Bump1.11.0, publish atomic Github update and verify deployment.

Validation: 86/86 tests, syntax and diff checks pass. Mobile-width browser form and private configuration loading checked with synthetic data. Independent review found two import/first-sync edge cases, both reproduced RED and fixed GREEN. Personal loan values live only in private account payload; public tests use synthetic figures. Physical iPhone not available.
