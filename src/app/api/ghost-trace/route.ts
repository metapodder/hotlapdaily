import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Helper function to calculate today's track ID using the same logic as the rest of the app
function getTodaysTrackId(): string {
  const today = new Date();
  const baseMs = Date.UTC(2025, 4, 15); // 2025-05-15
  const dayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysSince = Math.floor((dayMs - baseMs) / 86_400_000);
  return String(101 + daysSince);
}

// GET /api/ghost-trace?id=<uuid>
// Returns the best_lap_trace for the given race ID
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const raceId = searchParams.get("id");

    if (!raceId || !raceId.trim()) {
      return NextResponse.json({ error: "Race ID is required" }, { status: 400 });
    }

    // Fetch the best_lap_trace, track_name, and driver_name for the given race ID using Prisma
    const traceData = await prisma.bestLap.findUnique({
      where: {
        id: raceId,
      },
      select: {
        bestLapTrace: true,
        trackName: true,
        driverName: true,
      },
    });

    if (!traceData) {
      return NextResponse.json({ error: "Race trace not found" }, { status: 404 });
    }

    if (!traceData.bestLapTrace) {
      return NextResponse.json({ error: "No trace data available for this race" }, { status: 404 });
    }

    // Check if the race matches the expected track.
    // If a trackId is provided (e.g. from historical leaderboard), validate against that.
    // Otherwise validate against today's track.
    const requestedTrackId = searchParams.get("trackId");
    const expectedTrackId = requestedTrackId || getTodaysTrackId();
    const expectedTrackName = `Track ${expectedTrackId}`;
    const raceTrackName = traceData.trackName;

    if (raceTrackName && raceTrackName !== expectedTrackName) {
      return NextResponse.json({
        error: `This ghost car is from ${raceTrackName}, but the current track is ${expectedTrackName}.`
      }, { status: 400 });
    }

    return NextResponse.json({
      trace: traceData.bestLapTrace,
      trackName: traceData.trackName,
      driverName: traceData.driverName
    });
  } catch (error) {
    console.error("Error fetching ghost trace:", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
