# KASH — Project Instructions

You are working on **KASH**, a personal finance management application.

This file contains permanent project guardrails only.
Detailed product/feature/database behavior belongs in `catatan/`.


## 1. Priority

Use this order:

1. Explicit current task / latest instruction
2. `AGENTS.md`
3. Current approved implementation and canonical shared components
4. Relevant `catatan/` documentation
5. Sensible engineering defaults

Relevant docs:

- `catatan/product-architecture-mvp.md`
- `catatan/information-architecture-user-flow.md`
- `catatan/database-architecture-data-relationship.md`

Newer approved implementation may supersede stale docs.
Do not regress current behavior to outdated requirements.


## 2. Scope

Implement only the requested scope.

Do not use a small task to:

- redesign unrelated pages
- refactor unrelated systems
- add undocumented features/routes
- change financial semantics
- change backend architecture
- add unnecessary dependencies

Preserve approved behavior unless explicitly changed.


## 3. Stack

Use the existing stack:

React, TypeScript, Vite, Tailwind, Supabase/PostgreSQL, React Router,
Lucide Icons, PWA.

Inspect existing code before adding dependencies or abstractions.


## 4. Visual Source of Truth

The current implemented KASH design system and canonical shared components are
the visual source of truth.

Old wireframes are not authoritative unless explicitly requested.

Equivalent interactions across pages must reuse the same component/design tokens.

Do not create page-local design systems.


## 5. UI Consistency

Reuse canonical components where applicable:

- Button / IconButton
- FormField
- SelectField / Combobox
- DatePicker / TimePicker / DateTimePicker
- IconPicker
- Modal
- FilterTabs
- ProgressBar
- StatusBadge
- EmptyState
- Card
- shared formatting utilities

Global rules:

- Emerald is the primary active/focus color
- filters use canonical Emerald active styling
- dropdowns use SelectField
- dates use DatePickerField
- equivalent cards share padding/radius/border/hover
- cards with existing detail routes should be fully clickable
- inner card actions remain independent
- do not create new routes just to make cards clickable


## 6. Layout & Modal

Desktop authenticated pages use the full available width after the sidebar with
consistent responsive padding.

Avoid unnecessary page-level `max-w-*` / `mx-auto`.

Inner forms/readable sections may still use intentional max-width.

Mobile applicable modals use the canonical draggable bottom sheet:
slide-up, slide-down, grabber, drag dismiss, snap-back, internal scroll,
safe-area support.

Desktop modals remain centered dialogs.


## 7. Localization & Formatting

KASH supports Bahasa Indonesia and English.

All system-generated frontend text must use centralized i18n.

Do not translate user-generated content or stored backend enum values.

Language switching must update immediately and must not change currency identity.

Use centralized formatters.

Indonesian IDR examples:

- `Rp1.250.000`
- `Rp500 rb`
- `Rp1,2 jt`
- `Rp2,5 miliar`

Do not use K/M/B for Indonesian compact money.


## 8. Financial Correctness

Financial correctness is authoritative in the established database/views/RPC/
ledger architecture, not React state.

Do not casually change:

- wallet balances
- Net Worth
- transfers/adjustments
- Goals
- Debt/Receivable
- Budget
- Shared Savings

Frontend calculations are for previews/presentation only.

Inspect current implementation + relevant docs before changing financial
semantics.


## 9. Database & Security

Use RLS for private data.

UI hiding is not authorization.

Do not expose unrelated user financial/profile data.

Collaboration may expose only the minimum data needed within the legitimate
shared context.

For DB changes:

- inspect current implementation and relevant DB docs
- make the smallest safe change
- use a new migration
- do not edit applied migrations
- do not silently redesign architecture


## 10. Code Quality

Prefer modular, feature-oriented TypeScript.

Reuse genuinely shared behavior.

Avoid `any`, unsafe casts, over-abstraction, and unnecessary dependencies.

Financial forms must not silently fail.

Use consistent loading and EmptyState patterns.

Maintain keyboard accessibility, visible focus, semantic HTML, and reasonable
touch targets.


## 11. Before / After Implementation

Before substantial work:

1. read the current task
2. read this file
3. read only relevant `catatan/`
4. inspect current implementation
5. reuse canonical components/services
6. check financial/security impact
7. implement only requested scope

Before completion:

- run TypeScript checks
- run production build
- run relevant tests/lint
- run `npm audit --audit-level=moderate`
- verify desktop/mobile behavior
- verify affected financial behavior
- verify no unrelated regressions

Do not claim real-device verification unless actually tested on a real device.


## 12. Final Rule

When uncertain:

1. follow the explicit current task
2. preserve approved behavior
3. inspect current canonical implementation
4. inspect only relevant documentation
5. report material ambiguity instead of inventing behavior

Maintain KASH as it currently exists.
Do not regress newer approved behavior to stale requirements.

## Production Verification — STRICT

Never claim a task is complete, deployed, fixed, or build-safe without direct
verification.

### Frontend / Netlify

KASH production build is authoritative:

`npm run build`

This runs:
`tsc -b && vite build`

Rules:
- `npx tsc --noEmit` alone is NOT sufficient.
- Before reporting success, always run `npm run build`.
- If production build fails, task is NOT complete.
- Fix all errors, rerun the full production build, and only then report PASS.
- Never use `as any`, unsafe casts, or suppress TypeScript errors just to pass build.

### Git / Deployment Readiness

Before saying changes are ready to deploy:
- run `git status`
- verify all required source/type/i18n/config files are tracked
- verify newly created production files are not accidentally gitignored
- temporary files such as `scratch/` must not be committed
- explicitly report any required uncommitted/untracked file

Do not assume a local file will exist in Netlify just because it exists on disk.

### Database Migrations

Never claim a migration is deployed unless:
1. migration status was checked
2. `supabase db push` actually succeeded
3. remote migration history confirms it
4. required remote validation queries were executed

A locally created migration is NOT deployed.

Never infer remote values from local SQL.

If a migration fails:
- STOP
- report the exact database error
- do not perform broad automatic repairs

### Evidence-Based Reporting

Do not report:
- "deployed"
- "verified"
- "build successful"
- "fixed"
- "PASS"

unless the corresponding command actually ran successfully in the current task.

Never convert assumptions into verification claims.

If something was not directly verified, explicitly say:
`NOT VERIFIED`

### Cross-Layer Changes

When a task changes any combination of:
- database/schema
- generated/manual DB types
- domain types
- services
- UI components
- i18n

verify all affected layers are synchronized before completion.

Especially after schema changes, check TypeScript/domain types and all affected
call sites.

Especially after adding i18n keys, verify both ID and EN locale definitions.

### Final Pre-Completion Gate

Before the final report, always perform:

1. Review changed files
2. `git status`
3. `npm run build`
4. database remote validation if SQL was deployed
5. confirm no known error remains

If any step fails:
DO NOT report the task as complete.

Final report must include:
- production build: PASS / FAIL
- database deployment: APPLIED / NOT APPLICABLE / NOT APPLIED
- git state: CLEAN / CHANGES PENDING
- remaining blocker: NONE or exact blocker