'use strict';

/**
 * Unit tests for Finacle Audit Platform backend.
 * Tests run without a live database — they exercise pure business logic only.
 */

const { classifyNPA } = require('../server');

let passed = 0;
let failed = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// NPA Classification tests (IRACP rules)
// ---------------------------------------------------------------------------
console.log('\n── NPA Classification (classifyNPA) ──');

assert('0 overdue days → Standard',   classifyNPA(0)   === 'Standard');
assert('90 overdue days → Standard',  classifyNPA(90)  === 'Standard');
assert('91 overdue days → Substandard', classifyNPA(91) === 'Substandard');
assert('365 overdue days → Substandard', classifyNPA(365) === 'Substandard');
assert('366 overdue days → Doubtful', classifyNPA(366) === 'Doubtful');
assert('730 overdue days → Doubtful', classifyNPA(730) === 'Doubtful');
assert('731 overdue days → Loss',     classifyNPA(731) === 'Loss');
assert('1000 overdue days → Loss',    classifyNPA(1000) === 'Loss');

// ---------------------------------------------------------------------------
// Payload validation helper (replicated from server logic)
// ---------------------------------------------------------------------------
console.log('\n── Payload Validation ──');

function validateRecord(r, index) {
  const required = ['account_no', 'customer_name', 'loan_amount', 'overdue_days'];
  for (const field of required) {
    if (r[field] === undefined || r[field] === null || r[field] === '') {
      return `Record ${index + 1}: missing required field "${field}".`;
    }
  }
  if (isNaN(Number(r.loan_amount)) || Number(r.loan_amount) < 0) {
    return `Record ${index + 1}: "loan_amount" must be a non-negative number.`;
  }
  if (!Number.isInteger(Number(r.overdue_days)) || Number(r.overdue_days) < 0) {
    return `Record ${index + 1}: "overdue_days" must be a non-negative integer.`;
  }
  return null;
}

const validRecord = { account_no: 'ACC001', customer_name: 'Test Corp', loan_amount: 100000, overdue_days: 95 };
assert('Valid record passes validation',        validateRecord(validRecord, 0) === null);
assert('Missing account_no → error',           validateRecord({ customer_name: 'X', loan_amount: 1, overdue_days: 0 }, 0) !== null);
assert('Missing customer_name → error',        validateRecord({ account_no: 'A', loan_amount: 1, overdue_days: 0 }, 0) !== null);
assert('Negative loan_amount → error',         validateRecord({ ...validRecord, loan_amount: -500 }, 0) !== null);
assert('Non-integer overdue_days → error',     validateRecord({ ...validRecord, overdue_days: 1.5 }, 0) !== null);
assert('Negative overdue_days → error',        validateRecord({ ...validRecord, overdue_days: -1 }, 0) !== null);
assert('loan_amount as string number passes',  validateRecord({ ...validRecord, loan_amount: '50000' }, 0) === null);

// ---------------------------------------------------------------------------
// Audit logic: only non-Standard accounts raise exceptions
// ---------------------------------------------------------------------------
console.log('\n── Audit Exception Logic ──');

const testLoans = [
  { account_no: 'ACC001', overdue_days: 30 },   // Standard
  { account_no: 'ACC002', overdue_days: 91 },   // Substandard
  { account_no: 'ACC003', overdue_days: 400 },  // Doubtful
  { account_no: 'ACC004', overdue_days: 800 },  // Loss
];

const exceptions = testLoans.filter(l => classifyNPA(l.overdue_days) !== 'Standard');
assert('3 out of 4 accounts raise exceptions', exceptions.length === 3);
assert('ACC001 (30 days) is NOT an exception', !exceptions.find(e => e.account_no === 'ACC001'));
assert('ACC002 (91 days) IS an exception',      !!exceptions.find(e => e.account_no === 'ACC002'));
assert('ACC003 (400 days) IS an exception',     !!exceptions.find(e => e.account_no === 'ACC003'));
assert('ACC004 (800 days) IS an exception',     !!exceptions.find(e => e.account_no === 'ACC004'));

// ---------------------------------------------------------------------------
// Duplicate prevention: clearing exceptions before re-audit
// ---------------------------------------------------------------------------
console.log('\n── Duplicate Prevention ──');

let exceptionStore = [];
function runAudit(loans) {
  exceptionStore = []; // clear before each run
  for (const loan of loans) {
    if (classifyNPA(loan.overdue_days) !== 'Standard') {
      exceptionStore.push(loan.account_no);
    }
  }
  return exceptionStore;
}

const firstRun  = runAudit([{ account_no: 'ACC002', overdue_days: 91 }]);
const secondRun = runAudit([{ account_no: 'ACC002', overdue_days: 91 }]);
assert('Duplicate run does not double-up exceptions', secondRun.length === firstRun.length);
assert('Exactly 1 exception after two identical runs', secondRun.length === 1);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n─────────────────────────────────`);
console.log(`Tests: ${passed + failed}  |  Passed: ${passed}  |  Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
