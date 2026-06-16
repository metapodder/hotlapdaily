import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSubmittedTrack } from "@/lib/trackValidator";
import { checkDashboardAuth } from "@/lib/dashboardAuth";

export const runtime = "nodejs";

const TRACK_START_DATE = new Date("2025-05-15T00:00:00Z");
const TRACK_START_ID = 101;

function getTodaysTrackId(): number {
  const now = new Date();
  const days = Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      TRACK_START_DATE.getTime()) /
      86400000
  );
  return TRACK_START_ID + days;
}

// GET /api/track?trackId=209
// Returns the track function for the given track ID
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackIdParam = searchParams.get("trackId");

    if (!trackIdParam || !trackIdParam.trim()) {
      return NextResponse.json(
        { error: "trackId is required" },
        { status: 400 }
      );
    }

    const trackId = parseInt(trackIdParam, 10);
    if (isNaN(trackId) || trackId <= 0) {
      return NextResponse.json(
        { error: "Invalid trackId. Must be a positive integer." },
        { status: 400 }
      );
    }

    // Future tracks require admin auth
    if (trackId > getTodaysTrackId()) {
      const authErr = checkDashboardAuth(request);
      if (authErr) {
        return NextResponse.json(
          { error: "Unauthorized — future tracks require admin access" },
          { status: 401 }
        );
      }
    }

    // Fetch the track function from the database
    let trackFunction = await prisma.trackFunction.findFirst({
      where: {
        trackId: trackId,
      },
      select: {
        trackFunction: true,
        trackId: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Auto-select from submitted tracks if not found
    if (!trackFunction) {
      trackFunction = await autoSelectSubmittedTrack(trackId);
    }

    if (!trackFunction) {
      return NextResponse.json(
        { error: `Track ${trackId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        trackId: trackFunction.trackId,
        trackFunction: trackFunction.trackFunction,
        trackName: `Track ${trackFunction.trackId}`,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching track:", error);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}

/**
 * Auto-select a validated submitted track for a given trackId.
 * Uses Knuth multiplicative hash for deterministic but well-distributed selection.
 */
async function autoSelectSubmittedTrack(
  trackId: number
): Promise<{ trackId: number; trackFunction: string } | null> {
  const submittedTracks = await prisma.submittedTrack.findMany({
    select: { id: true, trackCode: true },
    orderBy: { id: "asc" },
  });

  if (submittedTracks.length === 0) return null;

  // Knuth multiplicative hash for deterministic offset
  const hash = ((trackId * 2654435761) >>> 0) % submittedTracks.length;

  // Walk candidates from the hash offset, try each until one validates
  for (let i = 0; i < submittedTracks.length; i++) {
    const idx = (hash + i) % submittedTracks.length;
    const candidate = submittedTracks[idx];
    const result = validateSubmittedTrack(candidate.trackCode);
    if (!result.valid) continue;

    // Valid track found — persist it for this trackId
    try {
      await prisma.trackFunction.create({
        data: {
          trackId: trackId,
          trackFunction: candidate.trackCode,
        },
      });
    } catch {
      // Race condition: another request already inserted for this trackId
      // Query and return the existing one
      const existing = await prisma.trackFunction.findFirst({
        where: { trackId },
        select: { trackFunction: true, trackId: true },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return existing;
    }

    return { trackId, trackFunction: candidate.trackCode };
  }

  return null;
}
