
import psycopg2
import os

def repair():
    rds_url = os.environ.get('NEW_DATABASE_URL')
    neon_url = os.environ.get('OLD_DATABASE_URL')

    if not rds_url or not neon_url:
        print("❌ Error: NEW_DATABASE_URL and OLD_DATABASE_URL must be set.")
        return

    try:
        print("🔌 Connecting to AWS RDS...")
        rds_conn = psycopg2.connect(rds_url)
        rds_cur = rds_conn.cursor()
        print("✅ Connected to AWS RDS")

        # 1. Deduplicate best_laps using Fast Table Swap
        print("\n🚀 Starting fast deduplication of best_laps...")
        
        # We use DISTINCT ON to get exactly one row per duplicate set.
        # We order by id to ensure we keep the same row if possible.
        rds_cur.execute("""
            BEGIN;
            -- Create a new table with unique rows
            CREATE TABLE best_laps_new AS 
            SELECT DISTINCT ON (driver_name, best_lap, created_at) * 
            FROM best_laps 
            ORDER BY driver_name, best_lap, created_at, id;
            
            -- Drop the old table
            DROP TABLE best_laps;
            
            -- Rename the new table
            ALTER TABLE best_laps_new RENAME TO best_laps;
            
            -- Re-apply constraints and indexes (Prisma defaults)
            ALTER TABLE best_laps ADD PRIMARY KEY (id);
            CREATE INDEX best_laps_created_at_idx ON best_laps (created_at);
            CREATE INDEX best_laps_driver_name_idx ON best_laps (driver_name);
            CREATE INDEX best_laps_client_ip_idx ON best_laps (client_ip);
            
            COMMIT;
        """)
        print("✅ best_laps deduplicated and indexed.")

        # 2. Fix submitted_tracks (Missing 1 row)
        print("\n🔎 Investigating missing row in submitted_tracks...")
        
        neon_conn = psycopg2.connect(neon_url)
        neon_cur = neon_conn.cursor()
        
        neon_cur.execute("SELECT id, name, track_code, created_at FROM submitted_tracks")
        neon_rows = neon_cur.fetchall()
        
        rds_cur.execute("SELECT id FROM submitted_tracks")
        rds_ids = {row[0] for row in rds_cur.fetchall()}
        
        missing_rows = []
        for row in neon_rows:
            if row[0] not in rds_ids:
                missing_rows.append(row)
        
        if missing_rows:
            print(f"📦 Found {len(missing_rows)} missing rows in submitted_tracks. Inserting...")
            for row in missing_rows:
                rds_cur.execute(
                    "INSERT INTO submitted_tracks (id, name, track_code, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    row
                )
            rds_conn.commit()
            print("✅ submitted_tracks repaired.")
        else:
            print("✅ No missing rows found in submitted_tracks (id check passed).")

        # 3. Final Verification
        print("\n📊 Final Verification:")
        tables = ['best_laps', 'submitted_tracks', 'track_functions', 'wrapped', 'feedback']
        for t in tables:
            rds_cur.execute(f"SELECT COUNT(*) FROM {t}")
            rds_count = rds_cur.fetchone()[0]
            
            neon_cur.execute(f"SELECT COUNT(*) FROM {t}")
            neon_count = neon_cur.fetchone()[0]
            
            status = "✅ MATCH" if rds_count == neon_count else f"❌ MISMATCH (Neon: {neon_count}, RDS: {rds_count})"
            print(f"  {t:18}: {rds_count:7} | {status}")

    except Exception as e:
        print(f"💥 Repair failed: {e}")
        if 'rds_conn' in locals():
            rds_conn.rollback()
    finally:
        if 'rds_conn' in locals(): rds_conn.close()
        if 'neon_conn' in locals(): neon_conn.close()

if __name__ == "__main__":
    repair()
