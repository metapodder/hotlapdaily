
import psycopg2
from psycopg2 import extras
import os
import json
import time
from multiprocessing import Process

def migrate_chunk(neon_url, rds_url, table_info, start_date=None, end_date=None):
    t_name = table_info["name"]
    cols = table_info["columns"]
    worker_id = f"{start_date or 'START'} to {end_date or 'END'}"

    try:
        neon_conn = psycopg2.connect(neon_url)
        # Using server-side cursor for the specific date range
        # Note: server-side cursors in Postgres don't work well across multiprocessing if we share the same connection object
        # but here each process has its own connection.
        cursor_name = f'worker_{abs(hash(worker_id))}'
        neon_cur = neon_conn.cursor(name=cursor_name, cursor_factory=extras.RealDictCursor)
        
        rds_conn = psycopg2.connect(rds_url)
        rds_cur = rds_conn.cursor()

        query = f"SELECT {', '.join(cols)} FROM {t_name}"
        params = []
        if start_date and end_date:
            query += " WHERE created_at >= %s AND created_at < %s"
            params = [start_date, end_date]
        elif start_date:
            query += " WHERE created_at >= %s"
            params = [start_date]
        elif end_date:
            query += " WHERE created_at < %s"
            params = [end_date]

        neon_cur.itersize = 2000
        neon_cur.execute(query, params)
        
        migrated_count = 0
        while True:
            rows = neon_cur.fetchmany(2000)
            if not rows:
                break

            transformed_data = []
            for row in rows:
                values = []
                for col in cols:
                    val = row[col]
                    if col in ["best_lap_trace", "data_json"] and val is not None:
                        values.append(json.dumps(val))
                    else:
                        values.append(val)
                transformed_data.append(tuple(values))

            col_names = ", ".join(cols)
            insert_query = f"INSERT INTO {t_name} ({col_names}) VALUES %s ON CONFLICT DO NOTHING"
            extras.execute_values(rds_cur, insert_query, transformed_data, page_size=2000)
            
            rds_conn.commit()
            migrated_count += len(rows)
            # print(f"[{worker_id}] Progress: {migrated_count} rows...")

        print(f"✅ [{worker_id}] migration complete ({migrated_count} rows).")

    except Exception as e:
        print(f"💥 Chunk {worker_id} failed: {e}")
    finally:
        if 'neon_conn' in locals(): neon_conn.close()
        if 'rds_conn' in locals(): rds_conn.close()

def migrate_all():
    neon_url = os.environ.get('OLD_DATABASE_URL')
    rds_url = os.environ.get('NEW_DATABASE_URL')

    if not neon_url or not rds_url:
        print("❌ Error: Missing env variables.")
        return

    # 1. First, migrate small tables sequentially
    small_tables = [
        { "name": "submitted_tracks", "columns": ["name", "track_code", "created_at"] },
        { "name": "track_functions", "columns": ["track_id", "track_function", "created_at"] },
        { "name": "wrapped", "columns": ["year", "username", "data_json", "created_at"] },
        { "name": "feedback", "columns": ["ip", "message", "created_at"] }
    ]
    for table in small_tables:
        migrate_chunk(neon_url, rds_url, table)

    # 2. Parallelize best_laps using date chunks
    best_laps_info = {
        "name": "best_laps",
        "columns": ["driver_name", "best_lap", "track_name", "created_at", "physics_validation_passed", "base_speed_multiplier", "base_turn_speed", "frame_time_ms", "car_scale_ratio", "best_lap_trace", "client_ip"]
    }
    
    # Using the dates we fetched + some estimates for 8 chunks
    # August 24, 2025 to March 9, 2026
    chunks = [
        (None, "2025-09-23"),
        ("2025-09-23", "2025-10-10"),
        ("2025-10-10", "2025-10-20"),
        ("2025-10-20", "2025-11-01"),
        ("2025-11-01", "2025-11-15"),
        ("2025-11-15", "2025-12-01"),
        ("2025-12-01", "2025-12-07"),
        ("2025-12-07", "2026-01-01"),
        ("2026-01-01", "2026-01-15"),
        ("2026-01-15", "2026-02-01"),
        ("2026-02-01", "2026-02-15"),
        ("2026-02-15", "2026-03-01"),
        ("2026-03-01", None)
    ]

    print(f"🚀 Starting parallel migration for best_laps ({len(chunks)} workers)...")
    processes = []
    for start, end in chunks:
        p = Process(target=migrate_chunk, args=(neon_url, rds_url, best_laps_info, start, end))
        p.start()
        processes.append(p)

    for p in processes:
        p.join()

    print("\n🎉 ALL migration workers completed!")

if __name__ == "__main__":
    migrate_all()
