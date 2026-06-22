<div align="center">
  <img src="frontend/public/logo.png" alt="Splitvero Logo" width="120" />
  <h1>Splitvero</h1>
  <p><strong>A focused, beautiful, full-stack expense splitter for roommates and small groups.</strong></p>
</div>

Splitvero answers the one question people care about most:
> Who owes whom, and how much?

The app supports equal and unequal splits, keeps a persistent audit trail, and mathematically minimizes settlement transactions so your group can settle up with the fewest payments possible.

## 🚀 Live Application

- **Web App:** [https://splitvero.com](https://splitvero.com)
- **Tech Stack:** Next.js, FastAPI, PostgreSQL, Docker, AWS EC2, Caddy

## ✨ Key Features

- **Email OTP & Google Auth:** Secure, passwordless login using Resend for transactional emails and Google OAuth.
- **Friendly URLs:** Beautiful, RESTful URLs for your groups (e.g., `splitvero.com/groups/trip-to-hawaii-a1b2c3`).
- **Equal and Unequal Splits:** Split an expense evenly or enter exact per-person amounts.
- **Netting Algorithm:** Automatically calculates the minimum number of transactions required to settle all debts.
- **Audit Trail:** Every expense, settlement, and receipt is permanently recorded in the group feed.
- **Monthly Recurring Bills:** Mark rent, internet, or other repeat bills as monthly, and the server automatically generates them on the due date.
- **Receipt Uploads:** Attach photo evidence to any expense.
- **CSV Export:** Download a complete spreadsheet of your group's financial activity.

## 🛠 Tech Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui |
| **Backend** | Python, FastAPI, SQLAlchemy, Pydantic |
| **Database** | PostgreSQL |
| **Authentication**| Resend (SMTP Email OTP), Google OAuth |
| **Infrastructure**| Docker Compose, AWS EC2, Caddy Reverse Proxy |

## 🧮 How The Netting Algorithm Works

Splitvero converts every ledger item into a net balance per member.
- If someone paid more than their share, they become a **creditor**.
- If someone owes more than they paid, they become a **debtor**.
- Past settlements are included in the same balance math.
- The algorithm repeatedly matches the largest debtor with the largest creditor until everyone is balanced.

Example:

| Person | Net balance |
| --- | ---: |
| Alice | +$50 |
| Bob | -$20 |
| Charlie | -$30 |

Splitvero suggests:

```text
Bob -> Alice: $20
Charlie -> Alice: $30
```

This avoids unnecessary chains like Bob paying Charlie and Charlie paying Alice.

## 🌟 Advanced Features Implemented

### Monthly Recurring Expenses
When **Repeat monthly** is enabled on the expense form, Splitvero stores a recurring expense template with:
- payer
- amount
- description
- split amounts
- day of month
- next run date

Whenever a group is opened, the backend checks active recurring templates. If a template is due, Splitvero creates a normal expense row for that month and advances the next run date. If the app has not been opened for multiple months, it catches up month by month.

Generated expenses use `recurring_template_id` and `generated_for_month` so a month cannot be generated twice.

### Receipt Uploads
One-time expenses can include a receipt image. The backend stores the uploaded file under `backend/uploads/receipts` and saves the receipt URL on the expense. The activity feed shows a paperclip link when a receipt is available.

### CSV Export
Each group has a CSV export endpoint (`GET /groups/{group_id}/export.csv`). The export includes date, type, description, amount, payer, receiver, receipt URL, and recurring month.

## 🔒 Validation And Safety
- Expense amounts must be positive.
- Split totals must equal the expense amount.
- Payers and split participants must belong to the group.
- A settlement must be a payment from one group member to another member in the same group.
- Expenses are soft-deleted so recalculation remains safe.
- Groups cannot be deleted while unsettled balances remain.
- Financial values use `Numeric(10, 2)` on the backend to avoid floating-point storage errors in the database.

## 🌐 API Overview

FastAPI automatically generates interactive Swagger documentation for this API. 
- **Production:** `https://api.splitvero.com/docs`
- **Local Development:** `http://localhost:8000/docs`

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/users/request-otp` | Request a magic link code |
| `POST` | `/users/verify-otp` | Verify the code and login |
| `POST` | `/users/google-login`| Login with Google Auth |
| `POST` | `/groups/` | Create a group with a friendly URL slug |
| `GET` | `/groups/` | List groups |
| `GET` | `/groups/{group_id}` | Get group details |
| `POST` | `/groups/{group_id}/members` | Add a user to a group |
| `POST` | `/expenses/` | Add a one-time expense |
| `POST` | `/expenses/{expense_id}/receipt` | Upload a receipt image |
| `POST` | `/recurring-expenses/` | Create a monthly recurring expense |
| `GET` | `/groups/{group_id}/feed` | Read the audit trail |
| `GET` | `/groups/{group_id}/settlements` | Get minimized settlement suggestions |
| `POST` | `/settlements/` | Record a settle-up payment |
| `GET` | `/groups/{group_id}/export.csv` | Export group activity as CSV |

## 💻 Local Development

### 1. Start the Backend & Database (Terminal 1)

You will need a `.env` file in the root directory with your Database and SMTP credentials.

```bash
# Start the PostgreSQL database and FastAPI server in the background
docker compose up --build -d
```
This runs PostgreSQL on `localhost:5432` and FastAPI on `localhost:8000`.

### 2. Start the Frontend (Terminal 2)

```bash
# Open a new terminal tab, navigate to frontend, and start Next.js
cd frontend
npm install
npm run dev
```
The Next.js application will be available at `http://localhost:3000`.

## 🚢 Production Deployment

Splitvero is designed to be easily deployed on a single AWS EC2 instance.

1. Map your domain (`splitvero.com`) to your EC2 Elastic IP.
2. Configure **Caddy** to route traffic to `localhost:3000` (Frontend) and `localhost:8000` (Backend API).
3. Set your production environment variables in `frontend/.env.production` and the root `.env`.
4. Pull the latest code and deploy:

```bash
# Update the code
git pull origin main

# Restart the Backend container
docker compose down
docker compose up -d

# Rebuild and restart the Frontend
cd frontend
npm install
npm run build
sudo fuser -k 3000/tcp  # Kill the old server
npm start > frontend.log 2>&1 &  # Start the new server in the background
```
