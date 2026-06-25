import { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  ShieldAlert, 
  Database, 
  Play, 
  TrendingUp, 
  Activity, 
  AlertTriangle, 
  FileText, 
  Send,
  CheckCircle2,
  DollarSign
} from 'lucide-react';
import './App.css';

const API_BASE = 'http://127.0.0.1:5001/api';

// Currency formatting helper
const formatINR = (value) => {
  if (value === undefined || value === null) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(value);
};

function App() {
  // Navigation Tabs: 'executive', 'vendors', 'journal', 'fraud'
  const [activeTab, setActiveTab] = useState('executive');

  // Sub-tabs for detailed screens
  const [journalSubTab, setJournalSubTab] = useState('manual'); // manual, weekend, lateNight, highValue
  const [fraudSubTab, setFraudSubTab] = useState('duplicates-inv'); // duplicates-inv, duplicates-pay, outliers, suspicious

  // State Data
  const [dbStatus, setDbStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [vendorData, setVendorData] = useState(null);
  const [journalData, setJournalData] = useState(null);
  const [fraudData, setFraudData] = useState(null);

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [etlRunning, setEtlRunning] = useState(false);
  const [etlLogs, setEtlLogs] = useState('');

  // Copilot State
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      sender: 'assistant',
      text: `Hello! I am your **AI Audit Copilot**. I can help you inspect ERP data and verify risk controls.

Try clicking one of the audit questions below to scan the ledger:`,
      type: 'text',
      data: null
    }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Fetch all dashboard data
  const fetchAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch DB status first
      const statusRes = await fetch(`${API_BASE}/db-status`);
      const statusData = await statusRes.json();
      setDbStatus(statusData);

      // Fetch dashboard stats
      const statsRes = await fetch(`${API_BASE}/dashboard/stats`);
      const statsData = await statsRes.json();
      setStats(statsData);

      // Fetch vendor analytics
      const vendorRes = await fetch(`${API_BASE}/dashboard/vendor-analytics`);
      const vendorData = await vendorRes.json();
      setVendorData(vendorData);

      // Fetch journal testing
      const journalRes = await fetch(`${API_BASE}/dashboard/journal-testing`);
      const journalData = await journalRes.json();
      setJournalData(journalData);

      // Fetch fraud detection
      const fraudRes = await fetch(`${API_BASE}/dashboard/fraud-detection`);
      const fraudData = await fraudRes.json();
      setFraudData(fraudData);

    } catch (err) {
      console.error(err);
      setError('Could not connect to the Express server. Verify that the backend is running on port 5001.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Trigger ETL pipeline
  const runEtlPipeline = async () => {
    if (etlRunning) return;
    try {
      setEtlRunning(true);
      setEtlLogs('Executing Ingestion and Transformation scripts...');
      
      const res = await fetch(`${API_BASE}/etl/run`, { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        setEtlLogs(data.logs);
        // Refresh all data
        await fetchAllData();
      } else {
        setEtlLogs(`Error: ${data.message}\n${data.error || ''}`);
      }
    } catch (err) {
      setEtlLogs(`Failed to run ETL: ${err.message}`);
    } finally {
      setEtlRunning(false);
    }
  };

  // Submit AI Copilot Query
  const handleCopilotQuery = async (queryText) => {
    if (!queryText.trim() || chatLoading) return;

    // Add user message
    setChatMessages(prev => [...prev, { sender: 'user', text: queryText }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const response = await fetch(`${API_BASE}/copilot/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText })
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const reply = await response.json();
      
      setChatMessages(prev => [...prev, {
        sender: 'assistant',
        text: reply.answer,
        type: reply.type,
        data: reply.data
      }]);
    } catch (err) {
      setChatMessages(prev => [...prev, {
        sender: 'assistant',
        text: 'Sorry, I encountered an error running that query. Please make sure the backend is active.',
        type: 'system'
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Predefined copilot prompts
  const suggestions = [
    "Show top 10 risky vendors",
    "Find duplicate invoices above ₹1 lakh",
    "Summarize financial risks this month"
  ];

  return (
    <div className="app-container">
      
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="top-sec">
          <div className="brand-section">
            <h1 className="brand-title">
              <ShieldAlert size={26} style={{ color: '#6366f1' }} />
              AuditEngine AI
            </h1>
            <div className="brand-subtitle">Financial Analytics</div>
          </div>

          <nav className="nav-menu">
            <button 
              className={`nav-item ${activeTab === 'executive' ? 'active' : ''}`}
              onClick={() => setActiveTab('executive')}
            >
              <LayoutDashboard size={18} />
              Executive Dashboard
            </button>
            <button 
              className={`nav-item ${activeTab === 'vendors' ? 'active' : ''}`}
              onClick={() => setActiveTab('vendors')}
            >
              <Users size={18} />
              Vendor Analytics
            </button>
            <button 
              className={`nav-item ${activeTab === 'journal' ? 'active' : ''}`}
              onClick={() => setActiveTab('journal')}
            >
              <BookOpen size={18} />
              Journal Entry Testing
            </button>
            <button 
              className={`nav-item ${activeTab === 'fraud' ? 'active' : ''}`}
              onClick={() => setActiveTab('fraud')}
            >
              <ShieldAlert size={18} />
              Fraud Detection
            </button>
          </nav>
        </div>

        <div className="sidebar-footer">
          {dbStatus && (
            <div className="status-card">
              <div className="status-header">
                <span className="status-indicator">
                  <span className={`dot ${dbStatus.type === 'sqlite' ? 'sqlite' : ''}`}></span>
                  Database Connected
                </span>
                <span className="badge" style={{ fontSize: '0.6rem', padding: '2px 5px', background: 'rgba(255,255,255,0.06)' }}>
                  {dbStatus.type === 'sqlserver' ? 'SQL Server' : 'SQLite DB'}
                </span>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                {dbStatus.type === 'sqlserver' ? dbStatus.details.server : 'audit_local.db'}
              </div>
            </div>
          )}

          <button 
            className={`etl-btn ${etlRunning ? 'running' : ''}`}
            onClick={runEtlPipeline}
            disabled={etlRunning}
          >
            <Play size={14} className={etlRunning ? 'spinner' : ''} />
            {etlRunning ? 'Running ETL...' : 'Execute ETL Pipeline'}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="main-wrapper">
        <main className="main-content">
          
          {/* Header */}
          <header className="dashboard-header">
            <div className="header-title-sec">
              <h2>
                {activeTab === 'executive' && 'Executive Audit Dashboard'}
                {activeTab === 'vendors' && 'Vendor Audit & Analytics'}
                {activeTab === 'journal' && 'Journal Entry testing (JET)'}
                {activeTab === 'fraud' && 'Fraud & Anomaly Detection'}
              </h2>
              <p>
                {activeTab === 'executive' && 'Platform overview, key financial figures, and composite risk indexes.'}
                {activeTab === 'vendors' && 'Analysis of vendor payment thresholds, trends, and risk groups.'}
                {activeTab === 'journal' && 'Verification of weekend postings, manual adjustments, and high-value journals.'}
                {activeTab === 'fraud' && 'Scans for duplicate payments, outlier transaction anomalies, and shell vendors.'}
              </p>
            </div>
          </header>

          {error && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              padding: '16px',
              borderRadius: '12px',
              color: 'var(--accent-rose)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <AlertTriangle size={20} />
              <div>
                <strong>Connection Error:</strong> {error}
                <div style={{ marginTop: '6px', fontSize: '0.75rem', opacity: 0.8 }}>
                  Verify that the Express server in `backend/server.js` is running on port 5001. Use `npm run dev` to start.
                </div>
              </div>
            </div>
          )}

          {/* ETL logs feedback */}
          {etlLogs && (
            <div style={{
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid var(--border-color-glow)',
              padding: '14px',
              borderRadius: '12px',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              position: 'relative'
            }}>
              <div style={{ fontWeight: '700', color: '#fff', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={12} className="spinner" /> ETL Execution Logs:
              </div>
              <pre style={{ overflowX: 'auto', fontFamily: 'monospace', maxHeight: '100px', opacity: 0.8 }}>{etlLogs}</pre>
              <button 
                onClick={() => setEtlLogs('')}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* KPI CARDS (Only display if stats are loaded) */}
          {stats && (
            <div className="kpi-grid">
              <div className="kpi-card revenue">
                <div className="kpi-header">
                  <span>Total Revenue</span>
                  <TrendingUp size={16} />
                </div>
                <div className="kpi-value">{formatINR(stats.totalRevenue)}</div>
              </div>

              <div className="kpi-card expenses">
                <div className="kpi-header">
                  <span>Total Expenses</span>
                  <FileText size={16} />
                </div>
                <div className="kpi-value">{formatINR(stats.totalExpenses)}</div>
              </div>

              <div className="kpi-card transactions">
                <div className="kpi-header">
                  <span>Total Transactions</span>
                  <Activity size={16} />
                </div>
                <div className="kpi-value">{stats.totalTransactions}</div>
              </div>

              <div className="kpi-card risk-txns">
                <div className="kpi-header">
                  <span>High Risk Transactions</span>
                  <AlertTriangle size={16} style={{ color: 'var(--accent-rose)' }} />
                </div>
                <div className="kpi-value" style={{ color: 'var(--accent-rose)' }}>{stats.highRiskTransactions}</div>
              </div>

              <div className="kpi-card risk-score">
                <div className="risk-score-value-sec">
                  <div className="kpi-header" style={{ marginBottom: '4px' }}>Risk Score</div>
                  <div className="kpi-value" style={{ fontSize: '1.7rem', marginTop: '0' }}>{stats.auditRiskScore}%</div>
                </div>
                <div className="gauge-container">
                  <svg className="gauge-svg" width="72" height="72">
                    <circle className="gauge-bg" cx="36" cy="36" r="30" />
                    <circle 
                      className="gauge-fill" 
                      cx="36" 
                      cy="36" 
                      r="30" 
                      stroke={stats.auditRiskScore > 70 ? 'var(--accent-rose)' : stats.auditRiskScore > 40 ? 'var(--accent-amber)' : 'var(--accent-emerald)'}
                      strokeDasharray={`${(stats.auditRiskScore / 100) * 188.4} 188.4`}
                    />
                  </svg>
                  <div className="gauge-text">{stats.auditRiskScore}</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: EXECUTIVE AUDIT DASHBOARD */}
          {activeTab === 'executive' && (
            <div className="analytics-grid">
              
              {/* Left Column: Vendor Payment Trends */}
              <div className="dashboard-card">
                <div className="card-title-sec">
                  <div>
                    <h3>
                      <TrendingUp size={18} style={{ color: 'var(--accent-indigo)' }} />
                      Vendor Payment Trends
                    </h3>
                    <div className="card-subtitle">Daily transaction totals for June 2026</div>
                  </div>
                </div>

                {vendorData && vendorData.paymentTrends && vendorData.paymentTrends.length > 0 ? (
                  <div className="chart-container">
                    <svg className="chart-svg" viewBox="0 0 500 200" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent-indigo)" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="var(--accent-indigo)" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      
                      {/* Grid Lines */}
                      <line className="chart-grid-line" x1="0" y1="50" x2="500" y2="50" />
                      <line className="chart-grid-line" x1="0" y1="100" x2="500" y2="100" />
                      <line className="chart-grid-line" x1="0" y1="150" x2="500" y2="150" />
                      
                      {/* Draw Trend Area & Line */}
                      {(() => {
                        const trends = vendorData.paymentTrends;
                        const maxVal = Math.max(...trends.map(t => t.Amount)) || 1;
                        const points = trends.map((t, index) => {
                          const x = (index / (trends.length - 1)) * 500;
                          const y = 180 - (t.Amount / maxVal) * 150;
                          return { x, y, val: t.Amount, date: t.Date };
                        });
                        
                        const linePath = points.map(p => `${p.x},${p.y}`).join(' L ');
                        const areaPath = `0,180 L ${linePath} L 500,180 Z`;
                        
                        return (
                          <>
                            <path className="chart-path-bg" d={areaPath} />
                            <path className="chart-path-line" d={`M ${linePath}`} />
                            {/* Simple Dot elements for key dates */}
                            {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 6)) === 0).map((p, i) => (
                              <g key={i}>
                                <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke="var(--accent-indigo)" strokeWidth="2" />
                                <text x={p.x} y="195" className="chart-label" textAnchor="middle">
                                  {p.date.substring(8, 10)} Jun
                                </text>
                              </g>
                            ))}
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                ) : (
                  <div className="empty-state">
                    <Activity size={32} />
                    <p>No payment trends data available. Run the ETL pipeline.</p>
                  </div>
                )}
              </div>

              {/* Right Column: Risk Category Proportions */}
              <div className="dashboard-card">
                <div className="card-title-sec">
                  <div>
                    <h3>
                      <AlertTriangle size={18} style={{ color: 'var(--accent-rose)' }} />
                      Vendor Risk Category Proportions
                    </h3>
                    <div className="card-subtitle">Spending distribution based on vendor risk category</div>
                  </div>
                </div>

                {vendorData && vendorData.riskDistribution ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center', height: '100%' }}>
                    {vendorData.riskDistribution.map((r, i) => {
                      const totalSpent = vendorData.riskDistribution.reduce((s, row) => s + row.TotalSpent, 0) || 1;
                      const percentage = Math.round((r.TotalSpent / totalSpent) * 100);
                      
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '600' }}>
                            <span className="status-indicator">
                              <span className={`dot ${r.Category.toLowerCase() === 'high' ? 'rose' : r.Category.toLowerCase() === 'medium' ? 'sqlite' : ''}`} 
                                    style={{ 
                                      backgroundColor: r.Category === 'High' ? 'var(--accent-rose)' : r.Category === 'Medium' ? 'var(--accent-amber)' : 'var(--accent-emerald)',
                                      boxShadow: r.Category === 'High' ? '0 0 8px var(--accent-rose)' : r.Category === 'Medium' ? '0 0 8px var(--accent-amber)' : '0 0 8px var(--accent-emerald)'
                                    }}>
                              </span>
                              {r.Category} Risk ({r.Count} Vendors)
                            </span>
                            <span>{formatINR(r.TotalSpent)} ({percentage}%)</span>
                          </div>
                          
                          {/* Segmented bar */}
                          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ 
                              width: `${percentage}%`, 
                              height: '100%', 
                              background: r.Category === 'High' ? 'var(--accent-rose)' : r.Category === 'Medium' ? 'var(--accent-amber)' : 'var(--accent-emerald)',
                              borderRadius: '4px' 
                            }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Activity size={32} />
                    <p>No risk data available.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: VENDOR ANALYTICS */}
          {activeTab === 'vendors' && (
            <div className="full-width-grid">
              <div className="dashboard-card">
                <div className="card-title-sec">
                  <div>
                    <h3>
                      <Users size={18} style={{ color: '#ec4899' }} />
                      Top 5 Vendors by Total Spend
                    </h3>
                    <div className="card-subtitle">Active vendors received the highest transaction values</div>
                  </div>
                </div>

                {vendorData && vendorData.topVendors && vendorData.topVendors.length > 0 ? (
                  <div className="table-container">
                    <table className="audit-table">
                      <thead>
                        <tr>
                          <th>Vendor ID</th>
                          <th>Vendor Name</th>
                          <th>Region</th>
                          <th>Risk category</th>
                          <th>Txn Count</th>
                          <th>Total Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendorData.topVendors.map((v, i) => (
                          <tr key={i}>
                            <td><code>{v.VendorID}</code></td>
                            <td><strong>{v.VendorName}</strong></td>
                            <td>{v.Region}</td>
                            <td>
                              <span className={`badge ${v.RiskCategory.toLowerCase()}`}>
                                {v.RiskCategory}
                              </span>
                            </td>
                            <td>{v.TxnCount}</td>
                            <td><strong>{formatINR(v.TotalSpent)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <Users size={32} />
                    <p>No vendor metrics loaded.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: JOURNAL ENTRY TESTING */}
          {activeTab === 'journal' && (
            <div className="full-width-grid" style={{ gap: '20px' }}>
              <div className="dashboard-card">
                <div className="card-title-sec" style={{ flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3>
                      <BookOpen size={18} style={{ color: 'var(--accent-indigo)' }} />
                      Journal Testing Ledger Scans
                    </h3>
                    <div className="card-subtitle">Detailed verification tables for manual entries, late-night postings, weekends, and high-value transactions.</div>
                  </div>
                  
                  <div className="subtabs">
                    <button 
                      className={`subtab-btn ${journalSubTab === 'manual' ? 'active' : ''}`}
                      onClick={() => setJournalSubTab('manual')}
                    >
                      Manual Entries
                    </button>
                    <button 
                      className={`subtab-btn ${journalSubTab === 'weekend' ? 'active' : ''}`}
                      onClick={() => setJournalSubTab('weekend')}
                    >
                      Weekend Entries
                    </button>
                    <button 
                      className={`subtab-btn ${journalSubTab === 'lateNight' ? 'active' : ''}`}
                      onClick={() => setJournalSubTab('lateNight')}
                    >
                      Late Night Entries
                    </button>
                    <button 
                      className={`subtab-btn ${journalSubTab === 'highValue' ? 'active' : ''}`}
                      onClick={() => setJournalSubTab('highValue')}
                    >
                      High Value Transactions
                    </button>
                  </div>
                </div>

                {journalData ? (
                  <div className="table-container">
                    {(() => {
                      let dataRows = [];
                      if (journalSubTab === 'manual') dataRows = journalData.manualEntries;
                      if (journalSubTab === 'weekend') dataRows = journalData.weekendEntries;
                      if (journalSubTab === 'lateNight') dataRows = journalData.lateNightEntries;
                      if (journalSubTab === 'highValue') dataRows = journalData.highValueTransactions;

                      if (!dataRows || dataRows.length === 0) {
                        return (
                          <div className="empty-state">
                            <CheckCircle2 size={32} style={{ color: 'var(--accent-emerald)' }} />
                            <p>No entries found for this test. Controls verify no violations.</p>
                          </div>
                        );
                      }

                      return (
                        <table className="audit-table">
                          <thead>
                            <tr>
                              <th>Txn ID</th>
                              <th>Vendor</th>
                              <th>GL Account</th>
                              <th>Department</th>
                              <th>Date & Time</th>
                              <th>Payment Type</th>
                              <th>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dataRows.map((row, i) => (
                              <tr key={i}>
                                <td><code>{row.TransactionID}</code></td>
                                <td>{row.VendorName}</td>
                                <td><code>{row.GLAccount}</code></td>
                                <td>{row.Department}</td>
                                <td>{row.Date}</td>
                                <td>{row.PaymentType}</td>
                                <td><strong>{formatINR(row.Amount)}</strong></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="empty-state">
                    <BookOpen size={32} />
                    <p>Journal data is loading...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: FRAUD DETECTION */}
          {activeTab === 'fraud' && (
            <div className="full-width-grid">
              <div className="dashboard-card">
                <div className="card-title-sec" style={{ flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3>
                      <ShieldAlert size={18} style={{ color: 'var(--accent-rose)' }} />
                      Fraud Detection Anomalies
                    </h3>
                    <div className="card-subtitle">AI risk scans scanning for billing duplicates, department outliers, and suspicious vendors.</div>
                  </div>

                  <div className="subtabs">
                    <button 
                      className={`subtab-btn ${fraudSubTab === 'duplicates-inv' ? 'active' : ''}`}
                      onClick={() => setFraudSubTab('duplicates-inv')}
                    >
                      Duplicate Invoices
                    </button>
                    <button 
                      className={`subtab-btn ${fraudSubTab === 'duplicates-pay' ? 'active' : ''}`}
                      onClick={() => setFraudSubTab('duplicates-pay')}
                    >
                      Duplicate Payments
                    </button>
                    <button 
                      className={`subtab-btn ${fraudSubTab === 'outliers' ? 'active' : ''}`}
                      onClick={() => setFraudSubTab('outliers')}
                    >
                      Outlier Transactions
                    </button>
                    <button 
                      className={`subtab-btn ${fraudSubTab === 'suspicious' ? 'active' : ''}`}
                      onClick={() => setFraudSubTab('suspicious')}
                    >
                      Suspicious Vendors
                    </button>
                  </div>
                </div>

                {fraudData ? (
                  <div className="table-container">
                    
                    {/* A. Duplicate Invoices */}
                    {fraudSubTab === 'duplicates-inv' && (
                      fraudData.duplicateInvoices && fraudData.duplicateInvoices.length > 0 ? (
                        <table className="audit-table">
                          <thead>
                            <tr>
                              <th>Invoice ID</th>
                              <th>Vendor Name</th>
                              <th>Invoice Date</th>
                              <th>Status</th>
                              <th>Match count</th>
                              <th>Invoice Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fraudData.duplicateInvoices.map((row, i) => (
                              <tr key={i}>
                                <td><code>{row.InvoiceID}</code></td>
                                <td><strong>{row.VendorName}</strong></td>
                                <td>{row.InvoiceDate}</td>
                                <td><span className={`badge ${row.Status.toLowerCase()}`}>{row.Status}</span></td>
                                <td>
                                  <span className="badge flag">
                                    <AlertTriangle size={10} />
                                    {row.MatchCount} Matches
                                  </span>
                                </td>
                                <td><strong>{formatINR(row.InvoiceAmount)}</strong></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="empty-state">
                          <CheckCircle2 size={32} style={{ color: 'var(--accent-emerald)' }} />
                          <p>No duplicate invoice anomalies found.</p>
                        </div>
                      )
                    )}

                    {/* B. Duplicate Payments */}
                    {fraudSubTab === 'duplicates-pay' && (
                      fraudData.duplicatePayments && fraudData.duplicatePayments.length > 0 ? (
                        <table className="audit-table">
                          <thead>
                            <tr>
                              <th>Txn ID</th>
                              <th>Vendor Name</th>
                              <th>Date</th>
                              <th>GL Account</th>
                              <th>Department</th>
                              <th>Match count</th>
                              <th>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fraudData.duplicatePayments.map((row, i) => (
                              <tr key={i}>
                                <td><code>{row.TransactionID}</code></td>
                                <td><strong>{row.VendorName}</strong></td>
                                <td>{row.Date}</td>
                                <td><code>{row.GLAccount}</code></td>
                                <td>{row.Department}</td>
                                <td>
                                  <span className="badge flag">
                                    <AlertTriangle size={10} />
                                    {row.MatchCount} Payments
                                  </span>
                                </td>
                                <td><strong>{formatINR(row.Amount)}</strong></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="empty-state">
                          <CheckCircle2 size={32} style={{ color: 'var(--accent-emerald)' }} />
                          <p>No duplicate transaction payments detected.</p>
                        </div>
                      )
                    )}

                    {/* C. Outliers */}
                    {fraudSubTab === 'outliers' && (
                      fraudData.outlierTransactions && fraudData.outlierTransactions.length > 0 ? (
                        <table className="audit-table">
                          <thead>
                            <tr>
                              <th>Txn ID</th>
                              <th>Vendor Name</th>
                              <th>Department</th>
                              <th>GL Account</th>
                              <th>Dept Average</th>
                              <th>Z-Score</th>
                              <th>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fraudData.outlierTransactions.map((row, i) => (
                              <tr key={i}>
                                <td><code>{row.TransactionID}</code></td>
                                <td>{row.VendorName}</td>
                                <td><strong>{row.Department}</strong></td>
                                <td><code>{row.GLAccount}</code></td>
                                <td>{formatINR(row.AvgAmount)}</td>
                                <td>
                                  <span className="badge high" style={{ background: 'rgba(236,72,153,0.1)', color: 'var(--accent-pink)', borderColor: 'rgba(236,72,153,0.2)' }}>
                                    {row.ZScore} SD
                                  </span>
                                </td>
                                <td><strong>{formatINR(row.Amount)}</strong></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="empty-state">
                          <CheckCircle2 size={32} style={{ color: 'var(--accent-emerald)' }} />
                          <p>No statistical outlier transactions found.</p>
                        </div>
                      )
                    )}

                    {/* D. Suspicious Vendors */}
                    {fraudSubTab === 'suspicious' && (
                      fraudData.suspiciousVendors && fraudData.suspiciousVendors.length > 0 ? (
                        <table className="audit-table">
                          <thead>
                            <tr>
                              <th>Vendor ID</th>
                              <th>Vendor Name</th>
                              <th>Region</th>
                              <th>Risk Category</th>
                              <th>Total Spent</th>
                              <th>Risk Alert flags</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fraudData.suspiciousVendors.map((row, i) => (
                              <tr key={i}>
                                <td><code>{row.VendorID}</code></td>
                                <td><strong>{row.VendorName}</strong></td>
                                <td>{row.Region}</td>
                                <td><span className="badge high">{row.RiskCategory}</span></td>
                                <td>{formatINR(row.TotalVolume)}</td>
                                <td style={{ color: 'var(--accent-rose)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <AlertTriangle size={12} />
                                    {row.RiskFlag}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="empty-state">
                          <CheckCircle2 size={32} style={{ color: 'var(--accent-emerald)' }} />
                          <p>No suspicious vendor alerts found.</p>
                        </div>
                      )
                    )}

                  </div>
                ) : (
                  <div className="empty-state">
                    <ShieldAlert size={32} />
                    <p>Fraud data loading...</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </main>

        {/* AI AUDIT COPILOT PANEL */}
        <aside className="copilot-panel">
          <div className="copilot-header">
            <div className="copilot-header-icon">
              <Activity size={20} />
            </div>
            <div>
              <h3>AI Audit Copilot</h3>
              <p>Gemini/OpenAI Inquiries</p>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="copilot-chat-area">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.sender}`}>
                
                {/* Regular text / markdown formatting */}
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.text.split('\n').map((line, lIdx) => {
                    // Simple Markdown replacement logic for display
                    let cleanLine = line;
                    
                    // Headers
                    if (cleanLine.startsWith('# ')) {
                      return <h1 key={lIdx}>{cleanLine.replace('# ', '')}</h1>;
                    }
                    if (cleanLine.startsWith('## ')) {
                      return <h2 key={lIdx}>{cleanLine.replace('## ', '')}</h2>;
                    }
                    if (cleanLine.startsWith('### ')) {
                      return <h3 key={lIdx}>{cleanLine.replace('### ', '')}</h3>;
                    }
                    
                    // List items
                    if (cleanLine.startsWith('- ')) {
                      cleanLine = cleanLine.replace('- ', '');
                      // Check for bold text
                      return <li key={lIdx} dangerouslySetInnerHTML={{__html: cleanLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\`(.*?)\`/g, '<code>$1</code>')}} />;
                    }

                    // Regular line with bold or code formatting
                    return <p key={lIdx} dangerouslySetInnerHTML={{__html: cleanLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\`(.*?)\`/g, '<code>$1</code>')}} />;
                  })}
                </div>

                {/* Structured response tables */}
                {msg.type === 'vendors' && msg.data && (
                  <div className="chat-table-container">
                    <table className="chat-table">
                      <thead>
                        <tr>
                          <th>Vendor</th>
                          <th>Score</th>
                          <th>Explanation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {msg.data.map((row, rIdx) => (
                          <tr key={rIdx}>
                            <td><strong>{row.VendorName}</strong></td>
                            <td>
                              <span className="badge high" style={{ 
                                padding: '2px 5px', 
                                fontSize: '0.65rem',
                                background: row.RiskScore > 70 ? 'rgba(244,63,94,0.1)' : 'rgba(245,158,11,0.1)',
                                color: row.RiskScore > 70 ? 'var(--accent-rose)' : 'var(--accent-amber)'
                              }}>
                                {row.RiskScore}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.7rem', opacity: 0.85 }}>{row.Explanation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {msg.type === 'duplicates' && msg.data && (
                  <div className="chat-table-container">
                    <table className="chat-table">
                      <thead>
                        <tr>
                          <th>Vendor</th>
                          <th>Invoice IDs</th>
                          <th>Amount</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {msg.data.map((row, rIdx) => (
                          <tr key={rIdx}>
                            <td>{row.VendorName}</td>
                            <td><code>{row.InvoiceIDs}</code></td>
                            <td>{row.Amount}</td>
                            <td><span className="badge flag" style={{ padding: '2px 5px', fontSize: '0.65rem' }}>{row.DuplicateCount}x</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              </div>
            ))}

            {chatLoading && (
              <div className="chat-loader">
                <span></span>
                <span></span>
                <span></span>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Prompt Suggestions */}
          <div className="chat-suggestions">
            <div className="chat-suggestions-title">Quick Queries</div>
            {suggestions.map((s, idx) => (
              <button 
                key={idx} 
                className="suggestion-pill"
                onClick={() => handleCopilotQuery(s)}
                disabled={chatLoading}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Chat Input Section */}
          <div className="copilot-input-sec">
            <form 
              className="copilot-input-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleCopilotQuery(chatInput);
              }}
            >
              <input 
                type="text"
                className="copilot-input"
                placeholder="Ask audit questions..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={chatLoading}
              />
              <button 
                type="submit" 
                className="copilot-send-btn"
                disabled={chatLoading || !chatInput.trim()}
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </aside>
      </div>

    </div>
  );
}

export default App;
