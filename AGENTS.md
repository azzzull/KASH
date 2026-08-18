# KASH — Codex Project Instructions

You are working on **KASH**, a personal finance management application.

This file contains the permanent development rules for the project.

---

## 1. SOURCE OF TRUTH

Before implementing, modifying, refactoring, or making architectural decisions, read the relevant documentation inside:

- `catatan/product-architecture-mvp.md`
- `catatan/information-architecture-user-flow.md`
- `catatan/database-architecture-data-relationship.md`

These documents are the authoritative source of truth for KASH.

They define:

- product requirements
- MVP scope
- feature behavior
- information architecture
- user flows
- database architecture
- database relationships
- financial calculations
- permissions
- Shared Savings behavior
- responsive behavior

If implementation assumptions conflict with the documentation:

**THE DOCUMENTATION WINS.**

Do not silently change documented behavior.

---

## 2. VISUAL SOURCE OF TRUTH

Approved wireframes are stored inside:

`wireframe/`

Before implementing a page that has a wireframe, inspect the relevant image.

Use the wireframes as the reference for:

- information hierarchy
- page structure
- navigation
- card placement
- chart placement
- spacing relationships
- transaction layout
- wallet layout
- desktop/mobile adaptation

Do not arbitrarily redesign the application.

Minor adjustments are allowed when necessary for:

- responsiveness
- accessibility
- usability
- implementation consistency

but the result must remain recognizably aligned with the approved KASH design.

---

## 3. PRODUCT PHILOSOPHY

KASH should feel:

> Complete underneath. Simple on the surface.

The application should make it easy for users to understand:

- how much money they have
- where their money is stored
- where their money went
- how much they owe
- how much others owe them
- savings progress
- Shared Savings progress

Do not expose unnecessary accounting complexity to the user.

---

## 4. MVP DISCIPLINE

Do not invent or implement undocumented features.

Do not add features such as:

- AI financial assistant
- automatic bank synchronization
- Stockbit API integration
- real-time investment pricing
- cryptocurrency synchronization
- OCR
- premium subscriptions
- family finance
- advanced forecasting
- automatic bill detection
- advanced multi-currency conversion

unless explicitly requested.

If an idea may be useful but is outside the current scope, mention it instead of implementing it.

---

## 5. TARGET STACK

Use the existing project configuration when available.

The intended KASH stack is:

- React
- TypeScript
- Vite
- Tailwind CSS
- Supabase
- PostgreSQL
- React Router
- Lucide Icons

KASH will initially be delivered as a PWA.

Capacitor may later be used for Android packaging.

Do not introduce large dependencies when the same result can reasonably be achieved with the existing stack.

Before installing a new dependency, verify that it is actually necessary.

---

## 6. DESIGN SYSTEM

Follow the KASH design guideline.

### Typography

Primary font:

`Mulish`

Recommended weights:

- 400 Regular
- 500 Medium
- 600 SemiBold
- 700 Bold
- 800 ExtraBold — use sparingly

### Primary Brand Colors

Primary Emerald:

`#10B981`

Dark / Hover Emerald:

`#059669`

Pressed Emerald:

`#047857`

Gold Accent:

`#FBBF24`

### Neutral Palette

White:

`#FFFFFF`

Slate 50:

`#F8FAFC`

Slate 100:

`#F1F5F9`

Slate 200:

`#E2E8F0`

Slate 300:

`#CFD7E0`

Slate 600:

`#91A3BB`

Slate 700:

`#475569`

Slate 900:

`#0F172A`

### Semantic Colors

Income:

`#10B981`

Expense:

`#E50914`

Transfer:

`#4F7DF3`

Savings / Goals:

`#F5B82E`

Investment:

`#8B5CF6`

Debt:

`#F28C45`

Receivable:

`#22B8A7`

Semantic colors should be used intentionally.

Do not make the interface excessively colorful.

The dominant visual language should remain:

**White + Neutral + Emerald**

with Gold used as an accent.

---

## 7. INTERACTION STATES & UI CONTROLS

### Primary & Action States
- Default: `#10B981` (Primary Emerald)
- Hover: `#059669` (Dark Emerald)
- Pressed: `#047857` (Pressed Emerald)
- Selected background: `#ECFDF5` (Selected Emerald Tint)
- Focus border: `#10B981`
- Focus ring: `rgba(16, 185, 129, 0.20)`

### Disabled States
- Background: `#F1F5F9`
- Border: `#E2E8F0`
- Text: `#91A3BB`

### Input & Form Consistency Rules
1. **Focused Input Borders**:
   Every text, numeric, date, and form input when active/focused MUST use the KASH Emerald border and ring:
   `focus:border-kash-emerald focus:outline-none focus:ring-4 focus:ring-[rgba(16,185,129,0.20)]`

2. **Dropdown Uniformity**:
   All dropdown selects in modals, forms, and filter bars MUST use the standardized `SelectField` component from the design system.
   Do NOT use unstyled raw HTML `<select>` elements with inconsistent styling.

3. **Filter Tabs & Action Buttons**:
   Active filter buttons and tabs MUST use the primary brand **Emerald**:
   - Active: `bg-kash-emerald text-white shadow-sm hover:bg-kash-emeraldDark`
   - Inactive: `border border-slate-200 bg-white text-slate-600 hover:border-kash-emerald/40 hover:bg-kash-selected/60 hover:text-kash-emeraldDark`
   - **Do NOT use Slate (`bg-slate-900`) for active filter states or secondary buttons.** The Slate palette is strictly reserved for typography, neutral card backgrounds, and subtle borders on white.

4. **App-Native Date Picker**:
   Date selections across KASH MUST use the application-native `DatePickerField` component (with consistent emerald selection, month navigation, and popup styling) rather than relying on inconsistent OS/browser default date pickers.

Use these consistently across buttons, controls, navigation, and interactive components.

---

## 8. ICONOGRAPHY

Use **Lucide Icons** as the primary icon system.

Icons should be:

- minimal
- rounded
- consistent in stroke width
- visually aligned

Do not mix icon libraries without a strong reason.

---

## 9. RESPONSIVE DESIGN

KASH must provide the same core functionality on:

- mobile
- tablet
- desktop

### Mobile

Prefer:

- bottom navigation
- single-column layouts
- bottom sheets
- touch-friendly controls
- full-width charts
- easily reachable primary actions

### Desktop

Prefer:

- sidebar navigation
- multi-column dashboard
- tables where appropriate
- dialogs / drawers
- larger data visualizations

Do not create desktop-only financial functionality.

---

## 10. FINANCIAL DATA RULES

Financial correctness is more important than UI convenience.

Do not place authoritative financial calculations only in React state.

Important financial calculations must follow the database architecture.

Examples include:

- wallet balance
- available balance
- net worth
- transfer effects
- goal allocations
- debt remaining
- receivable remaining
- Shared Savings balance

Frontend calculations may be used for temporary previews only.

---

## 11. WALLET BALANCE

Wallet balance follows the documented ledger model.

Conceptually:

Initial Balance
+ Income
- Expense
+ Incoming Transfer
- Outgoing Transfer
± Adjustment

Do not manually maintain financial values in multiple unrelated places if they can be derived from the ledger.

Financial history should remain recalculable.

---

## 12. TRANSFER RULE

A transfer is:

**NOT income.**

A transfer is:

**NOT an expense.**

A transfer moves money between wallets.

Example:

BCA → GoPay Rp500.000

Result:

BCA: `-Rp500.000`

GoPay: `+Rp500.000`

Net Worth:

**unchanged**

Transfer fees may count as expenses according to the documented financial rules.

---

## 13. SAVINGS GOAL RULE

A Personal Savings Goal is **not another wallet**.

Goal contributions represent allocated money from an existing wallet.

Example:

BCA Actual Balance:

`Rp10.000.000`

Allocated to Goal:

`Rp3.000.000`

Available:

`Rp7.000.000`

Do not double-count Goal funds as additional assets.

---

## 14. DEBT & RECEIVABLE RULE

Debt and Receivable behavior must follow the documented database architecture.

Debt payment:

Wallet decreases.
Debt remaining decreases.

Receivable payment:

Wallet increases.
Receivable remaining decreases.

Do not duplicate financial effects between payment records and transaction records.

---

## 15. SHARED SAVINGS RULE

Shared Savings is a critical KASH feature.

The verification flow MUST remain:

SUBMIT
↓
PENDING
↓
VERIFICATION
↓
VERIFIED / REJECTED

A member submitting a contribution does **not** mean the contribution is confirmed.

Only:

`VERIFIED`

contributions count toward Shared Savings progress.

Formula:

Shared Savings Progress =
SUM(Verified Contributions)

Pending contributions must be displayed separately.

---

## 16. SHARED SAVINGS PERMISSIONS

The Shared Saving Owner and Destination Account Owner / Verifier may be different users.

Only the authorized Destination Account Owner / Verifier may:

- approve contributions
- reject contributions

Members must not be able to:

- approve their own contribution
- approve another member's contribution
- modify another member's contribution

Do not rely on frontend restrictions alone.

Enforce these rules through Supabase/PostgreSQL RLS and/or secure database functions where specified by the architecture.

---

## 17. DATABASE SECURITY

Use Supabase Row Level Security for private user data.

Never assume hiding something in the UI is sufficient authorization.

A user must not be able to retrieve or modify another user's private financial data by manually calling the API.

Pay particular attention to:

- wallets
- transactions
- goals
- debts
- receivables
- Shared Savings
- Shared Saving members
- contributions
- transfer proofs

---

## 18. DATABASE CHANGES

Do not casually modify the database architecture.

Before creating or changing:

- tables
- columns
- enums
- relationships
- constraints
- RLS policies
- PostgreSQL functions

read:

`catatan/database-architecture-data-relationship.md`

If a requested implementation appears to require changing the approved database architecture, explain the conflict first.

Do not silently create an alternative schema.

---

## 19. CODE ORGANIZATION

Prefer modular, feature-oriented code.

Avoid giant page components containing all business logic.

Separate concerns where appropriate:

- UI components
- feature components
- hooks
- services
- database queries
- financial utilities
- validation
- types

Reuse components when behavior and visual structure are genuinely shared.

Do not over-abstract simple code.

---

## 20. TYPE SAFETY

Use TypeScript properly.

Avoid:

`any`

unless there is a legitimate technical reason.

Prefer:

- explicit domain types
- typed component props
- typed service responses
- typed Supabase data
- shared financial entity types

Database types should eventually be generated from the Supabase schema when practical.

---

## 21. ERROR HANDLING

Financial forms must not silently fail.

When a request fails:

- preserve user input when possible
- show understandable feedback
- do not pretend the transaction succeeded
- do not optimistically commit irreversible financial state without proper handling

Use the error-state behavior documented in the Information Architecture.

---

## 22. LOADING & EMPTY STATES

Follow the Information Architecture.

Prefer skeleton loading states for primary pages.

Provide meaningful empty states with a clear next action.

Do not leave users with blank screens.

---

## 23. ACCESSIBILITY

Maintain reasonable accessibility standards.

Interactive elements should:

- support keyboard interaction where appropriate
- have visible focus states
- use semantic HTML
- have accessible labels
- maintain sufficient contrast
- have reasonable touch target sizes

Accessibility improvements may adjust implementation details but should not redesign the approved interface.

---

## 24. DEVELOPMENT PHASES

Do not build all features simultaneously.

### KASH Alpha

Prioritize:

1. Project Foundation
2. Authentication
3. Onboarding
4. Wallets
5. Categories
6. Income
7. Expense
8. Transfer
9. Balance Adjustment
10. Dashboard
11. Transaction History
12. Calendar
13. Analytics

### KASH Beta

After Alpha is stable:

1. Goals
2. Debt
3. Receivable
4. Shared Savings
5. Invitations
6. Contribution Verification
7. Notifications
8. PWA polish

Do not implement Beta features while working on an Alpha task unless explicitly requested.

---

## 25. BEFORE WRITING CODE

For every substantial feature:

1. Read this `AGENTS.md`.
2. Read the relevant documentation in `catatan/`.
3. Inspect relevant references in `wireframe/`.
4. Inspect the existing codebase.
5. Identify existing reusable components.
6. Identify relevant database entities.
7. Identify security/RLS implications.
8. Identify desktop and mobile behavior.
9. Implement only the requested scope.
10. Validate the result.

Do not start by rewriting unrelated existing code.

---

## 26. AFTER IMPLEMENTATION

Before considering a task complete:

- run TypeScript checks
- run linting if configured
- run relevant tests if available
- verify there are no obvious runtime errors
- verify desktop behavior
- verify mobile behavior
- verify financial calculations affected by the change
- verify the implementation still follows `catatan/`

Fix issues caused by your changes before finishing.

Do not hide errors simply to make checks pass.

---

## 27. DO NOT OVER-ENGINEER

KASH is being built as an MVP.

Choose solutions that are:

- correct
- secure
- maintainable
- simple

Do not introduce unnecessary:

- microservices
- state-management frameworks
- abstraction layers
- repository patterns
- event systems
- premature caching
- complicated architecture

unless the existing application actually requires them.

---

## 28. WHEN REQUIREMENTS ARE UNCLEAR

First search the documentation in `catatan/`.

If the answer exists there, follow it.

If the documentation does not answer an important product or architectural question:

**do not silently invent a major requirement.**

Explain:

1. what is unclear,
2. why it affects implementation,
3. what options exist.

Minor technical implementation details may use sensible defaults as long as they do not change documented product behavior.

---

## 29. CHANGE DISCIPLINE

When asked to modify an existing feature:

**change only what was requested.**

Do not use a small change as an opportunity to redesign, rewrite, or restructure unrelated parts of KASH.

Preserve previously approved behavior unless the new instruction explicitly changes it.

---

## 30. FINAL RULE

When there is uncertainty, use this priority:

1. Explicit current task
2. `AGENTS.md`
3. Documentation in `catatan/`
4. Approved references in `wireframe/`
5. Existing implementation
6. Sensible engineering defaults

The goal is not to creatively reinterpret KASH.

The goal is to faithfully implement the KASH product that has already been designed and documented.
