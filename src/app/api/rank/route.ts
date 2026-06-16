import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBannedIps } from "@/lib/bannedIps";

export const runtime = "nodejs";

// GET /api/rank?driverName=NAME&date=YYYY-MM-DD
// Returns { date, driverName, rank, total, bestLap } where
//  - rank is 1-based; -1 if the driver has no lap today
//  - total is number of ranked drivers today
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const driverNameParam = (searchParams.get("driverName") || "").trim();
    const dateParam = searchParams.get("date");
    // const rawTrackId = searchParams.get("trackId");
    const rawTrackId: string = "";

    if (!driverNameParam) {
      return NextResponse.json(
        { error: "Missing driverName" },
        { status: 400 }
      );
    }

    // Compute UTC day and trackId (if not provided) based on UTC schedule
    const targetDateObj = dateParam ? new Date(dateParam) : new Date();
    const utcYear = targetDateObj.getUTCFullYear();
    const utcMonth = String(targetDateObj.getUTCMonth() + 1).padStart(2, "0");
    const utcDayNum = String(targetDateObj.getUTCDate()).padStart(2, "0");
    const utcDay = `${utcYear}-${utcMonth}-${utcDayNum}`;
    const nextUtcMidnightMs = Date.UTC(targetDateObj.getUTCFullYear(), targetDateObj.getUTCMonth(), targetDateObj.getUTCDate() + 1);
    const nextUtc = new Date(nextUtcMidnightMs);
    const nextUtcDay = `${nextUtc.getUTCFullYear()}-${String(nextUtc.getUTCMonth() + 1).padStart(2, "0")}-${String(nextUtc.getUTCDate()).padStart(2, "0")}`;

    const deriveTrackIdFromUtcDate = (d: Date): number => {
      // Baseline: Track 101 on 2025-05-15 (UTC)
      const baseMs = Date.UTC(2025, 4, 15);
      const dayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const daysSince = Math.floor((dayMs - baseMs) / 86_400_000);
      return 101 + daysSince;
    };
    const effectiveTrackId = (rawTrackId && rawTrackId.trim())
      ? rawTrackId.trim()
      : String(deriveTrackIdFromUtcDate(targetDateObj));

    // Query best laps for today using Prisma
    const startDate = new Date(`${utcDay}T00:00:00Z`);
    const endDate = new Date(`${nextUtcDay}T00:00:00Z`);
    const trackName = `Track ${effectiveTrackId}`;
    const bannedIps = await getBannedIps();

    const allRows = await prisma.bestLap.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
        trackName: trackName,
        physicsValidationPassed: true,
        valid: true,
        clientIp: {
          notIn: bannedIps
        },
      },
      select: {
        driverName: true,
        bestLap: true,
      },
    });

    // Aggregate per driver to get best lap for each driver
    const bestByDriver = new Map<string, { driverName: string; bestLap: number }>();
    for (const row of allRows) {
      if (!row || row.bestLap == null) continue;
      const numericLap = Number(row.bestLap);
      if (!Number.isFinite(numericLap)) continue;
      const name = (row.driverName || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = bestByDriver.get(key);
      if (!existing || numericLap < existing.bestLap) {
        bestByDriver.set(key, { driverName: name, bestLap: numericLap });
      }
    }

    const leaderboard = Array.from(bestByDriver.values()).sort((a, b) => a.bestLap - b.bestLap);
    const total = leaderboard.length;
    const idx = leaderboard.findIndex(
      (r) => r.driverName.toLowerCase() === driverNameParam.toLowerCase()
    );
    const rank = idx >= 0 ? idx + 1 : -1;
    const bestLap = idx >= 0 ? leaderboard[idx].bestLap : null;

    return NextResponse.json({ date: utcDay, driverName: driverNameParam, rank, total, bestLap });
  } catch {
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}


