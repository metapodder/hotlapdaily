#!/usr/bin/env tsx

import { PrismaClient as OldPrismaClient } from '@prisma/client';
import { PrismaClient as NewPrismaClient } from '@prisma/client';

// Create separate Prisma clients for old and new databases
const oldPrisma = new OldPrismaClient({
    datasources: {
        db: {
            url: process.env.OLD_DATABASE_URL,
        },
    },
});

const newPrisma = new NewPrismaClient({
    datasources: {
        db: {
            url: process.env.NEW_DATABASE_URL,
        },
    },
});

async function migrateTable(tableName: string, model: any, transformer: (record: any) => any) {
    console.log(`🔄 Starting ${tableName} migration...`);

    try {
        const totalCountResult = await oldPrisma.$queryRawUnsafe<[{ count: bigint } or { count: number }]>`
      SELECT COUNT(*) as count FROM ${tableName}
    `;
        const total = Number((totalCountResult as any)[0].count);
        console.log(`📊 Found ${total} ${tableName} records to migrate`);

        if (total === 0) {
            console.log(`✅ No ${tableName} records to migrate`);
            return;
        }

        const batchSize = 1000;
        let migrated = 0;
        let offset = 0;

        while (offset < total) {
            const batch = await oldPrisma.$queryRawUnsafe<any[]>`
        SELECT * FROM ${tableName} 
        LIMIT ${batchSize} OFFSET ${offset}
      `;

            if (batch.length === 0) break;

            const transformedBatch = batch.map(transformer);

            await model.createMany({
                data: transformedBatch,
                skipDuplicates: true,
            });

            migrated += batch.length;
            offset += batchSize;
            console.log(`✅ Migrated ${migrated}/${total} ${tableName} records`);
        }

        console.log(`🎉 Successfully migrated ${migrated} ${tableName} records`);
    } catch (error) {
        console.error(`❌ Error migrating ${tableName}:`, error);
        throw error;
    }
}

async function main() {
    console.log('🚀 Starting full database migration');

    if (!process.env.OLD_DATABASE_URL || !process.env.NEW_DATABASE_URL) {
        console.error('❌ OLD_DATABASE_URL and NEW_DATABASE_URL are required');
        process.exit(1);
    }

    try {
        await oldPrisma.$connect();
        await newPrisma.$connect();

        // 1. Best laps
        await migrateTable('best_laps', newPrisma.bestLap, (r) => ({
            driverName: r.driver_name,
            bestLap: r.best_lap,
            trackName: r.track_name,
            createdAt: r.created_at,
            physicsValidationPassed: r.physics_validation_passed,
            baseSpeedMultiplier: r.base_speed_multiplier,
            baseTurnSpeed: r.base_turn_speed,
            frameTimeMs: r.frame_time_ms,
            carScaleRatio: r.car_scale_ratio,
            bestLapTrace: r.best_lap_trace,
            clientIp: r.client_ip,
        }));

        // 2. Submitted tracks
        await migrateTable('submitted_tracks', newPrisma.submittedTrack, (r) => ({
            name: r.name,
            trackCode: r.track_code,
            createdAt: r.created_at,
        }));

        // 3. Track functions
        await migrateTable('track_functions', newPrisma.trackFunction, (r) => ({
            trackId: r.track_id,
            trackFunction: r.track_function,
            createdAt: r.created_at,
        }));

        // 4. Wrapped
        await migrateTable('wrapped', newPrisma.wrapped, (r) => ({
            year: r.year,
            username: r.username,
            dataJson: r.data_json,
            createdAt: r.created_at,
        }));

        // 5. Feedback
        await migrateTable('feedback', newPrisma.feedback, (r) => ({
            ip: r.ip,
            message: r.message,
            createdAt: r.created_at,
        }));

        console.log('🎉 Full migration completed successfully!');
    } catch (error) {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    } finally {
        await oldPrisma.$disconnect();
        await newPrisma.$disconnect();
    }
}

main().catch(console.error);
