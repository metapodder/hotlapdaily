#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getBestLapIPs() {
  try {
    console.log('🔍 Fetching best lap submissions with IP addresses...\n');

    // Query all best lap records that have client IPs
    const bestLaps = await prisma.bestLap.findMany({
      where: {
        clientIp: {
          not: null
        }
      },
      select: {
        id: true,
        driverName: true,
        bestLap: true,
        trackName: true,
        createdAt: true,
        clientIp: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (bestLaps.length === 0) {
      console.log('❌ No best lap submissions found with IP data.');
      return;
    }

    console.log(`📊 Found ${bestLaps.length} best lap submissions with IP data:\n`);

    // Group by IP for analysis
    const ipGroups = new Map<string, {
      count: number;
      submissions: Array<{
        driverName: string;
        bestLap: number;
        trackName: string | null;
        createdAt: Date;
        clientIp: string;
      }>;
    }>();

    bestLaps.forEach(lap => {
      if (!lap.clientIp) return;

      if (!ipGroups.has(lap.clientIp)) {
        ipGroups.set(lap.clientIp, { count: 0, submissions: [] });
      }

      const group = ipGroups.get(lap.clientIp)!;
      group.count++;
      group.submissions.push({
        driverName: lap.driverName,
        bestLap: Number(lap.bestLap),
        trackName: lap.trackName,
        createdAt: lap.createdAt,
        clientIp: lap.clientIp,
      });
    });

    // Display results grouped by IP
    console.log('🌐 IP Address Analysis:\n');
    console.log('=' .repeat(80));

    for (const [ip, data] of Array.from(ipGroups.entries())) {
      console.log(`\n📍 IP: ${ip}`);
      console.log(`   Submissions: ${data.count}`);
      console.log(`   Drivers: ${new Set(data.submissions.map(s => s.driverName)).size}`);
      console.log(`   Tracks: ${new Set(data.submissions.map(s => s.trackName).filter(Boolean)).size}`);
      
      // Show recent submissions from this IP
      const recentSubmissions = data.submissions
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5);

      console.log(`\n   Recent submissions:`);
      recentSubmissions.forEach((sub, index) => {
        console.log(`   ${index + 1}. ${sub.driverName} - ${sub.bestLap}s (${sub.trackName}) - ${sub.createdAt.toISOString()}`);
      });

      if (data.submissions.length > 5) {
        console.log(`   ... and ${data.submissions.length - 5} more`);
      }

      console.log('-'.repeat(60));
    }

    // Summary statistics
    console.log('\n📈 Summary Statistics:');
    console.log(`Total unique IPs: ${ipGroups.size}`);
    console.log(`Total submissions: ${bestLaps.length}`);
    console.log(`Average submissions per IP: ${(bestLaps.length / ipGroups.size).toFixed(2)}`);

    // Top IPs by submission count
    const topIPs = Array.from(ipGroups.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    console.log('\n🏆 Top 10 IPs by submission count:');
    topIPs.forEach(([ip, data], index) => {
      console.log(`${index + 1}. ${ip} - ${data.count} submissions`);
    });

  } catch (error) {
    console.error('❌ Error fetching best lap IPs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
getBestLapIPs();
