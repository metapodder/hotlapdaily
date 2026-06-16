import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkDashboardAuth } from "@/lib/dashboardAuth";

export const runtime = "nodejs";

const TRACK_START_DATE = new Date("2025-05-15T00:00:00Z");
const TRACK_START_ID = 101;

function trackIdToDate(trackId: number): string {
  const days = trackId - TRACK_START_ID;
  const date = new Date(TRACK_START_DATE.getTime() + days * 86400000);
  return date.toISOString().split("T")[0];
}

function dateToTrackId(dateStr: string): number {
  const date = new Date(dateStr + "T00:00:00Z");
  const days = Math.floor(
    (date.getTime() - TRACK_START_DATE.getTime()) / 86400000
  );
  return TRACK_START_ID + days;
}

/**
 * GET /api/dashboard?action=random     — random pending submitted track
 * GET /api/dashboard?action=view&trackId=405  — view a specific track by trackId
 * GET /api/dashboard?action=view&date=2026-03-16 — view track by date
 */
export async function GET(request: NextRequest) {
  const authErr = checkDashboardAuth(request);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "random";

  try {
    if (action === "random") {
      return await getRandomPendingTrack();
    } else if (action === "browse") {
      return await browseSubmittedTracks(searchParams);
    } else if (action === "view") {
      const trackIdParam = searchParams.get("trackId");
      const dateParam = searchParams.get("date");
      let trackId: number;

      if (trackIdParam) {
        trackId = parseInt(trackIdParam, 10);
      } else if (dateParam) {
        trackId = dateToTrackId(dateParam);
      } else {
        return NextResponse.json(
          { error: "Provide trackId or date" },
          { status: 400 }
        );
      }

      return await viewTrack(trackId);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Dashboard GET error:", error);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dashboard
 * Body: { action: "review", submittedTrackId, approved }
 *     | { action: "change", trackId, submittedTrackId }  — replace a day's track
 */
export async function POST(request: NextRequest) {
  const authErr = checkDashboardAuth(request);
  if (authErr) return authErr;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const action = body.action || "review";

    if (action === "review") {
      return await reviewTrack(body);
    } else if (action === "change") {
      return await changeTrack(body);
    } else if (action === "changeDirection") {
      return await changeDirection(body);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Dashboard POST error:", error);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}

// --- Handlers ---

async function getRandomPendingTrack() {
  // Pending = submitted tracks whose code has not yet been assigned to any
  // track function. Computed in JS so this works on any DB backend.
  const [submitted, assigned] = await Promise.all([
    prisma.submittedTrack.findMany({
      select: { id: true, name: true, trackCode: true, createdAt: true },
    }),
    prisma.trackFunction.findMany({ select: { trackFunction: true } }),
  ]);
  const usedCodes = new Set(assigned.map((t) => t.trackFunction));
  const pending = submitted.filter((st) => !usedCodes.has(st.trackCode));

  if (pending.length === 0) {
    return NextResponse.json(
      { error: "No pending tracks to review" },
      { status: 404 }
    );
  }

  const track = pending[Math.floor(Math.random() * pending.length)];
  return NextResponse.json({
    id: track.id.toString(),
    name: track.name,
    trackCode: track.trackCode,
    createdAt: track.createdAt,
    pendingCount: pending.length,
  });
}

async function viewTrack(trackId: number) {
  const trackFunc = await prisma.trackFunction.findFirst({
    where: { trackId },
    select: { trackId: true, trackFunction: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  if (!trackFunc) {
    return NextResponse.json(
      {
        trackId,
        date: trackIdToDate(trackId),
        exists: false,
        trackCode: null,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    trackId: trackFunc.trackId,
    date: trackIdToDate(trackFunc.trackId),
    exists: true,
    trackCode: trackFunc.trackFunction,
    createdAt: trackFunc.createdAt,
  });
}

async function reviewTrack(body: Record<string, unknown>) {
  const { submittedTrackId, approved } = body;
  if (!submittedTrackId || typeof approved !== "boolean") {
    return NextResponse.json(
      { error: "Missing submittedTrackId or approved" },
      { status: 400 }
    );
  }

  const submittedTrack = await prisma.submittedTrack.findUnique({
    where: { id: BigInt(submittedTrackId as string) },
  });

  if (!submittedTrack) {
    return NextResponse.json(
      { error: "Submitted track not found" },
      { status: 404 }
    );
  }

  if (!approved) {
    await prisma.submittedTrack.delete({
      where: { id: BigInt(submittedTrackId as string) },
    });
    return NextResponse.json({
      success: true,
      action: "rejected_and_removed",
    });
  }

  const todayTrackId = dateToTrackId(new Date().toISOString().split("T")[0]);

  // Find all assigned track IDs from today onwards, then pick the first gap
  const assignedFromToday = await prisma.trackFunction.findMany({
    where: { trackId: { gte: todayTrackId } },
    select: { trackId: true },
    orderBy: { trackId: "asc" },
  });
  const assignedSet = new Set(assignedFromToday.map((t) => t.trackId));

  let nextTrackId = todayTrackId;
  while (assignedSet.has(nextTrackId)) {
    nextTrackId++;
  }

  await prisma.trackFunction.create({
    data: {
      trackId: nextTrackId,
      trackFunction: submittedTrack.trackCode,
    },
  });

  return NextResponse.json({
    success: true,
    action: "approved",
    trackId: nextTrackId,
    date: trackIdToDate(nextTrackId),
  });
}

async function browseSubmittedTracks(searchParams: URLSearchParams) {
  const cursor = searchParams.get("cursor"); // submitted track ID to start after
  const direction = searchParams.get("dir") || "next"; // "next" or "prev"
  const limit = 1;

  let track;
  if (!cursor) {
    // Random track
    const all = await prisma.submittedTrack.findMany({
      select: { id: true, name: true, trackCode: true, createdAt: true },
    });
    if (all.length > 0) {
      track = all[Math.floor(Math.random() * all.length)];
    }
  } else if (direction === "next") {
    track = await prisma.submittedTrack.findFirst({
      where: { id: { gt: BigInt(cursor) } },
      select: { id: true, name: true, trackCode: true, createdAt: true },
      orderBy: { id: "asc" },
      take: limit,
    });
    // Wrap around
    if (!track) {
      track = await prisma.submittedTrack.findFirst({
        select: { id: true, name: true, trackCode: true, createdAt: true },
        orderBy: { id: "asc" },
      });
    }
  } else {
    track = await prisma.submittedTrack.findFirst({
      where: { id: { lt: BigInt(cursor) } },
      select: { id: true, name: true, trackCode: true, createdAt: true },
      orderBy: { id: "desc" },
      take: limit,
    });
    // Wrap around
    if (!track) {
      track = await prisma.submittedTrack.findFirst({
        select: { id: true, name: true, trackCode: true, createdAt: true },
        orderBy: { id: "desc" },
      });
    }
  }

  if (!track) {
    return NextResponse.json({ error: "No submitted tracks" }, { status: 404 });
  }

  const total = await prisma.submittedTrack.count();

  return NextResponse.json({
    id: track.id.toString(),
    name: track.name,
    trackCode: track.trackCode,
    createdAt: track.createdAt,
    totalSubmitted: total,
  });
}

async function changeTrack(body: Record<string, unknown>) {
  const { trackId, submittedTrackId, trackCode: rawTrackCode } = body;

  const tid = Number(trackId);
  if (!trackId || isNaN(tid) || tid <= 0) {
    return NextResponse.json({ error: "Invalid trackId" }, { status: 400 });
  }

  let code: string;

  if (rawTrackCode && typeof rawTrackCode === "string") {
    // Direct track code provided (from browse picker)
    code = rawTrackCode;
  } else if (submittedTrackId) {
    const submittedTrack = await prisma.submittedTrack.findUnique({
      where: { id: BigInt(submittedTrackId as string) },
    });
    if (!submittedTrack) {
      return NextResponse.json(
        { error: "Submitted track not found" },
        { status: 404 }
      );
    }
    code = submittedTrack.trackCode;
  } else {
    return NextResponse.json(
      { error: "Provide submittedTrackId or trackCode" },
      { status: 400 }
    );
  }

  // Delete existing track_function for this trackId, then insert new one
  await prisma.trackFunction.deleteMany({ where: { trackId: tid } });
  await prisma.trackFunction.create({
    data: {
      trackId: tid,
      trackFunction: code,
    },
  });

  return NextResponse.json({
    success: true,
    action: "changed",
    trackId: tid,
    date: trackIdToDate(tid),
  });
}

async function changeDirection(body: Record<string, unknown>) {
  const { trackId, angle } = body;

  const tid = Number(trackId);
  if (!trackId || isNaN(tid) || tid <= 0) {
    return NextResponse.json({ error: "Invalid trackId" }, { status: 400 });
  }

  const newAngle = Number(angle);
  if (isNaN(newAngle) || newAngle < 0 || newAngle >= 360) {
    return NextResponse.json(
      { error: "Angle must be between 0 and 359" },
      { status: 400 }
    );
  }

  const trackFunc = await prisma.trackFunction.findFirst({
    where: { trackId: tid },
    orderBy: { createdAt: "desc" },
  });

  if (!trackFunc) {
    return NextResponse.json(
      { error: "Track not found" },
      { status: 404 }
    );
  }

  // Replace the angle value in the first checkpoint of the track code
  // The angle appears as "angle: <number>" in the first checkpoint object
  const updatedCode = trackFunc.trackFunction.replace(
    /angle:\s*[\d.]+/,
    `angle: ${newAngle}`
  );

  if (updatedCode === trackFunc.trackFunction && newAngle !== parseFloat(trackFunc.trackFunction.match(/angle:\s*([\d.]+)/)?.[1] ?? "")) {
    return NextResponse.json(
      { error: "Could not find angle in track code" },
      { status: 400 }
    );
  }

  await prisma.trackFunction.deleteMany({ where: { trackId: tid } });
  await prisma.trackFunction.create({
    data: {
      trackId: tid,
      trackFunction: updatedCode,
    },
  });

  return NextResponse.json({
    success: true,
    action: "directionChanged",
    trackId: tid,
    angle: newAngle,
    date: trackIdToDate(tid),
  });
}
