import csv
import os
import random
from datetime import datetime, timedelta

# Ensure uploads directory exists
os.makedirs("uploads", exist_ok=True)

# 1. Dim_Vendor data
vendors = [
    {"VendorID": "V001", "VendorName": "Apex Logistics", "Region": "North", "RiskCategory": "High"},
    {"VendorID": "V002", "VendorName": "ByteCorp IT Solutions", "Region": "West", "RiskCategory": "Medium"},
    {"VendorID": "V003", "VendorName": "Global Consulting Group", "Region": "South", "RiskCategory": "High"},
    {"VendorID": "V004", "VendorName": "Vertex Office Supplies", "Region": "East", "RiskCategory": "Low"},
    {"VendorID": "V005", "VendorName": "Nexus Trade Corp", "Region": "North", "RiskCategory": "High"},
    {"VendorID": "V006", "VendorName": "Prime Utilities Ltd", "Region": "South", "RiskCategory": "Low"},
    {"VendorID": "V007", "VendorName": "Horizon Marketing Inc", "Region": "West", "RiskCategory": "Medium"},
    {"VendorID": "V008", "VendorName": "Synergy Security Services", "Region": "East", "RiskCategory": "Low"},
    {"VendorID": "V009", "VendorName": "Shell Company Partners", "Region": "North", "RiskCategory": "High"},
    {"VendorID": "V010", "VendorName": "Titan Manufacturing", "Region": "West", "RiskCategory": "Low"}
]

with open("uploads/vendors.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["VendorID", "VendorName", "Region", "RiskCategory"])
    writer.writeheader()
    writer.writerows(vendors)

print("Generated uploads/vendors.csv")

# 2. Dim_Department helper data
departments = [
    {"ID": "D01", "Name": "Finance", "CostCenter": "CC-101"},
    {"ID": "D02", "Name": "Human Resources", "CostCenter": "CC-102"},
    {"ID": "D03", "Name": "Information Technology", "CostCenter": "CC-103"},
    {"ID": "D04", "Name": "Marketing & Sales", "CostCenter": "CC-104"},
    {"ID": "D05", "Name": "Operations", "CostCenter": "CC-105"},
    {"ID": "D06", "Name": "Purchasing", "CostCenter": "CC-106"}
]

# We will generate transactions and invoices centered around June 2026 (the current month).
base_date = datetime(2026, 6, 1)

# Let's seed random generator for reproducibility
random.seed(42)

# 3. Fact_Transactions
transactions = []
txn_id_counter = 1000

gl_accounts = [
    "600100 - Travel Expense", 
    "600200 - Office Supplies", 
    "500300 - IT Services", 
    "600400 - Marketing Expense",
    "500100 - Raw Materials", 
    "600600 - Professional Fees",
    "700100 - Manual Adjustments"
]

payment_types = ["ACH", "Wire", "Check", "Credit Card"]

# Helper to generate dates in June 2026
def random_date(start_date, day_range):
    delta_days = random.randint(0, day_range - 1)
    delta_hours = random.randint(0, 23)
    delta_minutes = random.randint(0, 59)
    return start_date + timedelta(days=delta_days, hours=delta_hours, minutes=delta_minutes)

# Generate normal transactions
for i in range(120):
    txn_id_counter += 1
    vendor = random.choice(vendors)
    dept = random.choice(departments)
    amount = round(random.uniform(500, 45000), 2)
    # Most transactions are during business hours on weekdays
    dt = random_date(base_date, 17) # Dates from June 1 to June 17
    # Make sure most are weekdays during day time
    if dt.weekday() >= 5: # Weekend, move it to a weekday
        dt = dt - timedelta(days=2)
    if dt.hour < 8 or dt.hour > 18: # Outside business hours, move it
        dt = dt.replace(hour=random.randint(9, 17))
        
    transactions.append({
        "TransactionID": f"TXN-{txn_id_counter}",
        "VendorID": vendor["VendorID"],
        "Amount": amount,
        "Date": dt.strftime("%Y-%m-%d %H:%M:%S"),
        "Department": dept["Name"],
        "GLAccount": random.choice(gl_accounts[:-1]), # No manual adjustment for normal entries
        "PaymentType": random.choice(payment_types)
    })

# ANOMALIES FOR JOURNAL ENTRY TESTING & FRAUD DETECTION

# A. Weekend Entries (Posted on Saturday/Sunday)
# Sat June 6, Sun June 7, Sat June 13, Sun June 14
weekend_dates = [datetime(2026, 6, 6, 14, 30), datetime(2026, 6, 7, 11, 15), datetime(2026, 6, 13, 16, 45), datetime(2026, 6, 14, 15, 20)]
for wd in weekend_dates:
    txn_id_counter += 1
    vendor = random.choice(vendors)
    dept = random.choice(departments)
    amount = round(random.uniform(12000, 65000), 2)
    transactions.append({
        "TransactionID": f"TXN-{txn_id_counter}",
        "VendorID": vendor["VendorID"],
        "Amount": amount,
        "Date": wd.strftime("%Y-%m-%d %H:%M:%S"),
        "Department": dept["Name"],
        "GLAccount": random.choice(gl_accounts[:-1]),
        "PaymentType": "ACH"
    })

# B. Late Night Entries (Between 22:00 and 05:00)
late_night_times = [
    datetime(2026, 6, 3, 23, 45),
    datetime(2026, 6, 8, 2, 15),
    datetime(2026, 6, 11, 4, 30),
    datetime(2026, 6, 15, 23, 10)
]
for lnt in late_night_times:
    txn_id_counter += 1
    vendor = random.choice(vendors)
    dept = random.choice(departments)
    amount = round(random.uniform(5000, 48000), 2)
    transactions.append({
        "TransactionID": f"TXN-{txn_id_counter}",
        "VendorID": vendor["VendorID"],
        "Amount": amount,
        "Date": lnt.strftime("%Y-%m-%d %H:%M:%S"),
        "Department": dept["Name"],
        "GLAccount": random.choice(gl_accounts[:-1]),
        "PaymentType": "Wire"
    })

# C. High Value Transactions (Above ₹5,00,000)
high_values = [750000.00, 620000.00, 950000.00, 520000.00]
for hv in high_values:
    txn_id_counter += 1
    vendor = random.choice([v for v in vendors if v["RiskCategory"] == "High"]) # Risky vendors get high payments
    dept = random.choice(departments)
    dt = datetime(2026, 6, random.randint(1, 15), random.randint(9, 17), random.randint(0, 59))
    transactions.append({
        "TransactionID": f"TXN-{txn_id_counter}",
        "VendorID": vendor["VendorID"],
        "Amount": hv,
        "Date": dt.strftime("%Y-%m-%d %H:%M:%S"),
        "Department": dept["Name"],
        "GLAccount": "500100 - Raw Materials",
        "PaymentType": "Wire"
    })

# D. Manual Journal Entries (Flagged via GLAccount starting with '700100 - Manual Adjustments')
manual_entries = [
    {"Amount": 125000.00, "Dept": "Finance", "Date": datetime(2026, 6, 2, 10, 0)},
    {"Amount": 34000.00, "Dept": "Human Resources", "Date": datetime(2026, 6, 5, 14, 30)},
    {"Amount": 280000.00, "Dept": "Finance", "Date": datetime(2026, 6, 9, 16, 0)},
    {"Amount": 15000.00, "Dept": "Marketing & Sales", "Date": datetime(2026, 6, 12, 11, 15)}
]
for me in manual_entries:
    txn_id_counter += 1
    vendor = random.choice(vendors)
    transactions.append({
        "TransactionID": f"TXN-{txn_id_counter}",
        "VendorID": vendor["VendorID"],
        "Amount": me["Amount"],
        "Date": me["Date"].strftime("%Y-%m-%d %H:%M:%S"),
        "Department": me["Dept"],
        "GLAccount": "700100 - Manual Adjustments",
        "PaymentType": "Check"
    })

# E. Duplicate Payments (Same Vendor, Same Amount, Same/Close Date)
# V001 (Apex Logistics) - Duplicate payment of ₹300,000 on June 10
dup_date_1 = datetime(2026, 6, 10, 10, 30)
dup_date_2 = datetime(2026, 6, 10, 10, 32) # 2 minutes apart!
transactions.append({
    "TransactionID": "TXN-2001",
    "VendorID": "V001",
    "Amount": 300000.00,
    "Date": dup_date_1.strftime("%Y-%m-%d %H:%M:%S"),
    "Department": "Operations",
    "GLAccount": "500100 - Raw Materials",
    "PaymentType": "Wire"
})
transactions.append({
    "TransactionID": "TXN-2002",
    "VendorID": "V001",
    "Amount": 300000.00,
    "Date": dup_date_2.strftime("%Y-%m-%d %H:%M:%S"),
    "Department": "Operations",
    "GLAccount": "500100 - Raw Materials",
    "PaymentType": "Wire"
})

# V005 (Nexus Trade Corp) - Duplicate payment of ₹180,000 on June 12
transactions.append({
    "TransactionID": "TXN-2003",
    "VendorID": "V005",
    "Amount": 180000.00,
    "Date": "2026-06-12 14:00:00",
    "Department": "Operations",
    "GLAccount": "500100 - Raw Materials",
    "PaymentType": "ACH"
})
transactions.append({
    "TransactionID": "TXN-2004",
    "VendorID": "V005",
    "Amount": 180000.00,
    "Date": "2026-06-12 14:02:00",
    "Department": "Operations",
    "GLAccount": "500100 - Raw Materials",
    "PaymentType": "ACH"
})

# F. Outlier Transaction (e.g., HR department transaction of ₹9,50,000 when normal is ~₹10,000)
transactions.append({
    "TransactionID": "TXN-3001",
    "VendorID": "V003", # Global Consulting
    "Amount": 950000.00, # Statistical outlier for HR
    "Date": "2026-06-04 11:20:00",
    "Department": "Human Resources",
    "GLAccount": "600600 - Professional Fees",
    "PaymentType": "Wire"
})

with open("uploads/transactions.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["TransactionID", "VendorID", "Amount", "Date", "Department", "GLAccount", "PaymentType"])
    writer.writeheader()
    writer.writerows(transactions)

print("Generated uploads/transactions.csv")


# 4. Fact_Invoices
invoices = []
inv_id_counter = 5000

# Normal invoices
for i in range(70):
    inv_id_counter += 1
    vendor = random.choice(vendors)
    amount = round(random.uniform(1000, 95000), 2)
    dt = random_date(base_date, 17)
    status = random.choice(["Paid", "Pending", "Approved"])
    invoices.append({
        "InvoiceID": f"INV-{inv_id_counter}",
        "VendorID": vendor["VendorID"],
        "InvoiceAmount": amount,
        "InvoiceDate": dt.strftime("%Y-%m-%d"),
        "Status": status
    })

# Duplicate Invoices above ₹1 lakh (Same Vendor, Same Amount, Same Date)
# Case 1: Vendor V001 (Apex Logistics) - ₹1,50,000 on June 5
invoices.append({
    "InvoiceID": "INV-9001",
    "VendorID": "V001",
    "InvoiceAmount": 150000.00,
    "InvoiceDate": "2026-06-05",
    "Status": "Approved"
})
invoices.append({
    "InvoiceID": "INV-9002",
    "VendorID": "V001",
    "InvoiceAmount": 150000.00,
    "InvoiceDate": "2026-06-05",
    "Status": "Pending"
})

# Case 2: Vendor V003 (Global Consulting Group) - ₹2,50,000 on June 9
invoices.append({
    "InvoiceID": "INV-9003",
    "VendorID": "V003",
    "InvoiceAmount": 250000.00,
    "InvoiceDate": "2026-06-09",
    "Status": "Approved"
})
invoices.append({
    "InvoiceID": "INV-9004",
    "VendorID": "V003",
    "InvoiceAmount": 250000.00,
    "InvoiceDate": "2026-06-09",
    "Status": "Approved"
})

# Case 3: Vendor V005 (Nexus Trade Corp) - ₹1,20,000 on June 12
invoices.append({
    "InvoiceID": "INV-9005",
    "VendorID": "V005",
    "InvoiceAmount": 120000.00,
    "InvoiceDate": "2026-06-12",
    "Status": "Paid"
})
invoices.append({
    "InvoiceID": "INV-9006",
    "VendorID": "V005",
    "InvoiceAmount": 120000.00,
    "InvoiceDate": "2026-06-12",
    "Status": "Paid"
})

# Also add a duplicate below ₹1 lakh (e.g. ₹45,000) for contrast
invoices.append({
    "InvoiceID": "INV-9007",
    "VendorID": "V004",
    "InvoiceAmount": 45000.00,
    "InvoiceDate": "2026-06-03",
    "Status": "Paid"
})
invoices.append({
    "InvoiceID": "INV-9008",
    "VendorID": "V004",
    "InvoiceAmount": 45000.00,
    "InvoiceDate": "2026-06-03",
    "Status": "Paid"
})

with open("uploads/invoices.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["InvoiceID", "VendorID", "InvoiceAmount", "InvoiceDate", "Status"])
    writer.writeheader()
    writer.writerows(invoices)

print("Generated uploads/invoices.csv")
