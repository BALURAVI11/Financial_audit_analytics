import os
import csv
import sqlite3
import pymssql

# Helper to read .env file
def load_env():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(script_dir, "../backend/.env")
    env_dir = os.path.join(script_dir, "../backend")
    if not os.path.exists(env_path):
        env_path = os.path.join(script_dir, ".env")
        env_dir = script_dir
        if not os.path.exists(env_path):
            return {}, script_dir
    
    config = {}
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                config[key.strip()] = val.strip().strip('"').strip("'")
    return config, env_dir

config, env_dir = load_env()

DB_TYPE = config.get("DB_TYPE", "sqlserver").lower()
raw_sqlite_path = config.get("SQLITE_PATH", "audit_local.db")
if not os.path.isabs(raw_sqlite_path):
    SQLITE_PATH = os.path.abspath(os.path.join(env_dir, raw_sqlite_path))
else:
    SQLITE_PATH = raw_sqlite_path

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
            # Try to connect to SQL Server
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
            print("Falling back to local SQLite database (audit_local.db) for ingestion.")
            DB_TYPE = "sqlite"
            
    # SQLite Fallback
    conn = sqlite3.connect(SQLITE_PATH)
    print("Connected to SQLite Database.")
    return conn, "sqlite"

def create_staging_tables(conn, db_type):
    cursor = conn.cursor()
    
    # 1. Drop old staging tables
    if db_type == "sqlserver":
        cursor.execute("IF OBJECT_ID('staging_vendors', 'U') IS NOT NULL DROP TABLE staging_vendors")
        cursor.execute("IF OBJECT_ID('staging_invoices', 'U') IS NOT NULL DROP TABLE staging_invoices")
        cursor.execute("IF OBJECT_ID('staging_transactions', 'U') IS NOT NULL DROP TABLE staging_transactions")
        
        # Create staging tables
        cursor.execute("""
            CREATE TABLE staging_vendors (
                VendorID VARCHAR(50),
                VendorName VARCHAR(255),
                Region VARCHAR(100),
                RiskCategory VARCHAR(50)
            )
        """)
        cursor.execute("""
            CREATE TABLE staging_invoices (
                InvoiceID VARCHAR(50),
                VendorID VARCHAR(50),
                InvoiceAmount DECIMAL(18,2),
                InvoiceDate VARCHAR(50),
                Status VARCHAR(50)
            )
        """)
        cursor.execute("""
            CREATE TABLE staging_transactions (
                TransactionID VARCHAR(50),
                VendorID VARCHAR(50),
                Amount DECIMAL(18,2),
                Date VARCHAR(50),
                Department VARCHAR(255),
                GLAccount VARCHAR(255),
                PaymentType VARCHAR(50)
            )
        """)
    else: # SQLite
        cursor.execute("DROP TABLE IF EXISTS staging_vendors")
        cursor.execute("DROP TABLE IF EXISTS staging_invoices")
        cursor.execute("DROP TABLE IF EXISTS staging_transactions")
        
        cursor.execute("""
            CREATE TABLE staging_vendors (
                VendorID TEXT,
                VendorName TEXT,
                Region TEXT,
                RiskCategory TEXT
            )
        """)
        cursor.execute("""
            CREATE TABLE staging_invoices (
                InvoiceID TEXT,
                VendorID TEXT,
                InvoiceAmount REAL,
                InvoiceDate TEXT,
                Status TEXT
            )
        """)
        cursor.execute("""
            CREATE TABLE staging_transactions (
                TransactionID TEXT,
                VendorID TEXT,
                Amount REAL,
                Date TEXT,
                Department TEXT,
                GLAccount TEXT,
                PaymentType TEXT
            )
        """)
    
    conn.commit()
    print("Staging tables recreated.")

def load_csv_to_staging(conn, db_type):
    cursor = conn.cursor()
    placeholder = "%s" if db_type == "sqlserver" else "?"
    
    # Resolve paths relative to the script's directory (which is etl/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    uploads_dir = os.path.join(script_dir, "../uploads")
    
    # 1. Load Vendors
    vendors_count = 0
    vendors_path = os.path.join(uploads_dir, "vendors.csv")
    if os.path.exists(vendors_path):
        with open(vendors_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader)
            for row in reader:
                if row:
                    cursor.execute(f"INSERT INTO staging_vendors VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder})", row)
                    vendors_count += 1
    print(f"Loaded {vendors_count} records into staging_vendors.")
    
    # 2. Load Invoices
    invoices_count = 0
    invoices_path = os.path.join(uploads_dir, "invoices.csv")
    if os.path.exists(invoices_path):
        with open(invoices_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader)
            for row in reader:
                if row:
                    # Parse invoice amount as float
                    row[2] = float(row[2]) if row[2] else 0.0
                    cursor.execute(f"INSERT INTO staging_invoices VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})", row)
                    invoices_count += 1
    print(f"Loaded {invoices_count} records into staging_invoices.")
    
    # 3. Load Transactions
    transactions_count = 0
    transactions_path = os.path.join(uploads_dir, "transactions.csv")
    if os.path.exists(transactions_path):
        with open(transactions_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader)
            for row in reader:
                if row:
                    # Parse amount as float
                    row[2] = float(row[2]) if row[2] else 0.0
                    cursor.execute(f"INSERT INTO staging_transactions VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})", row)
                    transactions_count += 1
    print(f"Loaded {transactions_count} records into staging_transactions.")
    
    conn.commit()
    print("Staging data loaded successfully.")

def main():
    print("Starting ETL Ingestion Phase...")
    conn, db_type = get_db_connection()
    try:
        create_staging_tables(conn, db_type)
        load_csv_to_staging(conn, db_type)
        print("ETL Ingestion Completed.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
