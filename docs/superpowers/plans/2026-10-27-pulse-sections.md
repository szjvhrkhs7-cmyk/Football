# Pulse expense sections implementation plan

**Goal:** Implement the approved mobile reference with three open expense sections: Квартира, Кредит, Остальное; independent add buttons; compact balance/budget; no involuntary interaction zoom.
**Architecture:** Extend each expense with an optional normalized `sectionId` (home, credit, other). Preserve categoryId, payment history, local keys, Supabase payload and monthly budget calculation. Existing home/credit categories provide deterministic migration; explicit section choices take precedence.
**Tech stack:** Static HTML/CSS/JavaScript, jsdom/node:test, existing Supabase JS 2.45.4. GitHub Pages at the existing Football/pulse URL.
**Spec:** User-approved reference and sketch in the current conversation, 2026-10-27.

## Constraints
- Three open sections in fixed order, including when empty, each with its subtotal and add button.
- Category remains independent from section. Existing records, budgets, account isolation and hidden legacy collections survive.
- No new analytics or payment workflow. Preserve the current simplified app's central add action and profile, without reintroducing removed screens from illustrative mockup chrome.
- Automatic zoom prevention must retain deliberate pinch zoom. Check input sizing, touch actions, viewport and narrow layouts; do not disable user scaling.
- No backend schema, dependency or authorization changes.

## Review focus
- Legacy and custom home/credit categories, explicit section override, invalid imported section values.
- Edit/move/delete/undo/reload, fractional money, cancelled and out-of-month expenses.
- Sync round trip and independent edits retain sectionId and existing payment metadata.
- 320px and long names/large amounts; keyboard-safe sheet and date controls.
- Pinch zoom must not be mistaken for keyboard opening.

## Tasks
- [x] 1. Add failing DOM and sync regressions for grouping, independent categories, migrations, move/reload/undo and pinch zoom. Implement normalization, group rendering, section picker and save. Run npm test and npm run check.
- [x] 2. Match the reference's compact warm layout, apply form/touch safeguards, bump offline asset versions. Use managed preview and browser UI for adding/editing/refresh. Review diff, run full checks, publish only pulse/docs changes through GitHub, verify Pages deployment and live version.

## Progress
Baseline: 46 tests passed. Fresh dedicated clone on feat/pulse-expense-sections. Actual Safari auto zoom not reproducible in available Chromium; no input below 16px in current desktop computed styles. Verify safeguards without claiming a native Safari test.

Validation: 51/51 node tests; syntax and whitespace checks pass. Four new tests failed before implementation and passed after. CUA tested creation, section moves and reload; iframe viewports 320/390/768 have no horizontal overflow; form fields 17/20px, dates full width. Native Safari and authenticated cloud unavailable. Final independent review found a stale keyboard-layout state after zoom then keyboard dismissal. Added a failing regression and fixed scale-normalized viewport measurements; 51/51 suite passed. No migration, sync or access findings. Publication pending.
