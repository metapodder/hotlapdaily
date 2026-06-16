import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/track-leaderboard?trackId=298&limit=5
// Returns top N best laps for a specific track (all time, not date-filtered)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackId = searchParams.get("trackId");
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") || "5", 10) || 5),
      20
    );

    if (!trackId) {
      return NextResponse.json({ error: "trackId required" }, { status: 400 });
    }

    const trackName = `Track ${trackId}`;

    const rows = await prisma.bestLap.findMany({
      where: {
        trackName,
        physicsValidationPassed: true,
        valid: true,
      },
      select: {
        driverName: true,
        bestLap: true,
      },
      orderBy: { bestLap: "asc" },
    });

    // Deduplicate: best per driver
    const bestByDriver = new Map<
      string,
      { driverName: string; bestLap: number }
    >();
    for (const row of rows) {
      const lap = Number(row.bestLap);
      if (!Number.isFinite(lap)) continue;
      const name = (row.driverName || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = bestByDriver.get(key);
      if (!existing || lap < existing.bestLap) {
        bestByDriver.set(key, { driverName: name, bestLap: lap });
      }
    }

    const leaderboard = Array.from(bestByDriver.values())
      .sort((a, b) => a.bestLap - b.bestLap)
      .slice(0, limit);

    return NextResponse.json({
      trackId,
      trackName,
      total: bestByDriver.size,
      leaderboard,
    });
  } catch {
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
