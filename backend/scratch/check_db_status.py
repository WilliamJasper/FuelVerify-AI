import sqlite3
import os

DB_PATH = r"c:\Users\Asus\Downloads\เอกสหกรุ๊ป\FuelVerify-AI\backend\fuelverify.db"

def check_db():
    if not os.path.exists(DB_PATH):
        print(f"Error: DB not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Check Columns
    print("--- Table Info: records ---")
    c.execute("PRAGMA table_info(records)")
    for info in c.fetchall():
        print(info)
        
    # Check Hidden Count
    print("\n--- Stats ---")
    c.execute("SELECT COUNT(*) FROM records WHERE hidden = 1")
    hidden_count = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM records WHERE hidden = 0")
    visible_count = c.fetchone()[0]
    print(f"Hidden records: {hidden_count}")
    print(f"Visible records: {visible_count}")
    
    # Check all records
    print("\n--- All Records ---")
    c.execute("SELECT id, name, hidden FROM records")
    for r in c.fetchall():
        print(f"ID: '{r[0]}' | Name: '{r[1]}' | Hidden: {r[2]}")
        
    conn.close()

if __name__ == "__main__":
    check_db()
