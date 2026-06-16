
import psycopg2
from psycopg2 import extras
import os
import json
import time

def migrate():
    neon_url = os.environ.get('OLD_DATABASE_URL')
    rds_url = os.environ.get('NEW_DATABASE_URL')

    if not neon_url or not rds_url:
        print("❌ Error: OLD_DATABASE_URL and NEW_DATABASE_URL must be set.")
        return

    try:
        print("🔌 Connecting to AWS RDS to prepare...")
        rds_conn = psycopg2.connect(rds_url, connect_timeout=10)
        rds_cur = rds_conn.cursor()
        
        # 1. Drop indices for speed (will rebuild later)
        print("📉 Dropping indices for faster import...")
        indices = ["best_laps_created_at_idx", "best_laps_driver_name_idx", "best_laps_client_ip_idx"]
        for idx in indices:
            try:
                rds_cur.execute(f"DROP INDEX IF EXISTS {idx}")
                print(f"   Dropped {idx}")
            except: pass
        
        # 2. Truncate table
        print("🧹 Truncating best_laps...")
        rds_cur.execute("TRUNCATE best_laps")
        rds_conn.commit()
        print("✅ RDS Prepared.")

        print("🔌 Connecting to Neon...")
        neon_conn = psycopg2.connect(neon_url)
        neon_cur = neon_conn.cursor(name='neon_migration_cursor', cursor_factory=extras.RealDictCursor)
        print("✅ Connected to Neon")

        # 3. Migrate best_laps (The large one)
        table_name = "best_laps"
        cols = ["driver_name", "best_lap", "track_name", "created_at", "physics_validation_passed", "base_speed_multiplier", "base_turn_speed", "frame_time_ms", "car_scale_ratio", "best_lap_trace", "client_ip"]
        
        print(f"\n🚀 Migrating {table_name}...")
        neon_cur.itersize = 5000
        neon_cur.execute(f"SELECT {', '.join(cols)} FROM {table_name}")
        
        migrated_count = 0
        total_start = time.time()
        
        while True:
            rows = neon_cur.fetchmany(5000)
            if not rows: break
            
            transformed_data = []
            for row in rows:
                values = []
                for col in cols:
                    val = row[col]
                    if col in ["best_lap_trace"] and val is not None:
                        values.append(json.dumps(val))
                    else:
                        values.append(val)
                transformed_data.append(tuple(values))
            
            col_names = ", ".join(cols)
            insert_query = f"INSERT INTO {table_name} ({col_names}) VALUES %s"
            extras.execute_values(rds_cur, insert_query, transformed_data, page_size=5000)
            rds_conn.commit()
            
            migrated_count += len(rows)
            elapsed = time.time() - total_start
            rate = migrated_count / elapsed if elapsed > 0 else 0
            print(f"   Progress: {migrated_count} rows ({rate:.1f} rows/s)...", end="\r", flush=True)

        print(f"\n✅ {table_name} migration complete!")

        # 4. Final step: Rebuild indices
        print("\n📈 Rebuilding indices (this may take a few minutes)...")
        rds_cur.execute("CREATE INDEX best_laps_created_at_idx ON best_laps (created_at)")
        rds_cur.execute("CREATE INDEX best_laps_driver_name_idx ON best_laps (driver_name)")
        rds_cur.execute("CREATE INDEX best_laps_client_ip_idx ON best_laps (client_ip)")
        rds_conn.commit()
        print("✅ All indices rebuilt!")

    except Exception as e:
        print(f"\n💥 Migration failed: {e}")
        if 'rds_conn' in locals(): rds_conn.rollback()
    finally:
        if 'neon_conn' in locals(): neon_conn.close()
        if 'rds_conn' in locals(): rds_conn.close()

if __name__ == "__main__":
    migrate()
