-- Finacle Audit Platform — PostgreSQL Schema
-- Run once: CREATE DATABASE audit_db;  then execute this file.

CREATE TABLE IF NOT EXISTS loan_accounts (
  id            SERIAL PRIMARY KEY,
  account_no    VARCHAR(50)   NOT NULL,
  customer_name VARCHAR(200)  NOT NULL,
  loan_amount   NUMERIC(18,2) NOT NULL,
  overdue_days  INTEGER       NOT NULL DEFAULT 0,
  npa_flag      VARCHAR(20)   NOT NULL DEFAULT 'STANDARD',
  branch        VARCHAR(100),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_exceptions (
  id            SERIAL PRIMARY KEY,
  account_no    VARCHAR(50)   NOT NULL,
  customer_name VARCHAR(200)  NOT NULL,
  loan_amount   NUMERIC(18,2) NOT NULL,
  overdue_days  INTEGER       NOT NULL,
  issue         TEXT          NOT NULL,
  npa_category  VARCHAR(50)   NOT NULL,
  branch        VARCHAR(100),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
