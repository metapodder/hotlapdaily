#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getRawIPs() {
  try {
    // Query all best lap records that have client IPs
    const bestLaps = await prisma.bestLap.findMany({
      where: {
        clientIp: {
          not: null
        }
      },
      select: {
        clientIp: true,
      }
    });

    const ips = new Set<string>();
    
    bestLaps.forEach(lap => {
      if (lap.clientIp) {
        ips.add(lap.clientIp);
      }
    });

    console.log('Raw IP addresses from best_lap submissions:');
    console.log('=' .repeat(50));
    
    for (const ip of Array.from(ips)) {
      console.log(ip);
    }
    
    console.log(`\nTotal unique IPs: ${ips.size}`);

  } catch (error) {
    console.error('Error fetching IPs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

getRawIPs();
