'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(cors());

// ---------------------------------------------------------------------------
// Rate limiting — prevents abuse of DB-touching endpoints
// ---------------------------------------------------------------------------
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 60,              // 60 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again in a minute.' },
});
app.use('/api/', apiLimiter);

// ---------------------------------------------------------------------------
// Database connection (ENV-based to prevent hard-coded credential issues)
// ---------------------------------------------------------------------------
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'audit_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// ---------------------------------------------------------------------------
// Auto-create tables on startup
// ---------------------------------------------------------------------------
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS loan_accounts (
        id           SERIAL PRIMARY KEY,
        account_no   VARCHAR(50) NOT NULL,
        customer_name VARCHAR(200) NOT NULL,
        loan_amount  NUMERIC(18,2) NOT NULL,
        overdue_days INTEGER NOT NULL DEFAULT 0,
        npa_flag     VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
        branch       VARCHAR(100),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_exceptions (
        id           SERIAL PRIMARY KEY,
        account_no   VARCHAR(50) NOT NULL,
        customer_name VARCHAR(200) NOT NULL,
        loan_amount  NUMERIC(18,2) NOT NULL,
        overdue_days INTEGER NOT NULL,
        issue        TEXT NOT NULL,
        npa_category VARCHAR(50) NOT NULL,
        branch       VARCHAR(100),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('[DB] Tables ready.');
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'Finacle Audit Platform API' });
});

// ---------------------------------------------------------------------------
// POST /api/upload  — accept an array of loan records
// Expected body: [ { account_no, customer_name, loan_amount, overdue_days,
//                    npa_flag, branch } ]
// ---------------------------------------------------------------------------
app.post('/api/upload', async (req, res) => {
  const records = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'Payload must be a non-empty array of loan records.' });
  }

  // Validate each record
  const required = ['account_no', 'customer_name', 'loan_amount', 'overdue_days'];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    for (const field of required) {
      if (r[field] === undefined || r[field] === null || r[field] === '') {
        return res.status(400).json({ error: `Record ${i + 1}: missing required field "${field}".` });
      }
    }
    if (isNaN(Number(r.loan_amount)) || Number(r.loan_amount) < 0) {
      return res.status(400).json({ error: `Record ${i + 1}: "loan_amount" must be a non-negative number.` });
    }
    if (!Number.isInteger(Number(r.overdue_days)) || Number(r.overdue_days) < 0) {
      return res.status(400).json({ error: `Record ${i + 1}: "overdue_days" must be a non-negative integer.` });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Replace previous upload with fresh data
    await client.query('TRUNCATE loan_accounts RESTART IDENTITY CASCADE');
    for (const r of records) {
      await client.query(
        `INSERT INTO loan_accounts (account_no, customer_name, loan_amount, overdue_days, npa_flag, branch)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          r.account_no,
          r.customer_name,
          Number(r.loan_amount),
          Number(r.overdue_days),
          r.npa_flag || 'STANDARD',
          r.branch || null,
        ]
      );
    }
    await client.query('COMMIT');
    res.json({ message: `Uploaded ${records.length} record(s) successfully.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Upload] Error:', err.message);
    res.status(500).json({ error: 'Database error while uploading records.' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/audit  — run NPA audit on uploaded loan records
// IRACP rule: overdue_days > 90 → flag as NPA exception
// Classification:
//   91 – 365 days  → Substandard
//   366 – 730 days → Doubtful (D1)
//   > 730 days     → Loss
// ---------------------------------------------------------------------------
function classifyNPA(overdueDays) {
  if (overdueDays > 730) return 'Loss';
  if (overdueDays > 365) return 'Doubtful';
  if (overdueDays > 90) return 'Substandard';
  return 'Standard';
}

app.post('/api/audit', async (_req, res) => {
  const client = await pool.connect();
  try {
    const { rows: loans } = await client.query('SELECT * FROM loan_accounts');

    if (loans.length === 0) {
      return res.status(400).json({ error: 'No loan data found. Please upload data first.' });
    }

    // Clear previous exceptions to prevent duplicates on repeated audit runs
    await client.query('TRUNCATE audit_exceptions RESTART IDENTITY');

    const exceptions = [];

    for (const loan of loans) {
      const overdue = Number(loan.overdue_days);
      const category = classifyNPA(overdue);

      if (category !== 'Standard') {
        const issue = `Account overdue by ${overdue} days — classified as ${category} under IRACP norms.`;
        await client.query(
          `INSERT INTO audit_exceptions (account_no, customer_name, loan_amount, overdue_days, issue, npa_category, branch)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [loan.account_no, loan.customer_name, loan.loan_amount, overdue, issue, category, loan.branch]
        );
        exceptions.push({
          account_no: loan.account_no,
          customer_name: loan.customer_name,
          loan_amount: Number(loan.loan_amount),
          overdue_days: overdue,
          issue,
          npa_category: category,
          branch: loan.branch,
        });
      }
    }

    res.json({
      total_accounts: loans.length,
      exceptions_found: exceptions.length,
      exceptions,
    });
  } catch (err) {
    console.error('[Audit] Error:', err.message);
    res.status(500).json({ error: 'Audit failed due to a database error.' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /api/exceptions  — fetch stored audit exceptions
// ---------------------------------------------------------------------------
app.get('/api/exceptions', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM audit_exceptions ORDER BY overdue_days DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[Exceptions] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch exceptions.' });
  }
});

module.exports = { app, classifyNPA };

// ---------------------------------------------------------------------------
// Start server (only when run directly, not when required by tests)
// ---------------------------------------------------------------------------
if (require.main === module) {
  const PORT = parseInt(process.env.PORT, 10) || 4000;

  initDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`[Server] Finacle Audit API listening on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('[Startup] Failed to initialize database:', err.message);
      process.exit(1);
    });
}
