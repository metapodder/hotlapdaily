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

interface BestLapRecord {
  id: string;
  driver_name: string;
  best_lap: number;
  track_name: string | null;
  created_at: Date;
  physics_validation_passed: boolean;
  base_speed_multiplier: number | null;
  base_turn_speed: number | null;
  frame_time_ms: number | null;
  car_scale_ratio: number | null;
  best_lap_trace: any | null;
}

interface SubmittedTrackRecord {
  id: number;
  name: string;
  track_code: string;
  created_at: Date;
}

async function migrateBestLaps() {
  console.log('🔄 Starting best_laps migration...');
  
  try {
    // Get total count for progress tracking
    const totalCount = await oldPrisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM best_laps
    `;
    const total = Number(totalCount[0].count);
    console.log(`📊 Found ${total} best_laps records to migrate`);

    if (total === 0) {
      console.log('✅ No best_laps records to migrate');
      return;
    }

    // Check if new database already has data
    const existingCount = await newPrisma.bestLap.count();
    if (existingCount > 0) {
      console.log(`⚠️  Warning: New database already has ${existingCount} best_laps records`);
      console.log('   This script will add new records with new IDs (no duplicates expected)');
    }

    // Migrate in batches to avoid memory issues
    const batchSize = 10000;
    let migrated = 0;
    let offset = 0;

    while (offset < total) {
      console.log(`📦 Processing batch ${Math.floor(offset / batchSize) + 1} (${offset + 1}-${Math.min(offset + batchSize, total)})`);
      
      // Fetch batch from old database using raw SQL to get all fields
      const batch = await oldPrisma.$queryRaw<BestLapRecord[]>`
        SELECT 
          id,
          driver_name,
          best_lap,
          track_name,
          created_at,
          physics_validation_passed,
          base_speed_multiplier,
          base_turn_speed,
          frame_time_ms,
          car_scale_ratio,
          best_lap_trace
        FROM best_laps 
        ORDER BY created_at 
        LIMIT ${batchSize} OFFSET ${offset}
      `;

      if (batch.length === 0) break;

      // Transform and insert into new database (let Prisma generate new IDs)
      const transformedBatch = batch.map(record => ({
        // Don't include id - let Prisma generate new UUIDs
        driverName: record.driver_name,
        bestLap: record.best_lap,
        trackName: record.track_name,
        createdAt: record.created_at,
        physicsValidationPassed: record.physics_validation_passed,
        baseSpeedMultiplier: record.base_speed_multiplier,
        baseTurnSpeed: record.base_turn_speed,
        frameTimeMs: record.frame_time_ms,
        carScaleRatio: record.car_scale_ratio,
        bestLapTrace: record.best_lap_trace,
      }));

      // Insert batch into new database
      await newPrisma.bestLap.createMany({
        data: transformedBatch,
        skipDuplicates: true, // Skip records that already exist
      });

      migrated += batch.length;
      offset += batchSize;
      
      console.log(`✅ Migrated ${migrated}/${total} best_laps records`);
    }

    console.log(`🎉 Successfully migrated ${migrated} best_laps records`);
  } catch (error) {
    console.error('❌ Error migrating best_laps:', error);
    throw error;
  }
}

async function migrateSubmittedTracks() {
  console.log('🔄 Starting submitted_tracks migration...');
  
  try {
    // Get total count for progress tracking
    const totalCount = await oldPrisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM submitted_tracks
    `;
    const total = Number(totalCount[0].count);
    console.log(`📊 Found ${total} submitted_tracks records to migrate`);

    if (total === 0) {
      console.log('✅ No submitted_tracks records to migrate');
      return;
    }

    // Check if new database already has data
    const existingCount = await newPrisma.submittedTrack.count();
    if (existingCount > 0) {
      console.log(`⚠️  Warning: New database already has ${existingCount} submitted_tracks records`);
      console.log('   This script will add new records with new IDs (no duplicates expected)');
    }

    // Migrate in batches
    const batchSize = 1000;
    let migrated = 0;
    let offset = 0;

    while (offset < total) {
      console.log(`📦 Processing batch ${Math.floor(offset / batchSize) + 1} (${offset + 1}-${Math.min(offset + batchSize, total)})`);
      
      // Fetch batch from old database
      const batch = await oldPrisma.$queryRaw<SubmittedTrackRecord[]>`
        SELECT 
          id,
          name,
          track_code,
          created_at
        FROM submitted_tracks 
        ORDER BY created_at 
        LIMIT ${batchSize} OFFSET ${offset}
      `;

      if (batch.length === 0) break;

      // Transform and insert into new database (let Prisma generate new IDs)
      const transformedBatch = batch.map(record => ({
        // Don't include id - let Prisma generate new auto-increment IDs
        name: record.name,
        trackCode: record.track_code,
        createdAt: record.created_at,
      }));

      // Insert batch into new database
      await newPrisma.submittedTrack.createMany({
        data: transformedBatch,
        skipDuplicates: true, // Skip records that already exist
      });

      migrated += batch.length;
      offset += batchSize;
      
      console.log(`✅ Migrated ${migrated}/${total} submitted_tracks records`);
    }

    console.log(`🎉 Successfully migrated ${migrated} submitted_tracks records`);
  } catch (error) {
    console.error('❌ Error migrating submitted_tracks:', error);
    throw error;
  }
}

async function verifyMigration() {
  console.log('🔍 Verifying migration...');
  
  try {
    // Count records in both databases
    const [oldBestLaps, newBestLaps, oldTracks, newTracks] = await Promise.all([
      oldPrisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM best_laps`,
      newPrisma.bestLap.count(),
      oldPrisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM submitted_tracks`,
      newPrisma.submittedTrack.count(),
    ]);

    const oldBestLapsCount = Number(oldBestLaps[0].count);
    const oldTracksCount = Number(oldTracks[0].count);

    console.log('📊 Migration Summary:');
    console.log(`   best_laps: ${oldBestLapsCount} → ${newBestLaps}`);
    console.log(`   submitted_tracks: ${oldTracksCount} → ${newTracks}`);

    if (oldBestLapsCount === newBestLaps && oldTracksCount === newTracks) {
      console.log('✅ Migration verification successful! All records migrated.');
    } else {
      console.log('⚠️  Migration verification shows some records may be missing.');
    }
  } catch (error) {
    console.error('❌ Error during verification:', error);
  }
}

async function main() {
  console.log('🚀 Starting database migration from OLD_DATABASE_URL to NEW_DATABASE_URL');
  console.log('=' .repeat(60));

  // Validate environment variables
  if (!process.env.OLD_DATABASE_URL) {
    console.error('❌ OLD_DATABASE_URL environment variable is required');
    process.exit(1);
  }

  if (!process.env.NEW_DATABASE_URL) {
    console.error('❌ NEW_DATABASE_URL environment variable is required');
    process.exit(1);
  }

  try {
    // Test connections
    console.log('🔌 Testing database connections...');
    await oldPrisma.$connect();
    console.log('✅ Connected to old database');
    
    await newPrisma.$connect();
    console.log('✅ Connected to new database');

    // Run migrations
    await migrateBestLaps();
    console.log('');
    await migrateSubmittedTracks();
    console.log('');
    await verifyMigration();

    console.log('');
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    // Close connections
    await oldPrisma.$disconnect();
    await newPrisma.$disconnect();
    console.log('🔌 Database connections closed');
  }
}

// Run the migration
main().catch(console.error);
