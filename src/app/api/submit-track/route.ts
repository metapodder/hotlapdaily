import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// POST /api/submit-track
// Body: { name: string, code: string }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!name || !code) {
      return NextResponse.json({ error: "Missing name or code" }, { status: 400 });
    }

    // Create the submitted track record using Prisma
    try {
      await prisma.submittedTrack.create({
        data: {
          name,
          trackCode: code,
        },
      });

      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      console.log("error--->", error)
      // Handle duplicate key constraint or other database errors
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return NextResponse.json({ success: false, reason: "duplicate" }, { status: 409 });
      }
      
      console.error('Database error:', error);
      const errorMessage = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' 
        ? error.message 
        : 'Unknown database error';
      return NextResponse.json(
        { error: "Database error", details: errorMessage },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}


