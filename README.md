# Radobe — Finacle Audit Platform (Phase 1 MVP)

A working MVP for auditing Finacle-like loan data, detecting NPA exceptions under
IRACP norms (Reserve Bank of India guidelines). Built with Node.js/Express, PostgreSQL,
and React.

---

## What this MVP does

| Feature | Status |
|---|---|
| Upload Finacle-like loan data (JSON) | ✅ |
| Run NPA audit logic (IRACP 90+ days) | ✅ |
| Classify exceptions: Substandard / Doubtful / Loss | ✅ |
| Store & fetch audit exceptions (PostgreSQL) | ✅ |
| Prevent duplicate exceptions on re-runs | ✅ |
| Simple React dashboard UI | ✅ |

---

## Project structure

```
backend/          Express API server
  server.js       Main server (health, upload, audit, exceptions endpoints)
  .env.example    Environment variable template
  package.json
  test/
    run.js        Unit tests (no DB required)

frontend/         React UI (browser-only, no Node modules)
  src/
    index.js
    App.js        Dashboard: upload → audit → exceptions table
  public/
    index.html
  package.json

db/
  schema.sql      PostgreSQL table definitions
```

---

## Quick start

### 1 — Prerequisites

- Node.js 18+
- PostgreSQL 14+

### 2 — Create the database

```sql
CREATE DATABASE audit_db;
```

Then (optional — the server auto-creates tables on startup):

```bash
psql -U postgres -d audit_db -f db/schema.sql
```

### 3 — Configure the backend

```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL credentials
```

`.env` variables:

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | localhost | PostgreSQL host |
| `DB_PORT` | 5432 | PostgreSQL port |
| `DB_NAME` | audit_db | Database name |
| `DB_USER` | postgres | Database user |
| `DB_PASSWORD` | postgres | Database password |
| `PORT` | 4000 | API server port |

### 4 — Start the backend

```bash
cd backend
npm install
npm start
# → Listening on http://localhost:4000
```

### 5 — Start the frontend

```bash
cd frontend
npm install
npm start
# → Opens http://localhost:3000
```

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Health check |
| POST | `/api/upload` | Upload array of loan records |
| POST | `/api/audit` | Run NPA audit, return exceptions |
| GET | `/api/exceptions` | Fetch stored exceptions |

### Upload payload example

```json
[
  {
    "account_no": "ACC001",
    "customer_name": "Ramesh Traders",
    "loan_amount": 500000,
    "overdue_days": 120,
    "npa_flag": "STANDARD",
    "branch": "Mumbai Main"
  }
]
```

### Audit response example

```json
{
  "total_accounts": 5,
  "exceptions_found": 3,
  "exceptions": [
    {
      "account_no": "ACC002",
      "customer_name": "Suresh Exports",
      "loan_amount": 1200000,
      "overdue_days": 120,
      "npa_category": "Substandard",
      "issue": "Account overdue by 120 days — classified as Substandard under IRACP norms.",
      "branch": "Delhi CP"
    }
  ]
}
```

---

## NPA classification rules (IRACP)

| Overdue days | Category |
|---|---|
| 0 – 90 | Standard (no exception) |
| 91 – 365 | **Substandard** |
| 366 – 730 | **Doubtful** |
| > 730 | **Loss** |

---

## Running tests

```bash
cd backend
npm test
```

Tests cover:
- NPA classification logic (all IRACP boundary conditions)
- Payload validation (missing fields, negative amounts, non-integer overdue)
- Audit exception filtering
- Duplicate-prevention logic

---

## Upgrade roadmap

| Phase | Features |
|---|---|
| Phase 2 (CA-ready) | Finacle file parser (.txt/.xls), DP calculation, interest recalculation, Excel export |
| Phase 3 (Big-4) | LFAR auto-generation, configurable rule engine, multi-branch dashboard, role-based login |
| Phase 4 (Enterprise) | Fraud detection, ML anomaly detection, Finacle API integration, audit workflow |
