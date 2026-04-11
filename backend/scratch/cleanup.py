import sqlite3
conn = sqlite3.connect('fuelverify.db')
c = conn.cursor()
c.execute("DELETE FROM records WHERE id LIKE 'test_%'")
print(f"Deleted {c.rowcount} records")
c.execute("DELETE FROM slip_blobs WHERE id LIKE 'test_%'")
print(f"Deleted {c.rowcount} blobs")
conn.commit()
conn.close()
