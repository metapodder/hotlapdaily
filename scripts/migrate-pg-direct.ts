#!/usr/bin/env tsx

import { Client } from 'pg';

async function migrate() {
    console.log('🚀 Starting direct data migration using pg driver');

    const neonUrl = process.env.OLD_DATABASE_URL;
    const rdsUrl = process.env.NEW_DATABASE_URL;

    if (!neonUrl || !rdsUrl) {
        console.error('❌ Missing environment variables');
        process.exit(1);
    }

    const neon = new Client({ connectionString: neonUrl });
    const rds = new Client({ connectionString: rdsUrl });

    try {
        console.log('🔌 Connecting to Neon...');
        await neon.connect();
        console.log('✅ Connected to Neon');

        console.log('🔌 Connecting to RDS...');
        await rds.connect();
        console.log('✅ Connected to RDS');

        const tables = [
            { name: 'best_laps', columns: ['driver_name', 'best_lap', 'track_name', 'created_at', 'physics_validation_passed', 'base_speed_multiplier', 'base_turn_speed', 'frame_time_ms', 'car_scale_ratio', 'best_lap_trace', 'client_ip'] },
            { name: 'submitted_tracks', columns: ['name', 'track_code', 'created_at'] },
            { name: 'track_functions', columns: ['track_id', 'track_function', 'created_at'] },
            { name: 'wrapped', columns: ['year', 'username', 'data_json', 'created_at'] },
            { name: 'feedback', columns: ['ip', 'message', 'created_at'] }
        ];

        for (const table of tables) {
            console.log(`📦 Migrating ${table.name}...`);
            const { rows } = await neon.query(`SELECT * FROM ${table.name}`);
            console.log(`📊 Found ${rows.length} rows`);

            for (const row of rows) {
                const cols = table.columns.join(', ');
                const placeholders = table.columns.map((_, i) => `$${i + 1}`).join(', ');
                const values = table.columns.map(col => row[col]);

                await rds.query({
                    text: `INSERT INTO ${table.name} (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                    values: values
                });
            }
            console.log(`✅ Table ${table.name} migrated`);
        }

        console.log('🎉 Full migration completed successfully!');
    } catch (err) {
        console.error('💥 Migration failed:', err);
        process.exit(1);
    } finally {
        await neon.end();
        await rds.end();
    }
}

migrate().catch(console.error);
