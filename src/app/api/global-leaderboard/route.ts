import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBannedIps } from "@/lib/bannedIps";

export const runtime = "nodejs";

type LeaderboardEntry = {
  driverName: string;
  bestLap: number;
  raceId: string;
};

type LeaderboardResponse = {
  date: string;
  total: number;
  leaderboard: LeaderboardEntry[];
  startRank?: number;
  myRank?: number;
};

// GET /api/global-leaderboard?date=YYYY-MM-DD
// Optional: ?limit=50 for debugging
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    // const rawTrackId = searchParams.get("trackId");
    const rawTrackId: string = "";
    const driverNameParam = (searchParams.get("driverName") || "").trim();
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");
    const limitDefault = 10;
    const limit = limitParam
      ? Math.max(1, Math.min(1000, Number.parseInt(limitParam, 10) || limitDefault))
      : limitDefault;
    const offset = offsetParam
      ? Math.max(0, Number.parseInt(offsetParam, 10) || 0)
      : 0;

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
        id: true,
        driverName: true,
        bestLap: true,
      },
    });

    // Aggregate per driver to get best lap for each driver
    const bestByDriver = new Map<string, { driverName: string; bestLap: number; raceId: string }>();
    for (const row of allRows) {
      if (!row || row.bestLap == null) continue;
      const numericLap = Number(row.bestLap);
      if (!Number.isFinite(numericLap)) continue;
      const name = (row.driverName || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = bestByDriver.get(key);
      if (!existing || numericLap < existing.bestLap) {
        bestByDriver.set(key, { driverName: name, bestLap: numericLap, raceId: row.id });
      }
    }

    const leaderboard = Array.from(bestByDriver.values()).sort((a, b) => a.bestLap - b.bestLap);

    // If a driverName is provided, return only a window around their rank (-5, +4)
    if (driverNameParam) {
      const idx = leaderboard.findIndex(
        (r) => r.driverName.toLowerCase() === driverNameParam.toLowerCase()
      );
      if (idx >= 0) {
        let start = Math.max(0, idx - 5);
        let endExclusive = Math.min(leaderboard.length, idx + 1 + 4);
        // If in top 5, show full top 10
        if (idx <= 4) {
          start = 0;
          endExclusive = Math.min(leaderboard.length, 10);
        } else {
          // Otherwise try to show up to 10 rows centered as much as possible
          const desired = 10;
          const current = endExclusive - start;
          if (current < desired) {
            const shortage = desired - current;
            start = Math.max(0, start - shortage);
          }
        }
        const slice = leaderboard.slice(start, endExclusive);
        const response: LeaderboardResponse = {
          date: utcDay,
          total: leaderboard.length,
          leaderboard: slice.map(entry => ({
            driverName: entry.driverName,
            bestLap: entry.bestLap,
            raceId: entry.raceId
          })),
          startRank: start + 1,
          myRank: idx + 1,
        };
        return NextResponse.json(response);
      }
      // If driver is not found today, fall back to paginated list
      const fbSlice = leaderboard.slice(offset, offset + limit);
      const fallbackResponse: LeaderboardResponse = {
        date: utcDay,
        total: leaderboard.length,
        leaderboard: fbSlice.map(entry => ({
          driverName: entry.driverName,
          bestLap: entry.bestLap,
          raceId: entry.raceId
        })),
        startRank: offset + 1,
      };
      return NextResponse.json(fallbackResponse);
    }

    // No driver provided: return paginated entries
    const sliced = leaderboard.slice(offset, offset + limit);
    const defaultResponse: LeaderboardResponse = {
      date: utcDay,
      total: leaderboard.length,
      leaderboard: sliced.map(entry => ({
        driverName: entry.driverName,
        bestLap: entry.bestLap,
        raceId: entry.raceId
      })),
      startRank: offset + 1,
    };
    return NextResponse.json(defaultResponse);
  } catch {
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}


