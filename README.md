# Pocket - Roommate Expense Splitter

Pocket is a focused full-stack expense splitter for roommates and small groups. It answers the one question people care about most:

> Who owes whom, and how much?

The app supports equal and unequal splits, keeps a persistent audit trail, and minimizes settlement transactions so the group can settle up with the fewest payments possible.

## Highlights

- **Groups and members**: Create a group, add members, and manage a shared ledger.
- **Equal and unequal splits**: Split an expense evenly or enter exact per-person amounts.
- **Minimized settlement view**: Net balances across the whole group so chained debts collapse into fewer payments.
- **Real settle-up action**: Payments are stored as settlement records and reduce balances immediately.
- **Audit trail**: Expenses, generated recurring expenses, settlements, and receipts stay visible in group activity.
- **Monthly recurring expenses**: Mark rent, internet, or other repeat bills as monthly.
- **Receipt photo upload**: Attach a receipt image to a one-time expense.
- **CSV export**: Download group activity for backup or reconciliation.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons |
| Backend | FastAPI, SQLAlchemy, Pydantic |
| Database | PostgreSQL |
| Local infra | Docker Compose for Postgres and the API |

## How The Netting Algorithm Works

Pocket converts every ledger item into a net balance per member.

- If someone paid more than their share, they become a creditor.
- If someone owes more than they paid, they become a debtor.
- Past settlements are included in the same balance math.
- The algorithm repeatedly matches the largest debtor with the largest creditor until everyone is balanced.

Example:

| Person | Net balance |
| --- | ---: |
| Alice | +$50 |
| Bob | -$20 |
| Charlie | -$30 |

Pocket suggests:

```text
Bob -> Alice: $20
Charlie -> Alice: $30
```

This avoids unnecessary chains like Bob paying Charlie and Charlie paying Alice.

## Stretch Goals Implemented

### Monthly Recurring Expenses

When **Repeat monthly** is enabled on the expense form, Pocket stores a recurring expense template with:

- payer
- amount
- description
- split amounts
- day of month
- next run date

Whenever a group is opened, the backend checks active recurring templates. If a template is due, Pocket creates a normal expense row for that month and advances the next run date. If the app has not been opened for multiple months, it catches up month by month.

Generated expenses use `recurring_template_id` and `generated_for_month` so a month cannot be generated twice.

### Receipt Uploads

One-time expenses can include a receipt image. The backend stores the uploaded file under `backend/uploads/receipts` and saves the receipt URL on the expense. The activity feed shows a paperclip link when a receipt is available.

### CSV Export

Each group has a CSV export endpoint:

```text
GET /groups/{group_id}/export.csv
```

The export includes date, type, description, amount, payer, receiver, receipt URL, and recurring month.

## Local Development

### Prerequisites

- Docker Desktop
- Node.js and npm

### 1. Start the backend and database

```bash
docker compose up --build -d
```

This starts:

- PostgreSQL on `localhost:5432`
- FastAPI on `localhost:8000`

Backend API docs:

```text
http://localhost:8000/docs
```

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend app:

```text
http://localhost:3000
```

If port `3000` is already in use, Next.js will print the alternate local URL.

## Usage Walkthrough

1. Create a group, for example `Apartment 4B`.
2. Add members such as Alice, Bob, and Charlie.
3. Add an expense and choose who paid.
4. Select equal split or exact amounts.
5. Optionally attach a receipt photo.
6. For repeating bills, enable **Repeat monthly** and choose the first run date.
7. Review **How to Settle Up** for the minimized payment list.
8. Click **Make a Payment** to record a settlement.
9. Use **Export CSV** to download the group audit trail.

## API Overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/users/` | Create or reuse a user by email |
| `POST` | `/groups/` | Create a group |
| `GET` | `/groups/` | List groups |
| `POST` | `/groups/{group_id}/members` | Add a user to a group |
| `POST` | `/expenses/` | Add a one-time expense |
| `POST` | `/expenses/{expense_id}/receipt` | Upload a receipt image |
| `POST` | `/recurring-expenses/` | Create a monthly recurring expense |
| `GET` | `/groups/{group_id}/feed` | Read the audit trail |
| `GET` | `/groups/{group_id}/settlements` | Get minimized settlement suggestions |
| `POST` | `/settlements/` | Record a settle-up payment |
| `GET` | `/groups/{group_id}/export.csv` | Export group activity as CSV |

## Data Model

Core tables:

- `users`
- `groups`
- `group_members`
- `expenses`
- `expense_splits`
- `settlements`
- `recurring_expense_templates`
- `recurring_expense_splits`

Financial values use `Numeric(10, 2)` on the backend to avoid floating-point storage errors in the database.

## Validation And Safety

- Expense amounts must be positive.
- Split totals must equal the expense amount.
- Payers and split participants must belong to the group.
- A settlement must be a payment from one group member to another member in the same group.
- Expenses are soft-deleted so recalculation remains safe.
- Groups cannot be deleted while unsettled balances remain.

## Currency Conversion Plan

For international groups, I would store every expense in two forms:

- the original currency and original amount entered by the user
- the normalized group currency amount used by the netting algorithm

At expense creation time, the backend would fetch a dated exchange rate from a reliable provider and persist that exact rate with the expense. The app would never recalculate old expenses using live rates, because that would rewrite history and make the audit trail confusing. Settlement suggestions would run on normalized amounts, while the UI could still show the original amount and conversion rate for transparency.

## Deployment Notes

A production deployment should run:

- PostgreSQL as a managed database or a persistent container volume
- FastAPI behind HTTPS
- Next.js with `NEXT_PUBLIC_API_URL` pointing to the deployed API
- persistent storage for uploaded receipts, preferably object storage such as S3 instead of local disk

For a simple VM deployment, install Docker, set the frontend API URL, and run the backend/database with Docker Compose.
