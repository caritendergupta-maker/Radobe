import React, { useState, useCallback } from 'react';

// NOTE: This file uses the browser fetch() API only.
//       Do NOT import any Node.js modules (pg, fs, net, etc.) here —
//       React runs in the browser, not in Node.

const API_BASE = '';  // relative — proxied to http://localhost:4000 via package.json "proxy"

const NPA_COLOR = {
  Substandard: '#f59e0b',
  Doubtful:    '#ef4444',
  Loss:        '#7f1d1d',
};

const SAMPLE_DATA = [
  { account_no: 'ACC001', customer_name: 'Ramesh Traders',      loan_amount: 500000,  overdue_days: 30,  npa_flag: 'STANDARD',    branch: 'Mumbai Main' },
  { account_no: 'ACC002', customer_name: 'Suresh Exports',      loan_amount: 1200000, overdue_days: 120, npa_flag: 'STANDARD',    branch: 'Delhi CP' },
  { account_no: 'ACC003', customer_name: 'Kavita Industries',   loan_amount: 850000,  overdue_days: 400, npa_flag: 'DOUBTFUL',    branch: 'Chennai North' },
  { account_no: 'ACC004', customer_name: 'Patel Constructions', loan_amount: 3000000, overdue_days: 800, npa_flag: 'LOSS',        branch: 'Ahmedabad West' },
  { account_no: 'ACC005', customer_name: 'Singh Pharma',        loan_amount: 750000,  overdue_days: 95,  npa_flag: 'STANDARD',    branch: 'Pune Kothrud' },
];

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

export default function App() {
  const [rawInput, setRawInput]       = useState('');
  const [uploadMsg, setUploadMsg]     = useState('');
  const [uploadError, setUploadError] = useState('');
  const [auditResult, setAuditResult] = useState(null);
  const [auditError, setAuditError]   = useState('');
  const [exceptions, setExceptions]   = useState([]);
  const [loading, setLoading]         = useState(false);

  // ── Load sample data into textarea ──────────────────────────────────────
  const loadSample = () => {
    setRawInput(JSON.stringify(SAMPLE_DATA, null, 2));
    setUploadMsg('');
    setUploadError('');
  };

  // ── Upload data to backend ───────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    setUploadMsg('');
    setUploadError('');
    setAuditResult(null);
    setAuditError('');

    let records;
    try {
      records = JSON.parse(rawInput);
    } catch {
      setUploadError('Invalid JSON — please check the data format.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(records),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Upload failed.');
      } else {
        setUploadMsg(data.message);
      }
    } catch {
      setUploadError('Could not reach the backend. Is the server running?');
    } finally {
      setLoading(false);
    }
  }, [rawInput]);

  // ── Run NPA audit ────────────────────────────────────────────────────────
  const handleAudit = useCallback(async () => {
    setAuditResult(null);
    setAuditError('');

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/audit`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setAuditError(data.error || 'Audit failed.');
      } else {
        setAuditResult(data);
      }
    } catch {
      setAuditError('Could not reach the backend. Is the server running?');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch stored exceptions ──────────────────────────────────────────────
  const handleFetchExceptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/exceptions`);
      const data = await res.json();
      if (!res.ok) {
        setAuditError(data.error || 'Failed to fetch exceptions.');
      } else {
        setExceptions(data);
      }
    } catch {
      setAuditError('Could not reach the backend. Is the server running?');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>🏦 Finacle Audit Platform</h1>
        <p style={styles.subtitle}>NPA Exception Detection · IRACP Norms · Phase 1 MVP</p>
      </header>

      <main style={styles.main}>

        {/* ── STEP 1 — Upload ── */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Step 1 — Upload Loan Data</h2>

          <p style={styles.hint}>
            Paste a JSON array of loan records, or click <strong>Load Sample</strong> to try example data.
          </p>

          <textarea
            style={styles.textarea}
            placeholder='[ { "account_no": "ACC001", "customer_name": "...", "loan_amount": 500000, "overdue_days": 120, "branch": "Mumbai" } ]'
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            rows={12}
          />

          <div style={styles.row}>
            <button style={styles.btnSecondary} onClick={loadSample} disabled={loading}>Load Sample</button>
            <button style={styles.btnPrimary}   onClick={handleUpload} disabled={loading || !rawInput.trim()}>
              {loading ? 'Working…' : 'Upload Data'}
            </button>
          </div>

          {uploadMsg   && <p style={styles.success}>{uploadMsg}</p>}
          {uploadError && <p style={styles.error}>{uploadError}</p>}
        </section>

        {/* ── STEP 2 — Audit ── */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Step 2 — Run NPA Audit</h2>
          <p style={styles.hint}>
            Applies IRACP norms: accounts overdue &gt; 90 days are flagged as exceptions
            (Substandard / Doubtful / Loss).
          </p>

          <div style={styles.row}>
            <button style={styles.btnPrimary} onClick={handleAudit} disabled={loading}>
              {loading ? 'Auditing…' : 'Run Audit'}
            </button>
            <button style={styles.btnSecondary} onClick={handleFetchExceptions} disabled={loading}>
              Refresh Exceptions
            </button>
          </div>

          {auditError && <p style={styles.error}>{auditError}</p>}

          {auditResult && (
            <div style={styles.summary}>
              <span>Total accounts: <strong>{auditResult.total_accounts}</strong></span>
              <span style={{ marginLeft: 24 }}>
                Exceptions found: <strong style={{ color: auditResult.exceptions_found > 0 ? '#ef4444' : '#16a34a' }}>
                  {auditResult.exceptions_found}
                </strong>
              </span>
            </div>
          )}
        </section>

        {/* ── STEP 3 — Exceptions table ── */}
        {(auditResult?.exceptions?.length > 0 || exceptions.length > 0) && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Audit Exceptions</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Account No', 'Customer', 'Loan Amount', 'Overdue Days', 'Category', 'Branch', 'Issue'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(auditResult?.exceptions?.length > 0 ? auditResult.exceptions : exceptions).map((ex, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <td style={styles.td}>{ex.account_no}</td>
                      <td style={styles.td}>{ex.customer_name}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{formatINR(ex.loan_amount)}</td>
                      <td style={{ ...styles.td, textAlign: 'center' }}>{ex.overdue_days}</td>
                      <td style={{ ...styles.td, fontWeight: 700, color: NPA_COLOR[ex.npa_category] || '#000' }}>
                        {ex.npa_category}
                      </td>
                      <td style={styles.td}>{ex.branch || '—'}</td>
                      <td style={{ ...styles.td, fontSize: 12, color: '#6b7280' }}>{ex.issue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <footer style={styles.footer}>
        Finacle Audit Platform MVP · Phase 1 · IRACP NPA Detection
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline styles (no external CSS dependency)
// ---------------------------------------------------------------------------
const styles = {
  page: {
    fontFamily: "'Segoe UI', Arial, sans-serif",
    minHeight: '100vh',
    background: '#f1f5f9',
    color: '#1e293b',
  },
  header: {
    background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
    color: '#fff',
    padding: '32px 40px 24px',
  },
  title: { margin: 0, fontSize: 28, fontWeight: 700 },
  subtitle: { margin: '6px 0 0', fontSize: 14, opacity: 0.85 },
  main: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px' },
  card: {
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    padding: '28px 32px',
    marginBottom: 24,
  },
  cardTitle: { margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#1e3a5f' },
  hint: { margin: '0 0 14px', fontSize: 14, color: '#64748b' },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'monospace',
    fontSize: 13,
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: 12,
    resize: 'vertical',
    outline: 'none',
  },
  row: { display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' },
  btnPrimary: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 22px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    background: '#f1f5f9',
    color: '#1e3a5f',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: '10px 22px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  success: { color: '#16a34a', marginTop: 10, fontWeight: 600 },
  error:   { color: '#ef4444', marginTop: 10, fontWeight: 600 },
  summary: {
    marginTop: 14,
    padding: '12px 18px',
    background: '#f8fafc',
    borderRadius: 8,
    fontSize: 15,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    background: '#1e3a5f',
    color: '#fff',
    padding: '10px 12px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '9px 12px',
    borderBottom: '1px solid #e2e8f0',
    verticalAlign: 'top',
  },
  footer: {
    textAlign: 'center',
    padding: '20px',
    fontSize: 12,
    color: '#94a3b8',
    borderTop: '1px solid #e2e8f0',
    background: '#fff',
    marginTop: 8,
  },
};
