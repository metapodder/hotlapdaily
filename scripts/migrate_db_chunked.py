
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
        print("🔌 Connecting to Neon...")
        neon_conn = psycopg2.connect(neon_url)
        # Using a named cursor for server-side processing
        neon_cur = neon_conn.cursor(name='neon_migration_cursor', cursor_factory=extras.RealDictCursor)
        print("✅ Connected to Neon (Server-side cursor initialized)")

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
            
            print(f"\n📦 Migrating table: {t_name}...")
            
            # Fetch from Neon in chunks
            neon_cur.itersize = 2000 # Fetch 2000 rows at a time from server
            neon_cur.execute(f"SELECT {', '.join(cols)} FROM {t_name}")
            
            migrated_count = 0
            while True:
                rows = neon_cur.fetchmany(2000)
                if not rows:
                    break

                # Transform rows for batch insertion
                transformed_data = []
                for row in rows:
                    values = []
                    for col in cols:
                        val = row[col]
                        # Handle JSON fields
                        if col in ["best_lap_trace", "data_json"] and val is not None:
                            values.append(json.dumps(val))
                        else:
                            values.append(val)
                    transformed_data.append(tuple(values))

                # Prepare batch insert query
                col_names = ", ".join(cols)
                insert_query = f"INSERT INTO {t_name} ({col_names}) VALUES %s ON CONFLICT DO NOTHING"

                # Execute batch insert
                extras.execute_values(rds_cur, insert_query, transformed_data, page_size=2000)
                
                rds_conn.commit()
                migrated_count += len(rows)
                print(f"   Progress: {migrated_count} rows migrated...", end="\r")

            print(f"✅ Table {t_name} migration complete!")

        print("\n🎉 Full migration completed successfully!")

    except Exception as e:
        print(f"\n💥 Migration failed: {e}")
        if 'rds_conn' in locals():
            rds_conn.rollback()
    finally:
        if 'neon_conn' in locals():
            neon_conn.close()
        if 'rds_conn' in locals():
            rds_conn.close()

if __name__ == "__main__":
    migrate()
