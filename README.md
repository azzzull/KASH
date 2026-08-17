# KASH

**Smart Money Tracker**

KASH is a modern personal finance management application designed to make tracking money simple, visual, and insightful.

Instead of treating personal finance like accounting software, KASH focuses on helping users quickly understand:

- How much money they have
- Where their money is stored
- Where their money goes
- How their cash flow changes over time
- How their financial position is developing

KASH is built as a responsive Progressive Web App (PWA) with a modern finance-tech interface optimized for desktop and mobile.

---

## Features

### Dashboard

Get a quick overview of your financial condition.

- Net Worth
- Available Balance
- Monthly Income
- Monthly Expense
- Net Cash Flow
- Cash Flow Chart
- Spending by Category
- Wallet Summary
- Recent Transactions
- Month-over-month comparison
- Privacy mode for financial amounts

### Wallet Management

Manage multiple places where your money is stored.

Supported wallet types include:

- Bank Account
- E-Wallet
- Cash
- Investment
- Other financial accounts

Features include:

- Initial balance
- Real-time ledger-derived balance
- Include/exclude wallet from Net Worth
- Wallet detail
- Edit wallet
- Archive wallet

Wallet balances are calculated from the financial ledger rather than manually maintained balances.

### Transactions

KASH currently supports four core transaction types:

#### Income

Money entering a wallet.

#### Expense

Money leaving a wallet.

#### Transfer

Money moved between two wallets.

Transfers do not count as income or expense because they do not change total assets.

Transfer fees are treated separately as financial costs.

#### Balance Adjustment

Used when the actual balance of a wallet differs from the balance recorded in KASH.

Adjustments preserve the financial ledger instead of directly overwriting wallet balances.

---

## Transaction History

View and manage the complete transaction ledger.

Features include:

- Search
- Transaction type filters
- Advanced filters
- Sorting
- Grouping by date
- Transaction detail
- Edit transaction
- Duplicate transaction
- Void transaction
- Incremental loading

Financial transactions are never hard-deleted.

Voided transactions remain available for historical and audit purposes while no longer affecting wallet balances.

---

## Financial Calendar

Explore financial activity using a monthly calendar.

Features include:

- Monthly navigation
- Daily transaction indicators
- Income and expense activity
- Daily financial summary
- Daily Net Cash Flow
- Transaction list by date
- Transaction detail integration

The calendar makes it easier to understand when financial activity happened throughout the month.

---

## Analytics

KASH transforms transaction data into useful financial insights.

Analytics currently includes:

- Income
- Expense
- Net Cash Flow
- Cash Flow Overview
- Spending by Category
- Income vs Expense
- Net Worth Trend
- Wallet Distribution
- Period comparison

Supported periods include:

- This Month
- Last Month
- Last 3 Months
- Last 6 Months
- This Year
- Custom Range

### Quick Insights

KASH also derives additional insights from existing financial data:

- Average Monthly Expense
- Average Monthly Income
- Average Monthly Cash Flow
- Savings Rate
- Expense / Income Ratio
- Cash Flow Health
- Transfer Fees
- Highest Spending
- Net Worth Direction
- Top Spending Category

---

## Financial Rules

KASH uses a ledger-based financial model.

### Wallet Balance

```text
Current Balance =
Initial Balance
+ Income
- Expense
+ Incoming Transfer
- Outgoing Transfer
- Transfer Fee
+/- Balance Adjustment
```

### Net Cash Flow

```text
Net Cash Flow =
Income - Expense - Transfer Fees
```

Transfer principal is excluded because moving money between owned wallets does not represent income or spending.

Balance adjustments affect wallet balances but are excluded from normal income and expense analytics.

### Net Worth

Net Worth is derived from wallets configured to be included in Net Worth.

Historical Net Worth is reconstructed using wallet initial balances and ledger activity up to each historical cutoff.

---

## Design System

KASH uses a clean and minimal finance-tech visual language.

### Primary

```text
Emerald
#10B981
```

### Income

```text
#10B981
```

### Expense

```text
#E50914
```

### Transfer

```text
#4F7DF3
```

### Core Neutrals

```text
#0F172A
#475569
#91A3BB
#E2E8F0
#F1F5F9
#F8FAFC
#FFFFFF
```

Typography is based on **Mulish** with Lucide icons throughout the interface.

---

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Headless UI
- Lucide Icons

### Backend & Database

- Supabase
- PostgreSQL
- Supabase Authentication
- Row Level Security (RLS)
- PostgreSQL Views

### Authentication

- Google OAuth via Supabase Auth

### Application

- Progressive Web App (PWA)
- Responsive desktop and mobile interface

---

## Architecture

KASH follows a ledger-based architecture where financial transactions are the primary source of financial truth.

```text
User
 |
 +-- Profile
 |
 +-- Wallets
 |    |
 |    +-- Transactions
 |
 +-- Categories
 |
 +-- Analytics
      |
      +-- Derived from Ledger
```

Important financial calculations are designed to remain reproducible from persisted ledger data.

The frontend should not become the authoritative source for financial balances.

---

## Security

KASH uses Supabase Row Level Security to isolate user financial data.

Core security principles include:

- Users can only access their own financial data
- Financial ownership is validated through authenticated Supabase users
- No service-role credentials are exposed to the frontend
- Financial records prefer void/archive over destructive deletion
- Private operations remain protected by PostgreSQL RLS policies

---

## Getting Started

### Requirements

Make sure you have:

- Node.js
- npm
- A Supabase project

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd kash
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create:

```text
.env.local
```

Add:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Never commit real environment credentials to the repository.

### 4. Configure Supabase

Supabase schema files and SQL migrations are intentionally kept private and are not committed to this public repository.

Configure:

- Supabase project URL
- Supabase anon key
- Google OAuth provider
- Required database schema, views, triggers, and RLS policies

### 5. Start development server

```bash
npm run dev
```

Vite will start the local development server.

### 6. Production build

```bash
npm run build
```

---

## Progressive Web App

KASH is designed as a Progressive Web App.

The application can provide an app-like experience while keeping a single web-based codebase.

The PWA architecture is intentionally conservative around financial mutations: offline state must never pretend that a financial transaction has successfully reached the server when it has not.

---

## Product Roadmap

### Alpha

Current Alpha foundation includes:

- Authentication
- Onboarding
- Wallets
- Categories
- Income
- Expense
- Transfer
- Balance Adjustment
- Dashboard
- Transaction History
- Financial Calendar
- Analytics
- PWA foundation

### Planned

Future KASH development is planned to include:

- Personal Savings Goals
- Debt Tracking
- Receivable Tracking
- Shared Savings
- Shared Savings Invitations
- Contribution Verification
- Notifications
- Budget Management
- Recurring Transactions
- Export & Reporting

---

## Shared Savings - Planned

One of the major planned KASH features is collaborative savings.

Shared Savings is designed to allow multiple users to track contributions toward a shared financial goal.

The planned verification model is:

```text
SUBMIT
  |
PENDING
  |
VERIFICATION
  |
VERIFIED / REJECTED
```

Only verified contributions will count toward shared savings progress.

KASH tracks these financial records but does not move or hold users' money.

---

## Project Status

KASH is currently under active development.

The current version represents the **Alpha foundation** of the product.

Features, database architecture, UI, and financial behavior may continue to evolve before a stable public release.

KASH is currently a financial tracking application and does **not**:

- Hold user funds
- Transfer real money
- Replace banks or e-wallets
- Provide investment advice
- Automatically connect to financial institutions

---

## License

No public open-source license has been specified yet.

Unless a license is added, the source code should not be assumed to grant permission for reuse, modification, or redistribution.

---

## KASH

**Know your money. Understand your flow.**
