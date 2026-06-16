#!/usr/bin/env tsx

/**
 * Script to populate the TrackFunction table with data from tracks_functions.json
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function populateTracks() {
  const prisma = new PrismaClient();

  try {
    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    console.log('Connecting to database...');

    // Read the tracks_functions.json file
    const tracksFilePath = path.join(__dirname, 'tracks_functions.json');

    if (!fs.existsSync(tracksFilePath)) {
      throw new Error(`File not found: ${tracksFilePath}`);
    }

    console.log('Reading tracks data...');
    const tracksData = JSON.parse(fs.readFileSync(tracksFilePath, 'utf-8'));

    // Convert the object to an array of track entries
    const trackEntries = Object.entries(tracksData).map(([trackId, trackFunction]) => ({
      trackId: parseInt(trackId, 10),
      trackFunction: trackFunction as string,
    }));

    console.log(`Found ${trackEntries.length} tracks to insert`);

    // Insert tracks in batches to avoid overwhelming the database
    const batchSize = 10;
    let insertedCount = 0;

    for (let i = 0; i < trackEntries.length; i += batchSize) {
      const batch = trackEntries.slice(i, i + batchSize);

      console.log(`Inserting batch ${Math.floor(i / batchSize) + 1} (${batch.length} tracks)...`);

      await prisma.trackFunction.createMany({
        data: batch,
        skipDuplicates: true, // Skip if track_id already exists
      });

      insertedCount += batch.length;
    }

    console.log(`✅ Successfully inserted ${insertedCount} tracks into the database`);

    // Verify the insertion
    const totalCount = await prisma.trackFunction.count();
    console.log(`📊 Total tracks in database: ${totalCount}`);

  } catch (error) {
    console.error('❌ Error populating tracks:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
populateTracks()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
