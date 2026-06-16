
import psycopg2
from psycopg2 import extras
import os
import json

def migrate():
    neon_url = os.environ.get('OLD_DATABASE_URL')
    rds_url = os.environ.get('NEW_DATABASE_URL')

    if not neon_url or not rds_url:
        print("❌ Error: OLD_DATABASE_URL and NEW_DATABASE_URL must be set.")
        return

    try:
        print("🔌 Connecting to Neon...")
        neon_conn = psycopg2.connect(neon_url)
        neon_cur = neon_conn.cursor(cursor_factory=extras.RealDictCursor)
        print("✅ Connected to Neon")

        print("🔌 Connecting to AWS RDS...")
        rds_conn = psycopg2.connect(rds_url)
        rds_cur = rds_conn.cursor()
        print("✅ Connected to AWS RDS")

        tables = [
            {
                "name": "best_laps",
                "columns": ["driver_name", "best_lap", "track_name", "created_at", "physics_validation_passed", "base_speed_multiplier", "base_turn_speed", "frame_time_ms", "car_scale_ratio", "best_lap_trace", "client_ip"]
            },
            {
                "name": "submitted_tracks",
                "columns": ["name", "track_code", "created_at"]
            },
            {
                "name": "track_functions",
                "columns": ["track_id", "track_function", "created_at"]
            },
            {
                "name": "wrapped",
                "columns": ["year", "username", "data_json", "created_at"]
            },
            {
                "name": "feedback",
                "columns": ["ip", "message", "created_at"]
            }
        ]

        for table in tables:
            t_name = table["name"]
            cols = table["columns"]
            
            print(f"📦 Migrating table: {t_name}...")
            
            # Fetch from Neon
            neon_cur.execute(f"SELECT {', '.join(cols)} FROM {t_name}")
            rows = neon_cur.fetchall()
            print(f"📊 Found {len(rows)} rows to migrate.")

            if not rows:
                print(f"✅ Skipping {t_name} (empty)")
                continue

            # Prepare insert query
            placeholders = ", ".join(["%s"] * len(cols))
            insert_query = f"INSERT INTO {t_name} ({', '.join(cols)}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"

            # Migrate in batches or one by one
            migrated_count = 0
            for row in rows:
                values = []
                for col in cols:
                    val = row[col]
                    # Handle JSON fields
                    if col in ["best_lap_trace", "data_json"] and val is not None:
                        values.append(json.dumps(val))
                    else:
                        values.append(val)
                
                rds_cur.execute(insert_query, tuple(values))
                migrated_count += 1
                if migrated_count % 100 == 0:
                    print(f"   Progress: {migrated_count}/{len(rows)}")

            rds_conn.commit()
            print(f"✅ Table {t_name} migrated successfully ({migrated_count} rows).")

        print("\n🎉 All data migrated successfully!")

    except Exception as e:
        print(f"💥 Migration failed: {e}")
        if 'rds_conn' in locals():
            rds_conn.rollback()
    finally:
        if 'neon_conn' in locals():
            neon_conn.close()
        if 'rds_conn' in locals():
            rds_conn.close()

if __name__ == "__main__":
    migrate()
