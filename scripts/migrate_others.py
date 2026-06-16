
import psycopg2
from psycopg2 import extras
import os
import json
import time

def migrate_others():
    neon_url = os.environ.get('OLD_DATABASE_URL')
    rds_url = os.environ.get('NEW_DATABASE_URL')

    if not neon_url or not rds_url:
        print("❌ Error: OLD_DATABASE_URL and NEW_DATABASE_URL must be set.")
        return

    try:
        print("🔌 Connecting to Neon and RDS...")
        neon_conn = psycopg2.connect(neon_url)
        neon_cur = neon_conn.cursor(cursor_factory=extras.RealDictCursor)
        rds_conn = psycopg2.connect(rds_url)
        rds_cur = rds_conn.cursor()
        print("✅ Connections established.")

        tables = [
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
            
            # Truncate first to ensure clean state
            rds_cur.execute(f"TRUNCATE {t_name}")
            
            neon_cur.execute(f"SELECT {', '.join(cols)} FROM {t_name}")
            rows = neon_cur.fetchall()
            
            if not rows:
                print(f"   Table {t_name} is empty.")
                continue

            transformed_data = []
            for row in rows:
                values = []
                for col in cols:
                    val = row[col]
                    if col in ["data_json"] and val is not None:
                        values.append(json.dumps(val))
                    else:
                        values.append(val)
                transformed_data.append(tuple(values))

            col_names = ", ".join(cols)
            insert_query = f"INSERT INTO {t_name} ({col_names}) VALUES %s"
            extras.execute_values(rds_cur, insert_query, transformed_data)
            rds_conn.commit()
            print(f"✅ Table {t_name} migration complete ({len(rows)} rows)!")

        print("\n🎉 Final tables migration completed successfully!")

    except Exception as e:
        print(f"\n💥 Migration failed: {e}")
        if 'rds_conn' in locals(): rds_conn.rollback()
    finally:
        if 'neon_conn' in locals(): neon_conn.close()
        if 'rds_conn' in locals(): rds_conn.close()

if __name__ == "__main__":
    migrate_others()
