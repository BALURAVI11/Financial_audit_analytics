import os
import sqlite3
import pymssql
from datetime import datetime

# Helper to read .env file
def load_env():
    env_path = os.path.join(os.path.dirname(__file__), "../backend/.env")
    if not os.path.exists(env_path):
        env_path = os.path.join(os.path.dirname(__file__), ".env")
        if not os.path.exists(env_path):
            return {}
    
    config = {}
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                config[key.strip()] = val.strip().strip('"').strip("'")
    return config

config = load_env()

DB_TYPE = config.get("DB_TYPE", "sqlserver").lower()
SQLITE_PATH = config.get("SQLITE_PATH", "audit_local.db")

# Connection details for MSSQL
SERVER = config.get("MSSQL_SERVER", "localhost")
PORT = config.get("MSSQL_PORT", "1433")
USER = config.get("MSSQL_USER", "sa")
PASSWORD = config.get("MSSQL_PASSWORD", "YourPassword123")
DATABASE = config.get("MSSQL_DATABASE", "FinancialAuditDB")

def get_db_connection():
    global DB_TYPE
    if DB_TYPE == "sqlserver":
        try:
            conn = pymssql.connect(
                server=SERVER,
                port=int(PORT),
                user=USER,
                password=PASSWORD,
                database=DATABASE,
                autocommit=True
            )
            print("Successfully connected to SQL Server.")
            return conn, "sqlserver"
        except Exception as e:
            print(f"[WARNING] SQL Server connection failed: {e}")
            print("Falling back to local SQLite database (audit_local.db) for transformation.")
            DB_TYPE = "sqlite"
            
    conn = sqlite3.connect(SQLITE_PATH)
    print("Connected to SQLite Database.")
    return conn, "sqlite"

def drop_foreign_keys_mssql(cursor):
    # Drop existing foreign keys to avoid block during table drop
    try:
        cursor.execute("""
            IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Transactions_Vendors')
                ALTER TABLE Fact_Transactions DROP CONSTRAINT FK_Transactions_Vendors;
        """)
        cursor.execute("""
            IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Invoices_Vendors')
                ALTER TABLE Fact_Invoices DROP CONSTRAINT FK_Invoices_Vendors;
        """)
    except Exception as e:
        print(f"Note (FK drop): {e}")

def create_production_tables(conn, db_type):
    cursor = conn.cursor()
    
    if db_type == "sqlserver":
        drop_foreign_keys_mssql(cursor)
        
        # Drop existing tables
        cursor.execute("IF OBJECT_ID('Fact_Transactions', 'U') IS NOT NULL DROP TABLE Fact_Transactions")
        cursor.execute("IF OBJECT_ID('Fact_Invoices', 'U') IS NOT NULL DROP TABLE Fact_Invoices")
        cursor.execute("IF OBJECT_ID('Dim_Vendor', 'U') IS NOT NULL DROP TABLE Dim_Vendor")
        cursor.execute("IF OBJECT_ID('Dim_Department', 'U') IS NOT NULL DROP TABLE Dim_Department")
        
        # Create Dim_Vendor
        cursor.execute("""
            CREATE TABLE Dim_Vendor (
                VendorID VARCHAR(50) PRIMARY KEY,
                VendorName VARCHAR(255) NOT NULL,
                Region VARCHAR(100),
                RiskCategory VARCHAR(50)
            )
        """)
        
        # Create Dim_Department
        cursor.execute("""
            CREATE TABLE Dim_Department (
                DepartmentID VARCHAR(50) PRIMARY KEY,
                DepartmentName VARCHAR(255) NOT NULL,
                CostCenter VARCHAR(100)
            )
        """)
        
        # Create Fact_Transactions
        cursor.execute("""
            CREATE TABLE Fact_Transactions (
                TransactionID VARCHAR(50) PRIMARY KEY,
                VendorID VARCHAR(50) CONSTRAINT FK_Transactions_Vendors FOREIGN KEY REFERENCES Dim_Vendor(VendorID),
                Amount DECIMAL(18,2) NOT NULL,
                Date DATETIME NOT NULL,
                Department VARCHAR(255),
                GLAccount VARCHAR(255),
                PaymentType VARCHAR(50),
                IsManual BIT DEFAULT 0
            )
        """)
        
        # Create Fact_Invoices
        cursor.execute("""
            CREATE TABLE Fact_Invoices (
                InvoiceID VARCHAR(50) PRIMARY KEY,
                VendorID VARCHAR(50) CONSTRAINT FK_Invoices_Vendors FOREIGN KEY REFERENCES Dim_Vendor(VendorID),
                InvoiceAmount DECIMAL(18,2) NOT NULL,
                InvoiceDate DATETIME NOT NULL,
                Status VARCHAR(50)
            )
        """)
    else: # SQLite
        cursor.execute("DROP TABLE IF EXISTS Fact_Transactions")
        cursor.execute("DROP TABLE IF EXISTS Fact_Invoices")
        cursor.execute("DROP TABLE IF EXISTS Dim_Vendor")
        cursor.execute("DROP TABLE IF EXISTS Dim_Department")
        
        cursor.execute("""
            CREATE TABLE Dim_Vendor (
                VendorID TEXT PRIMARY KEY,
                VendorName TEXT NOT NULL,
                Region TEXT,
                RiskCategory TEXT
            )
        """)
        
        cursor.execute("""
            CREATE TABLE Dim_Department (
                DepartmentID TEXT PRIMARY KEY,
                DepartmentName TEXT NOT NULL,
                CostCenter TEXT
            )
        """)
        
        cursor.execute("""
            CREATE TABLE Fact_Transactions (
                TransactionID TEXT PRIMARY KEY,
                VendorID TEXT,
                Amount REAL NOT NULL,
                Date TEXT NOT NULL,
                Department TEXT,
                GLAccount TEXT,
                PaymentType TEXT,
                IsManual INTEGER DEFAULT 0,
                FOREIGN KEY (VendorID) REFERENCES Dim_Vendor(VendorID)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE Fact_Invoices (
                InvoiceID TEXT PRIMARY KEY,
                VendorID TEXT,
                InvoiceAmount REAL NOT NULL,
                InvoiceDate TEXT NOT NULL,
                Status TEXT,
                FOREIGN KEY (VendorID) REFERENCES Dim_Vendor(VendorID)
            )
        """)
    
    conn.commit()
    print("Production tables created.")

def run_transformations(conn, db_type):
    cursor = conn.cursor()
    placeholder = "%s" if db_type == "sqlserver" else "?"
    
    # 1. Load Vendors
    print("Transforming & Loading Vendors...")
    cursor.execute("SELECT VendorID, VendorName, Region, RiskCategory FROM staging_vendors")
    vendors_rows = cursor.fetchall()
    for row in vendors_rows:
        cursor.execute(f"INSERT INTO Dim_Vendor VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder})", row)
    print(f"Loaded {len(vendors_rows)} vendors into Dim_Vendor.")
    
    # 2. Extract and load unique Departments
    print("Extracting & Loading Departments...")
    cursor.execute("SELECT DISTINCT Department FROM staging_transactions WHERE Department IS NOT NULL AND Department <> ''")
    depts_rows = cursor.fetchall()
    
    # Department static mapping for CostCenters
    dept_map = {
        "Finance": ("D01", "CC-101"),
        "Human Resources": ("D02", "CC-102"),
        "Information Technology": ("D03", "CC-103"),
        "Marketing & Sales": ("D04", "CC-104"),
        "Operations": ("D05", "CC-105"),
        "Purchasing": ("D06", "CC-106")
    }
    
    dept_index = 7
    loaded_depts = 0
    for row in depts_rows:
        dept_name = row[0]
        if dept_name in dept_map:
            dept_id, cc = dept_map[dept_name]
        else:
            dept_id = f"D{dept_index:02d}"
            cc = f"CC-{100 + dept_index}"
            dept_index += 1
            
        cursor.execute(f"INSERT INTO Dim_Department VALUES ({placeholder}, {placeholder}, {placeholder})", (dept_id, dept_name, cc))
        loaded_depts += 1
    print(f"Loaded {loaded_depts} departments into Dim_Department.")

    # 3. Transform & Load Transactions
    print("Transforming & Loading Transactions...")
    cursor.execute("SELECT TransactionID, VendorID, Amount, Date, Department, GLAccount, PaymentType FROM staging_transactions")
    txn_rows = cursor.fetchall()
    loaded_txns = 0
    
    for row in txn_rows:
        txn_id, vendor_id, amount, date_str, dept, gl_acct, pay_type = row
        
        # A. Flag Manual Journal Entries (IsManual = 1 if GLAccount starts with '700100' or matches manual)
        is_manual = 0
        if gl_acct and (gl_acct.startswith("700100") or "manual" in gl_acct.lower()):
            is_manual = 1
            
        # B. Parse and standardize Date format
        try:
            # Staging dates look like "2026-06-03 23:45:00"
            dt_obj = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
            standard_date = dt_obj.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            standard_date = date_str # Fallback to original
            
        # Insert
        cursor.execute(f"""
            INSERT INTO Fact_Transactions (TransactionID, VendorID, Amount, Date, Department, GLAccount, PaymentType, IsManual)
            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
        """, (txn_id, vendor_id, amount, standard_date, dept, gl_acct, pay_type, is_manual))
        loaded_txns += 1
    print(f"Loaded {loaded_txns} transactions into Fact_Transactions.")

    # 4. Transform & Load Invoices
    print("Transforming & Loading Invoices...")
    cursor.execute("SELECT InvoiceID, VendorID, InvoiceAmount, InvoiceDate, Status FROM staging_invoices")
    inv_rows = cursor.fetchall()
    loaded_invs = 0
    
    for row in inv_rows:
        inv_id, vendor_id, inv_amount, date_str, status = row
        
        # Standardize date format to YYYY-MM-DD
        try:
            dt_obj = datetime.strptime(date_str, "%Y-%m-%d")
            standard_date = dt_obj.strftime("%Y-%m-%d 00:00:00")
        except Exception:
            try:
                dt_obj = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
                standard_date = dt_obj.strftime("%Y-%m-%d 00:00:00")
            except Exception:
                standard_date = date_str # Fallback
            
        cursor.execute(f"""
            INSERT INTO Fact_Invoices (InvoiceID, VendorID, InvoiceAmount, InvoiceDate, Status)
            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
        """, (inv_id, vendor_id, inv_amount, standard_date, status))
        loaded_invs += 1
    print(f"Loaded {loaded_invs} invoices into Fact_Invoices.")
    
    conn.commit()
    print("Curated tables loaded successfully.")

def main():
    print("Starting ETL Transformation Phase...")
    conn, db_type = get_db_connection()
    try:
        create_production_tables(conn, db_type)
        run_transformations(conn, db_type)
        print("ETL Transformation Completed.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
