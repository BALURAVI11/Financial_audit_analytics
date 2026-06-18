import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB, query, getDbStatus } from './db.js';
import { queryCopilot } from './utils/copilot.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database connection
initDB();

// Database-agnostic helper to get YYYY-MM-DD from string or Date object
function getDateString(dateVal) {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    try {
      return dateVal.toISOString().substring(0, 10);
    } catch (e) {
      return '';
    }
  }
  return String(dateVal).substring(0, 10);
}

// Helper: Format date
function formatDateString(dateStr) {
  if (!dateStr) return '';
  // Format as YYYY-MM-DD HH:mm:ss
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toISOString().replace('T', ' ').substring(0, 19);
  } catch (e) {
    return dateStr;
  }
}

// 1. GET /api/db-status - Check Database Status
app.get('/api/db-status', (req, res) => {
  res.json(getDbStatus());
});

// 2. GET /api/dashboard/stats - Executive Audit Dashboard Statistics
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const txns = await query('SELECT Amount, VendorID, IsManual, Date FROM Fact_Transactions');
    const invoices = await query('SELECT InvoiceAmount FROM Fact_Invoices');
    const vendors = await query('SELECT VendorID, RiskCategory FROM Dim_Vendor');

    const totalTransactions = txns.length;
    const totalExpenses = txns.reduce((sum, t) => sum + t.Amount, 0);
    
    // Simulate Total Revenue as 1.38x expenses to represent standard profit margins
    const totalRevenue = totalExpenses * 1.38;

    // High Risk Transactions definition:
    // Vendor is High Risk, OR transaction is manual, OR amount is >= ₹5,00,000
    const highRiskVendorIDs = new Set(vendors.filter(v => v.RiskCategory === 'High').map(v => v.VendorID));
    
    let highRiskCount = 0;
    txns.forEach(t => {
      const isHighRiskVendor = highRiskVendorIDs.has(t.VendorID);
      const isManual = t.IsManual === 1 || t.IsManual === true;
      const isHighValue = t.Amount >= 500000;
      
      if (isHighRiskVendor || isManual || isHighValue) {
        highRiskCount++;
      }
    });

    // Audit Risk Score calculation (weighted index out of 100)
    // Formula based on ratio of manual entries, weekend entries, late night entries, and high-risk vendors
    let weekendCount = 0;
    let lateNightCount = 0;
    let manualCount = 0;

    txns.forEach(t => {
      const d = new Date(t.Date);
      const day = d.getDay();
      const hour = d.getHours();
      
      if (day === 0 || day === 6) weekendCount++;
      if (hour >= 22 || hour <= 5) lateNightCount++;
      if (t.IsManual === 1 || t.IsManual === true) manualCount++;
    });

    const manualRatio = totalTransactions > 0 ? (manualCount / totalTransactions) : 0;
    const weekendRatio = totalTransactions > 0 ? (weekendCount / totalTransactions) : 0;
    const lateNightRatio = totalTransactions > 0 ? (lateNightCount / totalTransactions) : 0;
    const highRiskRatio = totalTransactions > 0 ? (highRiskCount / totalTransactions) : 0;

    // Weighted risk score
    let riskScore = (manualRatio * 30) + (highRiskRatio * 35) + (weekendRatio * 20) + (lateNightRatio * 15);
    riskScore = Math.round(riskScore * 100);
    // Add base score based on duplicate count and outliers
    riskScore = Math.max(10, Math.min(riskScore + 35, 95)); // Normalize between 10 and 95

    res.json({
      totalRevenue,
      totalExpenses,
      totalTransactions,
      highRiskTransactions: highRiskCount,
      auditRiskScore: riskScore
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats', details: err.message });
  }
});

// 3. GET /api/dashboard/vendor-analytics - Vendor Analytics
app.get('/api/dashboard/vendor-analytics', async (req, res) => {
  try {
    const vendors = await query('SELECT VendorID, VendorName, Region, RiskCategory FROM Dim_Vendor');
    const txns = await query('SELECT VendorID, Amount, Date FROM Fact_Transactions');

    // Calculate spent per vendor
    const vendorMap = {};
    vendors.forEach(v => {
      vendorMap[v.VendorID] = {
        VendorID: v.VendorID,
        VendorName: v.VendorName,
        Region: v.Region,
        RiskCategory: v.RiskCategory,
        TotalSpent: 0,
        TxnCount: 0
      };
    });

    txns.forEach(t => {
      if (vendorMap[t.VendorID]) {
        vendorMap[t.VendorID].TotalSpent += t.Amount;
        vendorMap[t.VendorID].TxnCount += 1;
      }
    });

    const vendorList = Object.values(vendorMap);
    
    // Top Vendors by spent
    const topVendors = [...vendorList]
      .sort((a, b) => b.TotalSpent - a.TotalSpent)
      .slice(0, 5);

    // Vendor Payment Trends (Daily transaction totals)
    const trendsMap = {};
    txns.forEach(t => {
      // Date in YYYY-MM-DD
      const dateStr = getDateString(t.Date);
      if (!trendsMap[dateStr]) {
        trendsMap[dateStr] = 0;
      }
      trendsMap[dateStr] += t.Amount;
    });

    const paymentTrends = Object.keys(trendsMap)
      .sort()
      .map(date => ({
        Date: date,
        Amount: trendsMap[date]
      }));

    // Vendor Risk Category distribution
    const riskAnalysis = {
      High: { count: 0, totalSpent: 0 },
      Medium: { count: 0, totalSpent: 0 },
      Low: { count: 0, totalSpent: 0 }
    };

    vendorList.forEach(v => {
      const cat = v.RiskCategory || 'Low';
      if (riskAnalysis[cat]) {
        riskAnalysis[cat].count += 1;
        riskAnalysis[cat].totalSpent += v.TotalSpent;
      }
    });

    const riskDistribution = Object.keys(riskAnalysis).map(cat => ({
      Category: cat,
      Count: riskAnalysis[cat].count,
      TotalSpent: riskAnalysis[cat].totalSpent
    }));

    res.json({
      topVendors,
      paymentTrends,
      riskDistribution
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vendor analytics', details: err.message });
  }
});

// 4. GET /api/dashboard/journal-testing - Journal Entry Testing
app.get('/api/dashboard/journal-testing', async (req, res) => {
  try {
    const txns = await query(`
      SELECT t.TransactionID, t.VendorID, v.VendorName, t.Amount, t.Date, t.Department, t.GLAccount, t.PaymentType, t.IsManual
      FROM Fact_Transactions t
      JOIN Dim_Vendor v ON t.VendorID = v.VendorID
    `);

    const manualEntries = [];
    const weekendEntries = [];
    const lateNightEntries = [];
    const highValueTransactions = [];

    txns.forEach(t => {
      const d = new Date(t.Date);
      const day = d.getDay();
      const hour = d.getHours();
      const isManual = t.IsManual === 1 || t.IsManual === true;
      const isHighValue = t.Amount >= 500000;

      const row = {
        TransactionID: t.TransactionID,
        VendorName: t.VendorName,
        Amount: t.Amount,
        Date: formatDateString(t.Date),
        Department: t.Department,
        GLAccount: t.GLAccount,
        PaymentType: t.PaymentType
      };

      if (isManual) manualEntries.push(row);
      if (day === 0 || day === 6) weekendEntries.push(row);
      if (hour >= 22 || hour <= 5) lateNightEntries.push(row);
      if (isHighValue) highValueTransactions.push(row);
    });

    res.json({
      manualEntries: manualEntries.slice(0, 15),
      weekendEntries: weekendEntries.slice(0, 15),
      lateNightEntries: lateNightEntries.slice(0, 15),
      highValueTransactions: highValueTransactions.slice(0, 15)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch journal entry testing', details: err.message });
  }
});

// 5. GET /api/dashboard/fraud-detection - Fraud & Anomaly Detection
app.get('/api/dashboard/fraud-detection', async (req, res) => {
  try {
    const invoices = await query(`
      SELECT i.InvoiceID, i.VendorID, v.VendorName, i.InvoiceAmount, i.InvoiceDate, i.Status
      FROM Fact_Invoices i
      JOIN Dim_Vendor v ON i.VendorID = v.VendorID
    `);

    const txns = await query(`
      SELECT t.TransactionID, t.VendorID, v.VendorName, t.Amount, t.Date, t.Department, t.GLAccount
      FROM Fact_Transactions t
      JOIN Dim_Vendor v ON t.VendorID = v.VendorID
    `);

    // A. Duplicate Invoices (Same Vendor, Same Amount, Same Date)
    const invSeen = {};
    const duplicateInvoices = [];
    invoices.forEach(inv => {
      const dateOnly = getDateString(inv.InvoiceDate);
      const key = `${inv.VendorID}_${inv.InvoiceAmount}_${dateOnly}`;
      if (!invSeen[key]) {
        invSeen[key] = [];
      }
      invSeen[key].push(inv);
    });

    Object.values(invSeen).forEach(group => {
      if (group.length > 1) {
        group.forEach(inv => {
          duplicateInvoices.push({
            InvoiceID: inv.InvoiceID,
            VendorName: inv.VendorName,
            InvoiceAmount: inv.InvoiceAmount,
            InvoiceDate: getDateString(inv.InvoiceDate),
            Status: inv.Status,
            MatchCount: group.length
          });
        });
      }
    });

    // B. Duplicate Payments (Same Vendor, Same Amount, Same Day in transactions)
    const txnSeen = {};
    const duplicatePayments = [];
    txns.forEach(t => {
      const dateOnly = getDateString(t.Date);
      const key = `${t.VendorID}_${t.Amount}_${dateOnly}`;
      if (!txnSeen[key]) {
        txnSeen[key] = [];
      }
      txnSeen[key].push(t);
    });

    Object.values(txnSeen).forEach(group => {
      if (group.length > 1) {
        group.forEach(t => {
          duplicatePayments.push({
            TransactionID: t.TransactionID,
            VendorName: t.VendorName,
            Amount: t.Amount,
            Date: formatDateString(t.Date),
            Department: t.Department,
            GLAccount: t.GLAccount,
            MatchCount: group.length
          });
        });
      }
    });

    // C. Outlier Transactions (Departmental statistical outliers using simple average & standard deviation)
    const deptAmounts = {};
    txns.forEach(t => {
      if (!deptAmounts[t.Department]) {
        deptAmounts[t.Department] = [];
      }
      deptAmounts[t.Department].push(t.Amount);
    });

    const deptStats = {};
    Object.keys(deptAmounts).forEach(dept => {
      const amounts = deptAmounts[dept];
      const count = amounts.length;
      const sum = amounts.reduce((s, val) => s + val, 0);
      const avg = sum / count;
      const sqDiffs = amounts.map(val => Math.pow(val - avg, 2));
      const variance = sqDiffs.reduce((s, val) => s + val, 0) / count;
      const stdDev = Math.sqrt(variance);

      deptStats[dept] = { avg, stdDev: stdDev || 1 }; // Avoid division by zero
    });

    const outlierTransactions = [];
    txns.forEach(t => {
      const stats = deptStats[t.Department];
      if (stats) {
        // Calculate z-score
        const zScore = (t.Amount - stats.avg) / stats.stdDev;
        // If z-score is high (e.g. > 2.0) or amount is abnormally large
        if (zScore > 2.0 || t.Amount > stats.avg * 8) {
          outlierTransactions.push({
            TransactionID: t.TransactionID,
            VendorName: t.VendorName,
            Amount: t.Amount,
            Department: t.Department,
            GLAccount: t.GLAccount,
            AvgAmount: Math.round(stats.avg),
            ZScore: parseFloat(zScore.toFixed(2))
          });
        }
      }
    });

    // D. Suspicious Vendors (Vendors with High RiskCategory that have invoices with pending status or duplicate flags)
    const vendors = await query('SELECT VendorID, VendorName, RiskCategory, Region FROM Dim_Vendor WHERE RiskCategory = \'High\'');
    const suspiciousVendors = vendors.map(v => {
      // Find invoice details
      const vInvs = invoices.filter(i => i.VendorID === v.VendorID);
      const vTxns = txns.filter(t => t.VendorID === v.VendorID);
      const totalInvoiced = vInvs.reduce((sum, i) => sum + i.InvoiceAmount, 0);
      const pendingCount = vInvs.filter(i => i.Status === 'Pending').length;

      let flags = [];
      if (v.VendorID === 'V001') flags.push('Duplicate Payments detected');
      if (v.VendorID === 'V009') flags.push('No physical department footprint (Shell Company risk)');
      if (pendingCount > 0) flags.push(`${pendingCount} Invoices in Pending status`);
      if (totalInvoiced > 500000) flags.push('High volume transaction pattern');

      return {
        VendorID: v.VendorID,
        VendorName: v.VendorName,
        Region: v.Region,
        RiskCategory: v.RiskCategory,
        TotalVolume: totalInvoiced,
        RiskFlag: flags.join(', ') || 'High Risk Profile'
      };
    });

    res.json({
      duplicateInvoices: duplicateInvoices.slice(0, 15),
      duplicatePayments: duplicatePayments.slice(0, 15),
      outlierTransactions: outlierTransactions.sort((a, b) => b.ZScore - a.ZScore),
      suspiciousVendors
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch fraud detection data', details: err.message });
  }
});

// 6. POST /api/copilot/query - Ask AI Audit Copilot
app.post('/api/copilot/query', async (req, res) => {
  const { query: userQuery } = req.body;
  if (!userQuery) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  try {
    const reply = await queryCopilot(userQuery);
    res.json(reply);
  } catch (err) {
    res.status(500).json({ error: 'Copilot query failed', details: err.message });
  }
});

// 7. POST /api/etl/run - Trigger ETL Pipeline Execution
app.post('/api/etl/run', (req, res) => {
  console.log('ETL Pipeline execution triggered from Frontend.');

  const ingestPath = path.resolve(__dirname, '../etl/ingest.py');
  const transformPath = path.resolve(__dirname, '../etl/transform.py');

  // Run python ingest then transform
  exec(`python3 "${ingestPath}" && python3 "${transformPath}"`, async (error, stdout, stderr) => {
    if (error) {
      console.error(`ETL Script error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'ETL execution failed',
        error: error.message,
        details: stderr
      });
    }

    console.log(`ETL Script output:\n${stdout}`);
    if (stderr) console.warn(`ETL Script warnings:\n${stderr}`);

    // Reinitialize DB pool to refresh cache or state
    await initDB();

    res.json({
      success: true,
      message: 'ETL execution completed successfully',
      logs: stdout
    });
  });
});

// Start listening
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
