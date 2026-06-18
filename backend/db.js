import mssql from 'mssql';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_TYPE = (process.env.DB_TYPE || 'sqlserver').toLowerCase();
const SQLITE_PATH = path.resolve(__dirname, process.env.SQLITE_PATH || '../audit_local.db');

// SQL Server Config
const mssqlConfig = {
  user: process.env.MSSQL_USER || 'sa',
  password: process.env.MSSQL_PASSWORD || 'YourPassword123',
  server: process.env.MSSQL_SERVER || 'localhost',
  database: process.env.MSSQL_DATABASE || 'FinancialAuditDB',
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  options: {
    encrypt: true, // Use encryption for Azure SQL
    trustServerCertificate: true // Trust self-signed certificate for local dev
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let mssqlPool = null;
let sqliteDb = null;
let activeDbType = 'sqlite'; // Default fallback

// Initialize connection
export async function initDB() {
  if (DB_TYPE === 'sqlserver') {
    try {
      console.log(`Attempting connection to SQL Server: ${mssqlConfig.server}:${mssqlConfig.port}, Database: ${mssqlConfig.database}`);
      mssqlPool = await mssql.connect(mssqlConfig);
      activeDbType = 'sqlserver';
      console.log('Successfully connected to SQL Server Database.');
      return;
    } catch (err) {
      console.warn(`[WARNING] SQL Server connection failed: ${err.message}`);
      console.warn('Falling back to local SQLite database...');
    }
  }

  // Fallback to SQLite
  try {
    console.log(`Connecting to local SQLite database at: ${SQLITE_PATH}`);
    sqliteDb = new sqlite3.Database(SQLITE_PATH, sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        console.error(`SQLite connection error (does audit_local.db exist? Run ETL first!): ${err.message}`);
      }
    });
    activeDbType = 'sqlite';
    console.log('Successfully connected to SQLite Database.');
  } catch (err) {
    console.error(`Failed to connect to SQLite: ${err.message}`);
  }
}

// Unified query runner
export async function query(sql, params = []) {
  if (activeDbType === 'sqlserver' && mssqlPool) {
    try {
      const request = mssqlPool.request();
      let paramIndex = 0;
      
      // Translate '?' placeholders to '@p0', '@p1', ... for SQL Server
      const mssqlSql = sql.replace(/\?/g, () => {
        const name = `p${paramIndex++}`;
        return `@${name}`;
      });

      // Bind parameters
      for (let i = 0; i < params.length; i++) {
        request.input(`p${i}`, params[i]);
      }

      const result = await request.query(mssqlSql);
      return result.recordset;
    } catch (err) {
      console.error(`SQL Server query error: ${err.message}\nQuery: ${sql}`);
      throw err;
    }
  } else {
    // SQLite query execution
    return new Promise((resolve, reject) => {
      if (!sqliteDb) {
        return reject(new Error('No active database connection available. Run initDB() first.'));
      }
      
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) {
          console.error(`SQLite query error: ${err.message}\nQuery: ${sql}`);
          return reject(err);
        }
        resolve(rows);
      });
    });
  }
}

// Check database connection status
export function getDbStatus() {
  return {
    connected: activeDbType === 'sqlserver' ? !!mssqlPool : !!sqliteDb,
    type: activeDbType,
    details: activeDbType === 'sqlserver' 
      ? { server: mssqlConfig.server, database: mssqlConfig.database }
      : { path: SQLITE_PATH }
  };
}
